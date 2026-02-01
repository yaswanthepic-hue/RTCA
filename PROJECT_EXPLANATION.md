# RTCA - Real-Time Chat Application
## Complete Technical Explanation

**Live URL**: https://rtca-livid.vercel.app
**Backend API**: https://rtca-backend.onrender.com

---

## 🏗️ ARCHITECTURE & TECH STACK

**Frontend:** React 19.1.1 (UI components), React Router 7.9.4 (client routing), Socket.IO Client 4.8.1 (WebSocket), Axios 1.12.2 (HTTP), Vite 7.1.7 (build tool)

**Backend:** Node.js + Express.js 4.19.2 (REST API), Socket.IO 4.8.1 (real-time), MongoDB + Mongoose 8.7.2 (database), JWT (authentication), Bcrypt 5.1.1 (password hashing), Multer 1.4.5 (file uploads)

**Deployment:** Vercel (frontend CDN), Render (backend PaaS), MongoDB Atlas (cloud database)

---

## 🔐 AUTHENTICATION

**Registration:** Password hashed with bcrypt (10 salt rounds - one-way encryption), user saved to MongoDB, JWT token generated with userId payload and signed with secret key, token stored in localStorage.

**Login:** Bcrypt compares submitted password with stored hash, generates JWT on match, client stores token and redirects to chat.

**Protection:** Frontend uses PrivateRoute wrapper checking authentication state. Backend uses auth middleware verifying JWT on every protected endpoint - extracts user ID from token and attaches to request.

---

## 💬 REAL-TIME MESSAGING

**Connection:** Socket.IO establishes WebSocket connection (fallback to long-polling). JWT token sent in handshake for authentication. Server maintains connectedUsers Map (userId → socketId) for O(1) online status lookup.

**Message Flow:**
1. User sends → optimistic UI update (shows immediately with temp ID)
2. Client emits "sendMessage" socket event
3. Server saves to MongoDB, checks if recipient online in connectedUsers Map
4. If online: sets deliveredAt timestamp, emits "receiveMessage" to recipient
5. Server confirms to sender with "messageSent" (replaces temp message with real one)
6. Recipient auto-emits "markAsRead" when opening chat
7. Server updates isRead=true, notifies sender with "messageStatusUpdate"

**Three-State Ticks:**
- **1 gray tick:** Message saved to database, deliveredAt=null (recipient offline)
- **2 gray ticks:** deliveredAt set, recipient is online (message delivered)
- **2 blue ticks:** isRead=true, recipient opened chat (message read)

---

## 📁 FILE UPLOADS

**Process:** User selects file → FormData created → HTTP POST to /api/messages/upload → Multer middleware saves to uploads/ directory with unique filename (timestamp+random) → Server returns fileUrl, fileName, fileSize → Client emits "sendMessage" socket event with messageType (image/video/voice/file).

**Voice Recording:** MediaRecorder API captures microphone audio → chunks combined into Blob → converted to File → uploaded same as regular files.

**Limitation:** Render free tier has ephemeral storage - files deleted on server restart. Production needs cloud storage (S3/Cloudinary).

---

## 🗄️ DATABASE SCHEMA

**User Model:** username, email, password (bcrypt hash), avatar, status (online/offline), lastSeen, pinnedChats[], blockedUsers[], starredMessages[], createdAt

**Message Model:** sender (User ref), recipient (User ref), content, messageType (text/image/video/voice/file), fileUrl, fileName, fileSize, isRead, readAt, deliveredAt, isPinned, createdAt

**Indexes:** Compound index on (sender, recipient, createdAt) for fast conversation queries.

---

## 🔄 REAL-TIME FEATURES

**Typing Indicators:** onChange event emits "typing" with isTyping:true → timeout set for 1 second → resets on each keystroke → fires "typing" isTyping:false after 1s idle. Server forwards to recipient's socket.

**Online/Offline Status:** On connect: add to connectedUsers Map, update DB status="online", broadcast to all users. On disconnect: remove from Map, set status="offline" and lastSeen timestamp, broadcast change.

**Read Receipts:** Opening chat loops through messages where recipient=currentUser and isRead=false → emits "markAsRead" for each → server updates DB and notifies sender.

---

## 🔒 SECURITY

- **Password Security:** Bcrypt hashing is slow by design (prevents brute force), salt rounds=10, same password hashed twice produces different results (random salt)
- **JWT:** Three parts (header, payload, signature). Signature prevents tampering. Stateless - no session storage needed.
- **CORS:** Configured to only allow frontend domain, prevents random websites from accessing API
- **Authorization:** Message deletion checks sender=currentUser, profile updates verify ownership
- **Input Validation:** Backend validates all input (username min 3 chars, email format, password min 6 chars, file size max 50MB, file type whitelist)

---

## 🚀 DEPLOYMENT

**Vercel (Frontend):** Runs `npm run build` → Vite bundles React into optimized chunks → vercel.json rewrites all routes to /index.html (enables SPA routing) → serves from global CDN.

**Render (Backend):** render.yaml defines service → runs `npm install` and `npm start` → free tier spins down after 15min idle (30-60s cold start).

**MongoDB Atlas:** Free M0 tier (512MB), connection string format: mongodb+srv://username:password@cluster.mongodb.net/rtca

---

## 🎨 KEY FEATURES

**Context Menus:** Message context menu (right-click message: Pin/Delete). Chat context menu (right-click empty space: Close/Delete chat). Uses stopPropagation to prevent conflicts.

**Modals:** Custom in-app modals instead of browser alert/confirm. Overlay + modal card, click outside to close, ESC key support.

**Sidebar Sorting:** Pinned chats first (with animated 📌 icon), then by most recent message timestamp (lastMessage.createdAt).

**Optimistic UI:** Message appears instantly before server confirmation (temp ID), replaced with real message on "messageSent" event.

---

## 📊 PERFORMANCE OPTIMIZATIONS

- **Optimistic UI Updates:** Instant feedback, no waiting for network latency
- **Message Pagination:** Load only last 100 messages initially
- **Database Indexes:** B-tree index reduces query time from O(n) to O(log n)
- **Socket.IO Rooms:** Targeted messaging to specific user, not broadcast to all
- **Debounced Typing:** Only 2 events per message (start/stop), not per keystroke

---

## 🐛 KNOWN LIMITATIONS

1. **File Persistence:** Render free tier deletes uploaded files on restart (ephemeral storage)
2. **Cold Starts:** First request after 15min idle takes 30-60 seconds
3. **No E2E Encryption:** Messages stored in plain text in database
4. **No Message Editing:** Can only delete and resend
5. **No Group Chats:** Only 1-on-1 conversations supported

---

## 🎯 INTERVIEW Q&A

**"How does real-time messaging work?"**
Socket.IO creates persistent WebSocket connection. When User A sends message, client emits "sendMessage" event. Server saves to MongoDB, checks if User B online (connectedUsers Map lookup), emits "receiveMessage" to B's socket. B's client updates React state triggering re-render. Process takes 50-100ms vs HTTP polling which wastes bandwidth checking every few seconds.

**"How do the ticks work?"**
Three states: 1 tick (sent, deliveredAt=null), 2 gray ticks (delivered, recipient online), 2 blue ticks (read, recipient opened chat). Server checks connectedUsers Map before setting deliveredAt. Rendering uses conditional: isRead ? blue : deliveredAt ? gray : single gray.

**"How would you scale this?"**
Use Redis for connectedUsers Map (shared across server instances), Redis pub/sub for message forwarding, read replicas for DB queries, Redis caching for user profiles/conversations (5-10min TTL), S3/Cloudinary for file storage with CDN, rate limiting with Redis, horizontal pod autoscaling in Kubernetes.

**"Why Socket.IO over raw WebSockets?"**
Automatic reconnection with exponential backoff, fallback to HTTP long-polling if WebSockets blocked, simpler event-based API vs manual message parsing, built-in rooms for targeted messaging, handles binary data. 2-3KB overhead negligible vs developer experience. Reliability more important than squeezing out milliseconds.

**"What security measures?"**
Bcrypt password hashing (10 salt rounds), JWT with expiration and secret key signature, CORS whitelist, auth middleware on all protected routes, authorization checks (users only modify own data), file upload validation (type + size), Mongoose parameterized queries prevent NoSQL injection, input validation on all endpoints.

---

## 📝 PROJECT SUMMARY

**Full-stack MERN application** with real-time WebSocket communication, JWT authentication, file uploads, three-state delivery tracking, typing indicators, online/offline status, custom context menus, optimistic UI updates, and production deployment.

**Tech Skills Demonstrated:** Full-stack JavaScript, RESTful API design, WebSocket/Socket.IO, MongoDB schema design, authentication/security, deployment (Vercel/Render/MongoDB Atlas), file handling (Multer/MediaRecorder API), responsive UI/UX, performance optimization.

**Stats:** ~40-60 hours development, 5,000+ lines of code, 15+ technologies, 25+ features implemented.

---

**Built with ❤️ using the MERN Stack**
