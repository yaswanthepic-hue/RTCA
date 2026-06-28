# RTCA — Real-Time Chat Application

A real-time 1-on-1 and group chat app built with React, Express, Socket.IO, and MongoDB.

## Tech stack

**Frontend** (`client/`)
- React 19 + React Router 7
- Socket.IO client for real-time messaging
- Axios for REST calls
- Vite for dev/build, served in production by a small Express static server (`server.cjs`)

**Backend** (`server/`)
- Express 5 + Socket.IO 4, organized as `routes/` → `controllers/` → `models/`
- MongoDB + Mongoose
- JWT authentication, bcryptjs password hashing
- Multer for file uploads (images, video, audio, documents — 50MB limit, executable file types blocked)

## Project structure

```
RTCA/
├── package.json            # Orchestrator — runs client + server together
├── render.yaml              # Render deployment config (two services)
├── client/
│   ├── package.json
│   ├── server.cjs            # Production static server (serves dist/, SPA fallback)
│   ├── vite.config.js
│   └── src/
│       ├── pages/              # Login, Register, Chat
│       ├── components/         # Chat UI, modals, sidebar
│       ├── context/            # AuthContext, SocketContext
│       └── utils/               # API client, helpers
└── server/
    ├── server.js              # Entry point — Express app + Socket.IO setup
    ├── config/database.js     # Mongoose connection
    ├── controllers/           # Request handlers, one file per resource
    ├── routes/                 # Thin route definitions, no logic
    ├── models/                  # User, Message, Group, GroupInvite, MessageRequest
    ├── middleware/auth.js       # JWT verification
    └── debugDatabase.js, checkMessages.js, clearMessages.js   # Dev-only DB inspection scripts
```

## Getting started

### Prerequisites
- Node.js 18+
- A MongoDB instance (local `mongod` or MongoDB Atlas)

### Install

```bash
git clone <your-repo-url>
cd RTCA
npm run install-all   # installs root, client/, and server/ dependencies
```

### Configure environment

**`server/.env`**
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/rtca-chat
JWT_SECRET=your_super_secure_jwt_secret_key
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

**`client/.env.local`**
```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

### Run it

```bash
npm run dev   # starts both client (5173) and server (5000) via concurrently
```

Or separately:
```bash
npm run server   # nodemon, http://localhost:5000
npm run client   # vite, http://localhost:5173
```

## How messaging works

1. Client connects via Socket.IO, sending the JWT in the handshake for auth.
2. Server keeps a `connectedUsers` Map (`userId → socketId`) for O(1) online-status lookups.
3. Sending a message: client shows it optimistically (temp ID) → emits `sendMessage` → server saves to MongoDB, checks if the recipient is online, emits `receiveMessage` to them, and emits `messageSent` back to the sender to replace the temp message with the real one.
4. Read receipts: opening a chat emits `markAsRead` for unread messages; server updates `isRead` and notifies the original sender via `messageStatusUpdate`.
5. Delivery state has three visual stages: sent (saved, recipient offline), delivered (recipient online when sent), read (recipient opened the chat).

Group messaging follows the same pattern through a parallel set of events (`sendGroupMessage` / `receiveGroupMessage` / `groupTyping`), with Socket.IO rooms used per group instead of per-user delivery.

## API reference

All routes except `/auth/register` and `/auth/login` require `Authorization: Bearer <token>`.

**Auth** (`/api/auth`)
`POST /register` · `POST /login` · `GET /me` · `PUT /profile` · `POST /upload-avatar` · `POST /logout`
`POST /block/:userId` · `POST /unblock/:userId` · `GET /blocked`
`POST /pin-chat/:userId` · `POST /unpin-chat/:userId`
`POST /star-message/:messageId` · `POST /unstar-message/:messageId` · `GET /starred-messages`

**Users** (`/api/users`)
`GET /` · `GET /:id` · `GET /search/:query`

**Messages** (`/api/messages`)
`GET /conversation/:userId` · `GET /conversations` · `PUT /conversation/:userId/read` · `PUT /:messageId/read`
`POST /upload` (multipart file upload) · `DELETE /:messageId`
`POST /:messageId/pin` · `POST /:messageId/unpin` · `GET /conversation/:userId/pinned`
`GET /conversation/:userId/media` · `GET /unread-count` · `GET /unread-per-conversation`

**Groups** (`/api/groups`)
`POST /` (create) · `GET /` (list mine) · `GET /:groupId` · `GET /:groupId/messages`
`POST /:groupId/members` (add) · `POST /:groupId/leave`

**Message requests** (`/api/message-requests`) — for messaging private accounts
`POST /send/:recipientId` · `GET /pending` · `GET /sent` · `POST /accept/:requestId` · `POST /reject/:requestId`
`GET /group-invites` · `POST /group-invites/:inviteId/accept` · `POST /group-invites/:inviteId/reject`

### Privacy model

A user can mark their account private (`isPrivate`) or restrict who can add them to groups (`allowGroupAdd: 'approval'`). When someone tries to message a private user or add a restricted user to a group, the system creates a pending `MessageRequest` or `GroupInvite` instead of an immediate connection — the recipient has to accept it first. Public, unrestricted users get added/messaged directly.

## Security

- Passwords hashed with bcryptjs before storage; plaintext never touches the database.
- JWT tokens (7-day expiry) signed with `JWT_SECRET`, verified on every protected route via `middleware/auth.js`.
- File uploads are size-limited (50MB) and reject executable extensions (`.exe`, `.bat`, `.sh`, `.ps1`, etc.) at the multer level.
- Message deletion and profile updates check resource ownership server-side — a user can only delete their own messages.
- CORS is restricted to `CLIENT_URL`.

Messages are stored as plaintext in MongoDB — there's no end-to-end encryption. If you need that, it has to be built properly with real asymmetric crypto (e.g. the browser's native Web Crypto API); symmetric hashing libraries like `crypto-js` can't provide it.

## Deployment

Deployed on Render as two services, defined in the root `render.yaml`:

- **`rtca-backend`** — Web Service, `cd server && npm install` / `cd server && npm start`, health check at `/api/health`.
- **`rtca-frontend`** — Web Service (not a static site) running `client/server.cjs`, which serves the Vite build and handles SPA routing via a catch-all route to `index.html`.

Required environment variables are set per-service in the Render dashboard (not committed): `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL` on the backend; `VITE_API_URL`, `VITE_SOCKET_URL` on the frontend, pointing at the deployed backend URL.

## Known limitations

- **Ephemeral file storage.** Uploaded files live on local disk (`server/uploads/`); Render's free tier wipes this on every restart. Production use needs S3/Cloudinary or similar.
- **No message editing** — only delete-and-resend.
- **No real-time scaling beyond a single instance.** The `connectedUsers` Map and Socket.IO state live in one process; running multiple instances would need a Redis adapter to share that state.
- **No automated test suite.**

## Dev scripts

`server/debugDatabase.js`, `server/checkMessages.js`, and `server/clearMessages.js` are standalone scripts for inspecting or resetting local MongoDB data during development — run with `node server/<script>.js`, not part of the app's runtime.