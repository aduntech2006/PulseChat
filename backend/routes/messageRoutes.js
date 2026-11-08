import express from 'express';
import sql from '../utils/database.js';

const router = express.Router();

// Get all users (for sidebar)
router.get('/users', async (req, res) => {
  try {
    const users = await sql`
      SELECT id, username, last_seen 
      FROM chat_users 
      ORDER BY username
    `;
    
    // Add online status (would need socket integration)
    const usersWithStatus = users.map(user => ({
      ...user,
      isOnline: false // Will be updated by socket
    }));

    res.json(usersWithStatus);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get general chat messages
router.get('/general', async (req, res) => {
  try {
    const messages = await sql`
      SELECT 
        m.*,
        u.username as sender_name,
        reply_msg.message as reply_message,
        reply_user.username as reply_sender_name
      FROM chat_messages m
      JOIN chat_users u ON m.sender_id = u.id
      LEFT JOIN chat_messages reply_msg ON m.reply_to = reply_msg.id
      LEFT JOIN chat_users reply_user ON reply_msg.sender_id = reply_user.id
      WHERE m.recipient_id IS NULL
      ORDER BY m.created_at ASC
    `;

    res.json(messages);
  } catch (error) {
    console.error('Get general messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get private messages between two users
router.get('/private/:otherUserId', async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const { currentUserId } = req.query;

    if (!currentUserId) {
      return res.status(400).json({ error: 'Current user ID is required' });
    }

    const messages = await sql`
      SELECT 
        m.*,
        u.username as sender_name,
        reply_msg.message as reply_message,
        reply_user.username as reply_sender_name
      FROM chat_messages m
      JOIN chat_users u ON m.sender_id = u.id
      LEFT JOIN chat_messages reply_msg ON m.reply_to = reply_msg.id
      LEFT JOIN chat_users reply_user ON reply_msg.sender_id = reply_user.id
      WHERE m.recipient_id IS NOT NULL
        AND (
          (m.sender_id = ${currentUserId} AND m.recipient_id = ${otherUserId})
          OR 
          (m.sender_id = ${otherUserId} AND m.recipient_id = ${currentUserId})
        )
      ORDER BY m.created_at ASC
    `;

    res.json(messages);
  } catch (error) {
    console.error('Get private messages error:', error);
    res.status(500).json({ error: 'Failed to fetch private messages' });
  }
});

// Send message (REST fallback)
router.post('/send', async (req, res) => {
  try {
    const { 
      sender_id, 
      recipient_id, 
      message, 
      message_type = 'text', 
      media_url = null, 
      voice_duration = null, 
      reply_to = null 
    } = req.body;

    if (!sender_id || !message) {
      return res.status(400).json({ error: 'Sender ID and message are required' });
    }

    const result = await sql`
      INSERT INTO chat_messages (
        sender_id, 
        recipient_id, 
        message, 
        message_type, 
        media_url, 
        voice_duration, 
        reply_to
      )
      VALUES (
        ${sender_id}, 
        ${recipient_id || null}, 
        ${message}, 
        ${message_type}, 
        ${media_url}, 
        ${voice_duration}, 
        ${reply_to}
      )
      RETURNING *
    `;

    const senderInfo = await sql`
      SELECT username FROM chat_users WHERE id = ${sender_id}
    `;

    const savedMessage = {
      ...result[0],
      sender_name: senderInfo[0].username
    };

    res.status(201).json(savedMessage);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Edit message (REST fallback)
router.put('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const result = await sql`
      UPDATE chat_messages 
      SET message = ${message}, edited_at = NOW() 
      WHERE id = ${messageId} 
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// Delete message (REST fallback)
router.delete('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    // Get message info before deletion
    const messageResult = await sql`
      SELECT media_url FROM chat_messages WHERE id = ${messageId}
    `;

    if (messageResult.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Delete associated file if exists
    const message = messageResult[0];
    if (message.media_url) {
      const filePath = path.join(process.cwd(), message.media_url);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (fileError) {
          console.warn('Could not delete file:', fileError.message);
        }
      }
    }

    // Delete from database
    await sql`DELETE FROM chat_messages WHERE id = ${messageId}`;

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Add reaction to message
router.post('/:messageId/react', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { user_id, emoji } = req.body;

    if (!user_id || !emoji) {
      return res.status(400).json({ error: 'User ID and emoji are required' });
    }

    // Get current reactions
    const messageResult = await sql`
      SELECT reactions FROM chat_messages WHERE id = ${messageId}
    `;

    if (messageResult.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const currentReactions = messageResult[0].reactions || {};
    if (!currentReactions[emoji]) {
      currentReactions[emoji] = [];
    }
    if (!currentReactions[emoji].includes(user_id)) {
      currentReactions[emoji].push(user_id);
    }

    // Update reactions in DB
    const updated = await sql`
      UPDATE chat_messages
      SET reactions = ${currentReactions}
      WHERE id = ${messageId}
      RETURNING *
    `;

    res.json(updated[0]);
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// Export the router
export default router;
