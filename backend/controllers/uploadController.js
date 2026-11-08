// controllers/uploadController.js
import path from 'path';
import { query } from '../utils/database.js';

export const uploadFile = async (req, res) => {
  try {
    console.log('Upload request received:', req.body);
    console.log('File:', req.file);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { sender_id, chatType, recipient_id, message_type, voice_duration } = req.body;
    const file = req.file;
    const media_url = `/uploads/${file.filename}`;

    console.log('Processing upload:', { sender_id, chatType, message_type, media_url });

    // Create message text based on file type
    let messageText;
    if (message_type === 'image') {
      messageText = file.originalname || 'Image';
    } else if (message_type === 'voice') {
      messageText = `Voice note (${voice_duration || 0}s)`;
    } else {
      messageText = file.originalname || 'File';
    }

    // Insert message into database
    let insertQuery;
    let values;

    if (chatType === 'general') {
      insertQuery = `
        INSERT INTO chat_messages (sender_id, message, message_type, media_url, voice_duration, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *, 
        (SELECT username FROM chat_users WHERE id = sender_id) as sender_name
      `;
      values = [sender_id, messageText, message_type, media_url, voice_duration || null];
    } else {
      insertQuery = `
        INSERT INTO chat_messages (sender_id, recipient_id, message, message_type, media_url, voice_duration, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *, 
        (SELECT username FROM chat_users WHERE id = sender_id) as sender_name
      `;
      values = [sender_id, recipient_id, messageText, message_type, media_url, voice_duration || null];
    }

    const result = await query(insertQuery, values);
    const message = result.rows[0];

    console.log('Message created:', message.id);

    // Emit to socket for real-time updates
    const io = req.app.get('io');
    if (io) {
      if (chatType === 'general') {
        io.emit('new-message', message);
      } else {
        // Get connected users and emit to sender and recipient
        const connectedUsers = req.app.get('connectedUsers') || new Map();
        const recipientSocketId = connectedUsers.get(parseInt(recipient_id));
        const senderSocketId = connectedUsers.get(parseInt(sender_id));
        
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('new-message', message);
        }
        if (senderSocketId) {
          io.to(senderSocketId).emit('new-message', message);
        }
      }
    }

    res.json({
      success: true,
      message: message,
      media_url: media_url
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Upload failed'
    });
  }
};