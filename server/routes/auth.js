const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  console.log('Register request received:', req.body);
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create user
    const user = new User({
      username,
      displayName: username,
      email,
      password,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      isPrivate: false,
      allowGroupAdd: 'everyone'
    });

    await user.save();

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        avatar: user.avatar,
        isPrivate: user.isPrivate,
        allowGroupAdd: user.allowGroupAdd
      }
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      console.error('Validation Error:', error.errors);
      return res.status(400).json({ error: Object.values(error.errors).map(e => e.message).join(', ') });
    }
    console.error('Register error details:', error);
    res.status(500).json({ error: error.message || 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    const loginId = identifier || email;

    console.log('LOGIN ATTEMPT — body keys:', Object.keys(req.body), '| loginId:', loginId);

    // Validation
    if (!loginId || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' });
    }

    // Detect whether loginId is an email or username
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId);
    const query = isEmail ? { email: loginId } : { username: loginId };

    console.log('DB query:', query);

    // Find user
    const user = await User.findOne(query);
    console.log('User found:', user ? user.email : 'null');

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    console.log('Password match:', isMatch);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update status
    user.status = 'online';
    await user.save();

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        avatar: user.avatar,
        isPrivate: user.isPrivate,
        allowGroupAdd: user.allowGroupAdd
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        username: req.user.username,
        displayName: req.user.displayName,
        email: req.user.email,
        avatar: req.user.avatar,
        status: req.user.status,
        isPrivate: req.user.isPrivate,
        allowGroupAdd: req.user.allowGroupAdd,
        blockedUsers: req.user.blockedUsers,
        pinnedChats: req.user.pinnedChats,
        starredMessages: req.user.starredMessages
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { displayName, isPrivate, allowGroupAdd } = req.body;

    if (displayName !== undefined) req.user.displayName = displayName;
    if (isPrivate !== undefined) req.user.isPrivate = isPrivate;
    if (allowGroupAdd !== undefined) req.user.allowGroupAdd = allowGroupAdd;

    await req.user.save();

    res.json({
      user: {
        id: req.user._id,
        username: req.user.username,
        displayName: req.user.displayName,
        email: req.user.email,
        avatar: req.user.avatar,
        isPrivate: req.user.isPrivate,
        allowGroupAdd: req.user.allowGroupAdd
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload profile picture
router.post('/upload-avatar', auth, async (req, res) => {
  try {
    const { avatar } = req.body;

    if (!avatar) {
      return res.status(400).json({ error: 'Avatar URL is required' });
    }

    req.user.avatar = avatar;
    await req.user.save();

    res.json({ avatar: req.user.avatar });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Block user
router.post('/block/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!req.user.blockedUsers.includes(userId)) {
      req.user.blockedUsers.push(userId);
      await req.user.save();
    }

    res.json({ message: 'User blocked successfully' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unblock user
router.post('/unblock/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    req.user.blockedUsers = req.user.blockedUsers.filter(
      id => id.toString() !== userId
    );
    await req.user.save();

    res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get blocked users
router.get('/blocked', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('blockedUsers', 'username displayName avatar');

    res.json({ blockedUsers: user.blockedUsers });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Pin chat
router.post('/pin-chat/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!req.user.pinnedChats.includes(userId)) {
      req.user.pinnedChats.push(userId);
      await req.user.save();
    }

    res.json({ message: 'Chat pinned successfully' });
  } catch (error) {
    console.error('Pin chat error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unpin chat
router.post('/unpin-chat/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    req.user.pinnedChats = req.user.pinnedChats.filter(
      id => id.toString() !== userId
    );
    await req.user.save();

    res.json({ message: 'Chat unpinned successfully' });
  } catch (error) {
    console.error('Unpin chat error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Star message
router.post('/star-message/:messageId', auth, async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!req.user.starredMessages.includes(messageId)) {
      req.user.starredMessages.push(messageId);
      await req.user.save();
    }

    res.json({ message: 'Message starred successfully' });
  } catch (error) {
    console.error('Star message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unstar message
router.post('/unstar-message/:messageId', auth, async (req, res) => {
  try {
    const { messageId } = req.params;

    req.user.starredMessages = req.user.starredMessages.filter(
      id => id.toString() !== messageId
    );
    await req.user.save();

    res.json({ message: 'Message unstarred successfully' });
  } catch (error) {
    console.error('Unstar message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get starred messages
router.get('/starred-messages', auth, async (req, res) => {
  try {
    const Message = require('../models/Message');
    const messages = await Message.find({
      _id: { $in: req.user.starredMessages }
    })
      .populate('sender', 'username displayName avatar')
      .populate('recipient', 'username displayName avatar')
      .sort({ createdAt: -1 });

    res.json({ messages });
  } catch (error) {
    console.error('Get starred messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout
router.post('/logout', auth, async (req, res) => {
  try {
    req.user.status = 'offline';
    req.user.lastSeen = Date.now();
    await req.user.save();

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;