const path = require('path');
const fs = require('fs');
const Message = require('../models/Message');

// Get conversation between two users
exports.getConversation = async (req, res) => {
  try {
    const otherUserId = req.params.userId;

    const messages = await Message.find({
      $or: [
        { sender: req.userId, recipient: otherUserId },
        { sender: otherUserId, recipient: req.userId }
      ],
      deletedFor: { $nin: [req.userId] }
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
};

// Get all conversations for current user
exports.getConversations = async (req, res) => {
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
      { $sort: { createdAt: -1 } },
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
      { $unwind: '$user' },
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
};

// Mark all messages from a user as read
exports.markConversationRead = async (req, res) => {
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

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error('Mark conversation read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Mark message as read
exports.markMessageRead = async (req, res) => {
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
};

// Upload file
exports.uploadFile = async (req, res) => {
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
};

// Pin message
exports.pinMessage = async (req, res) => {
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

    const io = req.app.get('io');
    io.to(message.sender.toString()).to(message.recipient.toString()).emit('messageUpdate', message);

    res.json({ message: 'Message pinned successfully', data: message });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Unpin message
exports.unpinMessage = async (req, res) => {
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

    const io = req.app.get('io');
    io.to(message.sender.toString()).to(message.recipient.toString()).emit('messageUpdate', message);

    res.json({ message: 'Message unpinned successfully', data: message });
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get pinned messages for a conversation
exports.getPinnedMessages = async (req, res) => {
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
};

// Get shared media for a conversation
exports.getSharedMedia = async (req, res) => {
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
};

// Get unread message count
exports.getUnreadCount = async (req, res) => {
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
};

// Get unread count per conversation
exports.getUnreadPerConversation = async (req, res) => {
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
};

// Delete message (only sender can delete for everyone; recipient can only hide)
exports.deleteMessage = async (req, res) => {
  try {
    // Only allow participants of this message to delete it
    const message = await Message.findOne({
      _id: req.params.messageId,
      $or: [{ sender: req.userId }, { recipient: req.userId }]
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    const isSender = message.sender.toString() === req.userId;

    if (isSender) {
      // Sender → delete for everyone (hard delete + broadcast)
      if (message.fileUrl) {
        const filePath = path.join(__dirname, '..', message.fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      await Message.deleteOne({ _id: req.params.messageId });

      const io = req.app.get('io');
      io.to(message.sender.toString())
        .to(message.recipient.toString())
        .emit('messageDeleted', { messageId: req.params.messageId });

      return res.json({ message: 'Message deleted for everyone', deletedForEveryone: true });
    }

    // Recipient → soft-delete for themselves only (hide the message)
    const alreadyHidden = message.deletedFor.some((id) => id.toString() === req.userId);
    if (!alreadyHidden) {
      message.deletedFor.push(req.userId);
      await message.save();
    }

    res.json({ message: 'Message deleted for you', deletedForEveryone: false });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};