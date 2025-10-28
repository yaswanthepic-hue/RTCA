const express = require('express');
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|mp3|wav|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Get conversation between two users
router.get('/conversation/:userId', auth, async (req, res) => {
  try {
    const otherUserId = req.params.userId;

    const messages = await Message.find({
      $or: [
        { sender: req.userId, recipient: otherUserId },
        { sender: otherUserId, recipient: req.userId }
      ]
    })
    .populate('sender', 'username avatar')
    .populate('recipient', 'username avatar')
    .sort({ createdAt: 1 })
    .limit(100);

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all conversations for current user
router.get('/conversations', auth, async (req, res) => {
  try {
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: req.user._id },
            { recipient: req.user._id }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', req.user._id] },
              '$recipient',
              '$sender'
            ]
          },
          lastMessage: { $first: '$$ROOT' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          _id: 1,
          lastMessage: 1,
          user: {
            _id: 1,
            username: 1,
            avatar: 1,
            status: 1,
            lastSeen: 1
          }
        }
      }
    ]);

    res.json(conversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark all messages from a user as read
router.put('/conversation/:userId/read', auth, async (req, res) => {
  try {
    const result = await Message.updateMany(
      {
        sender: req.params.userId,
        recipient: req.userId,
        isRead: false
      },
      {
        isRead: true,
        readAt: Date.now()
      }
    );

    res.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Mark conversation read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark message as read
router.put('/:messageId/read', auth, async (req, res) => {
  try {
    const message = await Message.findOneAndUpdate(
      { _id: req.params.messageId, recipient: req.userId },
      { isRead: true, readAt: Date.now() },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(message);
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload file
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    res.json({
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Pin message
router.post('/:messageId/pin', auth, async (req, res) => {
  try {
    const message = await Message.findOne({
      _id: req.params.messageId,
      $or: [
        { sender: req.userId },
        { recipient: req.userId }
      ]
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    message.isPinned = true;
    await message.save();

    res.json({ message: 'Message pinned successfully' });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unpin message
router.post('/:messageId/unpin', auth, async (req, res) => {
  try {
    const message = await Message.findOne({
      _id: req.params.messageId,
      $or: [
        { sender: req.userId },
        { recipient: req.userId }
      ]
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    message.isPinned = false;
    await message.save();

    res.json({ message: 'Message unpinned successfully' });
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get pinned messages for a conversation
router.get('/conversation/:userId/pinned', auth, async (req, res) => {
  try {
    const otherUserId = req.params.userId;

    const messages = await Message.find({
      $or: [
        { sender: req.userId, recipient: otherUserId },
        { sender: otherUserId, recipient: req.userId }
      ],
      isPinned: true
    })
      .populate('sender', 'username displayName avatar')
      .populate('recipient', 'username displayName avatar')
      .sort({ createdAt: -1 });

    res.json({ messages });
  } catch (error) {
    console.error('Get pinned messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get shared media for a conversation
router.get('/conversation/:userId/media', auth, async (req, res) => {
  try {
    const otherUserId = req.params.userId;

    const messages = await Message.find({
      $or: [
        { sender: req.userId, recipient: otherUserId },
        { sender: otherUserId, recipient: req.userId }
      ],
      messageType: { $in: ['image', 'video', 'audio', 'file'] }
    })
      .populate('sender', 'username displayName avatar')
      .populate('recipient', 'username displayName avatar')
      .sort({ createdAt: -1 });

    res.json({ messages });
  } catch (error) {
    console.error('Get shared media error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get unread message count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      recipient: req.userId,
      isRead: false
    });

    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get unread count per conversation
router.get('/unread-per-conversation', auth, async (req, res) => {
  try {
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          recipient: req.user._id,
          isRead: false
        }
      },
      {
        $group: {
          _id: '$sender',
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {};
    unreadCounts.forEach(item => {
      result[item._id] = item.count;
    });

    res.json({ unreadCounts: result });
  } catch (error) {
    console.error('Get unread per conversation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete message (only sender can delete their own messages)
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const message = await Message.findOne({
      _id: req.params.messageId,
      sender: req.userId
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    // If message has a file, delete the file from disk
    if (message.fileUrl) {
      const filePath = path.join(__dirname, '..', message.fileUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await Message.deleteOne({ _id: req.params.messageId });

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
