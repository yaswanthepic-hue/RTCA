const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

const toPublicUser = (user) => ({
  id: user._id,
  username: user.username,
  displayName: user.displayName,
  email: user.email,
  avatar: user.avatar,
  isPrivate: user.isPrivate,
  allowGroupAdd: user.allowGroupAdd
});

// Register
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

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

    const token = generateToken(user._id);

    res.status(201).json({ token, user: toPublicUser(user) });
  } catch (error) {
    if (error.name === 'ValidationError') {
      console.error('Validation Error:', error.errors);
      return res.status(400).json({ error: Object.values(error.errors).map(e => e.message).join(', ') });
    }
    console.error('Register error details:', error);
    res.status(500).json({ error: error.message || 'Server error during registration' });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    const loginId = identifier || email;

    if (!loginId || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' });
    }

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId);
    const query = isEmail ? { email: loginId } : { username: loginId };

    const user = await User.findOne(query);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.status = 'online';
    await user.save();

    const token = generateToken(user._id);

    res.json({ token, user: toPublicUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
};

// Get current user
exports.getMe = async (req, res) => {
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
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { displayName, isPrivate, allowGroupAdd } = req.body;

    if (displayName !== undefined) req.user.displayName = displayName;
    if (isPrivate !== undefined) req.user.isPrivate = isPrivate;
    if (allowGroupAdd !== undefined) req.user.allowGroupAdd = allowGroupAdd;

    await req.user.save();

    res.json({ user: toPublicUser(req.user) });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Upload profile picture
exports.uploadAvatar = async (req, res) => {
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
};

// Block user
exports.blockUser = async (req, res) => {
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
};

// Unblock user
exports.unblockUser = async (req, res) => {
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
};

// Get blocked users
exports.getBlockedUsers = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('blockedUsers', 'username displayName avatar');

    res.json({ blockedUsers: user.blockedUsers });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Pin chat
exports.pinChat = async (req, res) => {
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
};

// Unpin chat
exports.unpinChat = async (req, res) => {
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
};

// Star message
exports.starMessage = async (req, res) => {
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
};

// Unstar message
exports.unstarMessage = async (req, res) => {
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
};

// Get starred messages
exports.getStarredMessages = async (req, res) => {
  try {
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
};

// Logout
exports.logout = async (req, res) => {
  try {
    req.user.status = 'offline';
    req.user.lastSeen = Date.now();
    await req.user.save();

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};