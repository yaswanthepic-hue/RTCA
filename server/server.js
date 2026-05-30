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
const Message = require('./models/Message');
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