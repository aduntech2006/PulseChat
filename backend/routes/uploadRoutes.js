import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sql from '../utils/database.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
  }
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types for now
    cb(null, true);
  }
});

// Upload file and save message
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { 
      sender_id, 
      chatType, 
      recipient_id, 
      message_type = 'file',
      reply_to = null
    } = req.body;

    if (!sender_id) {
      return res.status(400).json({ error: 'Sender ID is required' });
    }

    // Create file URL
    const fileUrl = `/uploads/${req.file.filename}`;
    
    // Determine message text based on type
    let messageText = req.file.originalname;
    if (message_type === 'image') {
      messageText = `📷 ${req.file.originalname}`;
    } else if (message_type === 'voice') {
      messageText = `🎵 Voice note`;
    } else {
      messageText = `📎 ${req.file.originalname}`;
    }

    // Save message to database
    const result = await sql`
      INSERT INTO chat_messages (
        sender_id,
        recipient_id,
        message,
        message_type,
        media_url,
        reply_to,
        created_at
      )
      VALUES (
        ${sender_id},
        ${chatType === "general" ? null : recipient_id || null},
        ${messageText},
        ${message_type},
        ${fileUrl},
        ${reply_to},
        NOW()
      )
      RETURNING *
    `;

    // Get sender info
    const senderInfo = await sql`
      SELECT username FROM chat_users WHERE id = ${sender_id}
    `;

    const savedMessage = {
      ...result[0],
      sender_name: senderInfo[0].username,
      status: "sent"
    };

    // Return success response
    res.status(201).json({
      success: true,
      message: savedMessage,
      fileInfo: {
        url: fileUrl,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });

    console.log(`File uploaded: ${req.file.originalname} by user ${sender_id}`);

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up uploaded file if database save failed
    if (req.file) {
      const filePath = path.join(process.cwd(), 'uploads', req.file.filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupError) {
          console.warn('Could not clean up uploaded file:', cleanupError);
        }
      }
    }

    res.status(500).json({ 
      error: 'Upload failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get file info (for file messages)
router.get('/info/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(process.cwd(), 'uploads', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stats = fs.statSync(filePath);
    const fileInfo = {
      filename,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    };

    res.json(fileInfo);
  } catch (error) {
    console.error('Get file info error:', error);
    res.status(500).json({ error: 'Failed to get file info' });
  }
});

export default router;