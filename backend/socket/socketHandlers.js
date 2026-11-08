// socket/socketHandlers.js - Enhanced with WhatsApp-like features
import sql from '../utils/database.js';
import path from 'path';
import fs from 'fs';

// Store active connections
const onlineUsers = new Map(); // userId -> socketId
const typingUsers = new Map(); // chatKey -> Set(userIds)
const userSockets = new Map(); // socketId -> userId
const userProfiles = new Map(); // userId -> {username, ...}

export const setupSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    // User comes online
    socket.on("user-online", async (userId) => {
      const numUserId = parseInt(userId);
      onlineUsers.set(numUserId, socket.id);
      userSockets.set(socket.id, numUserId);
      
      // Get user profile for typing indicators
      try {
        const userResult = await sql`SELECT username FROM chat_users WHERE id = ${numUserId}`;
        if (userResult.length > 0) {
          userProfiles.set(numUserId, userResult[0]);
        }
      } catch (err) {
        console.error('Error fetching user profile:', err);
      }
      
      // Notify others user is online
      socket.broadcast.emit("user-status-change", { 
        userId: numUserId, 
        status: "online" 
      });
      
      console.log(`User ${numUserId} is now online`);
    });

    // ENHANCED: Typing indicators with actual usernames
    socket.on("typing-start", ({ userId, username, chatType, recipientId }) => {
      const numUserId = parseInt(userId);
      const chatKey = chatType === "general" 
        ? "general" 
        : `private_${Math.min(numUserId, recipientId)}_${Math.max(numUserId, recipientId)}`;
      
      if (!typingUsers.has(chatKey)) {
        typingUsers.set(chatKey, new Set());
      }
      typingUsers.get(chatKey).add(numUserId);

      const actualUsername = username || userProfiles.get(numUserId)?.username || `User ${numUserId}`;

      if (chatType === "general") {
        socket.broadcast.emit("user-typing", { 
          userId: numUserId, 
          typing: true, 
          username: actualUsername,
          chatType, 
          chatId: "general" 
        });
      } else {
        const recipientSocket = onlineUsers.get(parseInt(recipientId));
        if (recipientSocket) {
          socket.to(recipientSocket).emit("user-typing", { 
            userId: numUserId, 
            typing: true, 
            username: actualUsername,
            chatType, 
            chatId: recipientId 
          });
        }
      }
    });

    socket.on("typing-stop", ({ userId, username, chatType, recipientId }) => {
      const numUserId = parseInt(userId);
      const chatKey = chatType === "general" 
        ? "general" 
        : `private_${Math.min(numUserId, recipientId)}_${Math.max(numUserId, recipientId)}`;
      
      const typingSet = typingUsers.get(chatKey);
      if (typingSet) {
        typingSet.delete(numUserId);
        if (typingSet.size === 0) {
          typingUsers.delete(chatKey);
        }
      }

      const actualUsername = username || userProfiles.get(numUserId)?.username || `User ${numUserId}`;

      if (chatType === "general") {
        socket.broadcast.emit("user-typing", { 
          userId: numUserId, 
          typing: false, 
          username: actualUsername,
          chatType, 
          chatId: "general" 
        });
      } else {
        const recipientSocket = onlineUsers.get(parseInt(recipientId));
        if (recipientSocket) {
          socket.to(recipientSocket).emit("user-typing", { 
            userId: numUserId, 
            typing: false, 
            username: actualUsername,
            chatType, 
            chatId: recipientId 
          });
        }
      }
    });

    // Send message with enhanced status tracking
    socket.on("send-message", async (data) => {
      try {
        const { 
          tempId, 
          sender_id, 
          message, 
          chatType, 
          recipient_id, 
          replyTo, 
          message_type = 'text', 
          media_url = null, 
          voice_duration = null 
        } = data;

        const result = await sql`
          INSERT INTO chat_messages (
            sender_id, 
            recipient_id, 
            message, 
            reply_to, 
            message_type, 
            media_url, 
            voice_duration
          )
          VALUES (
            ${sender_id}, 
            ${chatType === "general" ? null : recipient_id}, 
            ${message}, 
            ${replyTo || null}, 
            ${message_type}, 
            ${media_url}, 
            ${voice_duration ? parseInt(voice_duration) : null}
          )
          RETURNING *
        `;

        const senderInfo = await sql`
          SELECT username FROM chat_users WHERE id = ${sender_id}
        `;

        const savedMessage = {
          ...result[0],
          sender_name: senderInfo[0].username,
          status: "sent",
          reactions: [] // ensure all new messages have reactions initialized
        };

        socket.emit("message-delivered", { 
          tempId, 
          messageId: savedMessage.id, 
          status: "delivered" 
        });

        if (chatType === "general") {
          socket.broadcast.emit("new-message", savedMessage);
        } else {
          const recipientSocket = onlineUsers.get(parseInt(recipient_id));
          if (recipientSocket && recipientSocket !== socket.id) {
            socket.to(recipientSocket).emit("new-message", savedMessage);
          }
        }

        console.log(`Message sent: ${message_type} message from user ${sender_id}${voice_duration ? ` (${voice_duration}s voice)` : ''}`);
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit("message-error", { 
          tempId: data.tempId, 
          error: "Failed to send message" 
        });
      }
    });

    // Edit message
    socket.on("edit-message", async ({ messageId, newMessage }) => {
      try {
        const result = await sql`
          UPDATE chat_messages 
          SET message = ${newMessage}, edited_at = NOW() 
          WHERE id = ${messageId} 
          RETURNING *
        `;

        if (result.length === 0) {
          socket.emit("message-error", { messageId, error: "Message not found" });
          return;
        }

        const senderInfo = await sql`
          SELECT username FROM chat_users WHERE id = ${result[0].sender_id}
        `;

        const updatedMessage = {
          ...result[0],
          sender_name: senderInfo[0].username,
          edited: true
        };

        if (!result[0].recipient_id) {
          io.emit("message-edited", updatedMessage);
        } else {
          [result[0].sender_id, result[0].recipient_id].forEach((userId) => {
            const userSocket = onlineUsers.get(userId);
            if (userSocket) {
              socket.to(userSocket).emit("message-edited", updatedMessage);
            }
          });
          socket.emit("message-edited", updatedMessage);
        }
      } catch (error) {
        console.error('Edit message error:', error);
        socket.emit("message-error", { messageId, error: "Failed to edit message" });
      }
    });

    // ✅ FIXED: Add reaction with safety checks
    socket.on("add-reaction", async ({ messageId, emoji, userId, chatType, recipientId }) => {
      try {
        const messageResult = await sql`
          SELECT reactions, recipient_id, sender_id FROM chat_messages WHERE id = ${messageId}
        `;

        if (messageResult.length === 0) {
          socket.emit("message-error", { messageId, error: "Message not found" });
          return;
        }

        const message = messageResult[0];

        // 🩹 Ensure reactions is always an array
        let reactions;
        try {
          reactions = typeof message.reactions === "string"
            ? JSON.parse(message.reactions)
            : message.reactions;
        } catch {
          reactions = [];
        }
        if (!Array.isArray(reactions)) reactions = [];

        // Toggle reaction: remove if exists, else add
        const existing = reactions.find(r => r.user_id === parseInt(userId) && r.emoji === emoji);
        if (existing) {
          reactions = reactions.filter(r => !(r.user_id === parseInt(userId) && r.emoji === emoji));
        } else {
          reactions.push({ user_id: parseInt(userId), emoji });
        }

        await sql`
          UPDATE chat_messages 
          SET reactions = ${JSON.stringify(reactions)} 
          WHERE id = ${messageId}
        `;

        const reactionUpdate = { messageId: parseInt(messageId), reactions };

        if (!message.recipient_id) {
          io.emit("reaction-added", reactionUpdate);
        } else {
          [message.sender_id, message.recipient_id].forEach((uid) => {
            const userSocket = onlineUsers.get(uid);
            if (userSocket) {
              socket.to(userSocket).emit("reaction-added", reactionUpdate);
            }
          });
          socket.emit("reaction-added", reactionUpdate);
        }
      } catch (error) {
        console.error('Add reaction error:', error);
        socket.emit("message-error", { messageId, error: "Failed to add reaction" });
      }
    });

    // ENHANCED: Delete message with proper file cleanup
    socket.on("delete-message", async ({ messageId }) => {
      try {
        const messageResult = await sql`
          SELECT * FROM chat_messages WHERE id = ${messageId}
        `;

        if (messageResult.length === 0) {
          socket.emit("message-error", { messageId, error: "Message not found" });
          return;
        }

        const message = messageResult[0];

        if (message.media_url) {
          const filePath = path.join(process.cwd(), message.media_url);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              console.log(`Deleted file: ${filePath}`);
            } catch (fileError) {
              console.warn('Could not delete file:', fileError.message);
            }
          }
        }

        await sql`DELETE FROM chat_messages WHERE id = ${messageId}`;

        if (!message.recipient_id) {
          io.emit("message-deleted", { messageId: parseInt(messageId) });
        } else {
          [message.sender_id, message.recipient_id].forEach((userId) => {
            const userSocket = onlineUsers.get(userId);
            if (userSocket) {
              socket.to(userSocket).emit("message-deleted", { messageId: parseInt(messageId) });
            }
          });
          socket.emit("message-deleted", { messageId: parseInt(messageId) });
        }

        console.log(`Message ${messageId} deleted successfully`);
      } catch (error) {
        console.error('Delete message error:', error);
        socket.emit("message-error", { messageId, error: "Failed to delete message" });
      }
    });

    // Seen messages
    socket.on("mark-messages-seen", async ({ messageIds, chatType, chatId }) => {
      try {
        const numUserId = userSockets.get(socket.id);
        if (!numUserId) return;

        if (messageIds && messageIds.length > 0) {
          await sql`
            UPDATE chat_messages 
            SET status = 'seen', seen_at = NOW()
            WHERE id = ANY(${messageIds}) 
            AND recipient_id = ${numUserId}
          `;

          const messageResults = await sql`
            SELECT DISTINCT sender_id FROM chat_messages 
            WHERE id = ANY(${messageIds}) 
            AND recipient_id = ${numUserId}
          `;

          messageResults.forEach(({ sender_id }) => {
            const senderSocket = onlineUsers.get(sender_id);
            if (senderSocket) {
              socket.to(senderSocket).emit("messages-seen", { 
                messageIds, 
                seenBy: numUserId 
              });
            }
          });
        }
      } catch (error) {
        console.error('Mark messages seen error:', error);
      }
    });

    // Delivery confirmation
    socket.on("confirm-message-delivery", async ({ messageId }) => {
      try {
        await sql`
          UPDATE chat_messages 
          SET status = 'delivered', delivered_at = NOW()
          WHERE id = ${messageId}
        `;

        const messageResult = await sql`
          SELECT sender_id FROM chat_messages WHERE id = ${messageId}
        `;

        if (messageResult.length > 0) {
          const senderSocket = onlineUsers.get(messageResult[0].sender_id);
          if (senderSocket) {
            socket.to(senderSocket).emit("message-status-updated", {
              messageId: parseInt(messageId),
              status: "delivered"
            });
          }
        }
      } catch (error) {
        console.error('Confirm delivery error:', error);
      }
    });

    // User activity
    socket.on("user-activity", async () => {
      const userId = userSockets.get(socket.id);
      if (userId) {
        try {
          await sql`
            UPDATE chat_users 
            SET last_seen = NOW() 
            WHERE id = ${userId}
          `;
        } catch (error) {
          console.error('Update last seen error:', error);
        }
      }
    });

    // Disconnect handling
    socket.on("disconnect", async () => {
      const userId = userSockets.get(socket.id);
      if (!userId) return;

      try {
        await sql`
          UPDATE chat_users 
          SET last_seen = NOW() 
          WHERE id = ${userId}
        `;
      } catch (error) {
        console.error('Update last seen on disconnect error:', error);
      }

      onlineUsers.delete(userId);
      userSockets.delete(socket.id);
      userProfiles.delete(userId);

      socket.broadcast.emit("user-status-change", { 
        userId, 
        status: "offline" 
      });

      for (const [chatKey, typingSet] of typingUsers.entries()) {
        if (typingSet.delete(userId) && typingSet.size === 0) {
          typingUsers.delete(chatKey);
        }
      }

      socket.broadcast.emit("user-typing", { 
        userId, 
        typing: false 
      });

      console.log(`User ${userId} disconnected`);
    });

    socket.on("error", (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });

    socket.on("ping", () => {
      socket.emit("pong");
    });
  });

  io.getOnlineUsers = () => onlineUsers;
  io.getTypingUsers = () => typingUsers;
  io.getUserProfiles = () => userProfiles;
  
  setInterval(() => {
    console.log(`Active connections: ${io.sockets.sockets.size}`);
    console.log(`Online users: ${onlineUsers.size}`);
    console.log(`Active typing sessions: ${typingUsers.size}`);
  }, 300000);
};
