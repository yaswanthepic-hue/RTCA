require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/database');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const messageRequestRoutes = require('./routes/messageRequests');
const groupRoutes = require('./routes/groups');
const Message = require('./models/Message');
const Group = require('./models/Group');
const User = require('./models/User');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const allowedOrigins = [
  process.env.CLIENT_URL,
  'https://rtca-livid.vercel.app',
].filter(Boolean);

const corsOriginFn = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (/^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  callback(new Error('CORS blocked: ' + origin));
};

const io = socketIo(server, {
  cors: {
    origin: corsOriginFn,
    methods: ['GET', 'POST'],
    credentials: true
  },
  connectTimeout: 45000,
  pingTimeout: 60000,
  pingInterval: 25000
});

app.set('io', io);

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: corsOriginFn,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/message-requests', messageRequestRoutes);
app.use('/api/groups', groupRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'RTCA API Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      messages: '/api/messages',
      requests: '/api/message-requests'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Socket.IO connection handling
const connectedUsers = new Map();

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.userId = decoded.userId;
    socket.username = user.username;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.username} (${socket.userId})`);

  // Store socket connection
  connectedUsers.set(socket.userId, socket.id);

  // Update user status to online
  User.findByIdAndUpdate(socket.userId, { status: 'online' }).exec();

  // Broadcast user online status
  socket.broadcast.emit('userStatusChange', {
    userId: socket.userId,
    status: 'online'
  });

  // Join user to their own room
  socket.join(socket.userId);

  // Join all group rooms this user belongs to
  Group.find({ members: socket.userId }).select('_id').then(async (groups) => {
    const groupIds = groups.map((g) => g._id);
    groupIds.forEach((id) => socket.join(`group:${id}`));

    // Catch-up delivery: mark any messages sent to these groups while this
    // user was offline as delivered now, and let the senders know.
    try {
      const undelivered = await Message.find({
        group: { $in: groupIds },
        sender: { $ne: socket.userId },
        messageType: { $ne: 'system' },
        'deliveredTo.user': { $ne: socket.userId }
      });

      for (const msg of undelivered) {
        msg.deliveredTo.push({ user: socket.userId, deliveredAt: new Date() });
        await msg.save();
        io.to(msg.sender.toString()).emit('groupMessageStatusUpdate', {
          messageId: msg._id.toString(),
          groupId: msg.group.toString(),
          deliveredCount: msg.deliveredTo.length,
          readCount: msg.readBy.length
        });
      }
    } catch (err) {
      console.error('Catch-up group delivery error:', err);
    }
  }).catch((err) => console.error('Join group rooms error:', err));

  // Send message
  socket.on('sendMessage', async (data) => {
    try {
      const { recipientId, content, encryptedContent, messageType, fileUrl, fileName, fileSize } = data;

      // Check if recipient is online
      const recipientSocketId = connectedUsers.get(recipientId);
      const isRecipientOnline = !!recipientSocketId;

      // Save message to database
      const message = new Message({
        sender: socket.userId,
        recipient: recipientId,
        content: content || encryptedContent || '',  // empty string allowed for file-only messages
        encryptedContent: encryptedContent,
        messageType: messageType || 'text',
        fileUrl: fileUrl || '',
        fileName: fileName || '',
        fileSize: fileSize || 0,
        deliveredAt: isRecipientOnline ? Date.now() : null  // Only set if recipient is online
      });

      await message.save();

      // Populate sender and recipient info
      await message.populate('sender', 'username avatar');
      await message.populate('recipient', 'username avatar');

      // Send to recipient
      io.to(recipientId).emit('receiveMessage', message);

      // Also send to all OTHER of sender's tabs to keep them in sync
      socket.to(socket.userId).emit('receiveMessage', message);

      // Notify sender that message was delivered if recipient is online
      if (isRecipientOnline) {
        socket.emit('messageDelivered', {
          messageId: message._id,
          deliveredAt: message.deliveredAt
        });
      }

      // Send acknowledgment to sender (message sent/saved)
      socket.emit('messageSent', {
        tempId: data.tempId,
        message
      });

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('messageError', { error: 'Failed to send message' });
    }
  });

  // Typing indicator
  socket.on('typing', (data) => {
    io.to(data.recipientId).emit('userTyping', {
      userId: socket.userId,
      username: socket.username,
      isTyping: data.isTyping
    });
  });

  // Send group message
  socket.on('sendGroupMessage', async (data) => {
    try {
      const { groupId, content, messageType, fileUrl, fileName, fileSize, tempId } = data;

      const group = await Group.findById(groupId);
      if (!group || !group.members.some((m) => m.toString() === socket.userId)) {
        return socket.emit('messageError', { error: 'Not a member of this group' });
      }

      const message = new Message({
        sender: socket.userId,
        group: groupId,
        content: content || '',
        messageType: messageType || 'text',
        fileUrl: fileUrl || '',
        fileName: fileName || '',
        fileSize: fileSize || 0
      });

      // Mark as delivered to any other member who's currently online.
      const otherMemberIds = group.members
        .map((m) => m.toString())
        .filter((id) => id !== socket.userId);
      message.deliveredTo = otherMemberIds
        .filter((id) => connectedUsers.has(id))
        .map((id) => ({ user: id, deliveredAt: new Date() }));
      message.recipientCount = otherMemberIds.length;

      await message.save();
      await message.populate('sender', 'username displayName avatar');

      group.lastMessage = message._id;
      await group.save();

      // Broadcast to everyone else in the group room. The sender gets their
      // own copy via the 'groupMessageSent' ack below — emitting to the full
      // room here (including this socket) was causing sent messages to show
      // up twice on the sender's screen.
      socket.to(`group:${groupId}`).emit('receiveGroupMessage', message);

      socket.emit('groupMessageSent', { tempId, message });
    } catch (error) {
      console.error('Send group message error:', error);
      socket.emit('messageError', { error: 'Failed to send group message' });
    }
  });

  // Group typing indicator
  socket.on('groupTyping', (data) => {
    socket.to(`group:${data.groupId}`).emit('groupUserTyping', {
      groupId: data.groupId,
      userId: socket.userId,
      username: socket.username,
      isTyping: data.isTyping
    });
  });

  // Join a group room (e.g. right after being added/accepting an invite)
  socket.on('joinGroupRoom', (data) => {
    if (data?.groupId) socket.join(`group:${data.groupId}`);
  });

  // Mark message as read
  socket.on('markAsRead', async (data) => {
    try {
      const message = await Message.findByIdAndUpdate(
        data.messageId,
        {
          isRead: true,
          readAt: Date.now()
        },
        { new: true }
      );

      if (message) {
        // Notify sender that message was read
        // Notify sender that message was read
        io.to(message.sender.toString()).emit('messageStatusUpdate', {
          messageId: message._id,
          isRead: true,
          readAt: message.readAt
        });
      }
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  });

  // Message read receipt (legacy)
  socket.on('messageRead', async (data) => {
    try {
      await Message.findByIdAndUpdate(data.messageId, {
        isRead: true,
        readAt: Date.now()
      });

      io.to(data.senderId).emit('messageReadReceipt', {
        messageId: data.messageId,
        readAt: Date.now()
      });
    } catch (error) {
      console.error('Message read error:', error);
    }
  });

  // Mark a single group message as delivered+read by this user, and let the
  // sender know so their tick status can update in real time.
  socket.on('markGroupMessageRead', async (data) => {
    try {
      const { messageId } = data || {};
      if (!messageId) return;

      const message = await Message.findById(messageId);
      if (!message || !message.group) return;
      if (message.sender.toString() === socket.userId) return; // can't read your own message

      let changed = false;
      if (!message.deliveredTo.some((d) => d.user.toString() === socket.userId)) {
        message.deliveredTo.push({ user: socket.userId, deliveredAt: new Date() });
        changed = true;
      }
      if (!message.readBy.some((r) => r.user.toString() === socket.userId)) {
        message.readBy.push({ user: socket.userId, readAt: new Date() });
        changed = true;
      }

      if (changed) {
        await message.save();
        io.to(message.sender.toString()).emit('groupMessageStatusUpdate', {
          messageId: message._id.toString(),
          groupId: message.group.toString(),
          deliveredCount: message.deliveredTo.length,
          readCount: message.readBy.length
        });
      }
    } catch (error) {
      console.error('Mark group message read error:', error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${socket.username}`);

    connectedUsers.delete(socket.userId);

    // Update user status to offline
    await User.findByIdAndUpdate(socket.userId, {
      status: 'offline',
      lastSeen: Date.now()
    });

    // Broadcast user offline status
    socket.broadcast.emit('userStatusChange', {
      userId: socket.userId,
      status: 'offline',
      lastSeen: Date.now()
    });
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server };