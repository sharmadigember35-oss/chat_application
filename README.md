# ⚡ FlowChat Enhanced — MERN Stack Learning Edition

A full-featured real-time chat app built with **MongoDB, Express, React, Node.js**.
This version adds 6 new features, each designed to teach a core MERN concept.

---

## 🚀 Quick Start

```bash
# 1. Start MongoDB
mongod

# 2. Install server dependencies
npm install

# 3. Start the server
node server.js

# 4. In a new terminal — start the React client
cd client
npm install
npm start
```

Open http://localhost:3000

---

## ✨ New Features Added

### 1. ⌨️ Typing Indicator
**What it does:** Shows "{username} is typing…" in real time.  
**MERN concept:** Socket.io ephemeral events (no DB needed).  
**Where to look:**
- `server.js` → `socket.on("typing", ...)` 
- `App.js` → `handleInputChange()`, `typingUsers` state

### 2. 📖 Read Receipts
**What it does:** Shows "✓ sent" / "✓✓ seen" on messages.  
**MERN concept:** `updateMany()` — update multiple MongoDB documents at once.  
**Where to look:**
- `server.js` → `PATCH /api/messages/read/:senderId`
- `App.js` → `markAsRead()` called when a chat is opened

### 3. 👍 Emoji Reactions
**What it does:** Double-click any message to add an emoji reaction.  
**MERN concept:** Updating nested array fields in MongoDB documents.  
**Where to look:**
- `server.js` → `PATCH /api/messages/:messageId/react`
- `App.js` → `handleReact()`, `reactionPickerFor` state

### 4. 🔍 Message Search
**What it does:** Search through your conversation history.  
**MERN concept:** MongoDB `$regex` operator for text search.  
**Where to look:**
- `server.js` → `GET /api/messages/search/:userId?q=term`
- `App.js` → `handleSearch()`, `searchResults` state

### 5. 📊 Chat Statistics
**What it does:** See message counts and average lengths per user.  
**MERN concept:** MongoDB Aggregation Pipeline (`$match`, `$group`, `$sum`, `$avg`).  
**Where to look:**
- `server.js` → `GET /api/stats/:userId` — uses `Message.aggregate()`
- `App.js` → `fetchStats()`, "📊 Stats" button in chat header

### 6. 👤 Profile + Last Seen
**What it does:** Set a bio that appears in chats; see when offline users were last active.  
**MERN concept:** `PATCH` for partial document updates; `findByIdAndUpdate` with `{ new: true }`.  
**Where to look:**
- `server.js` → `PATCH /api/profile`, `lastSeen` updated on socket disconnect
- `App.js` → Profile modal, `formatLastSeen()`, user sidebar

### Bonus: 🧠 MERN Learning Panel
A floating widget (bottom-right corner) that explains the MERN concept behind each action you take.

### Bonus: 📝 API Logger Middleware
Every API call is logged to the console:  
`[API] GET /api/messages/... → 200 (12ms)`  
This teaches how Express middleware works.

---

## 📁 Key Files

```
FlowChat-Enhanced/
├── server.js          ← Express + MongoDB + Socket.io backend
├── package.json
└── client/
    └── src/
        └── App.js     ← React frontend with all features
```

---

## 🧠 MERN Concepts at a Glance

| Concept | Where Used |
|---|---|
| Mongoose Schema | `userSchema`, `messageSchema` in server.js |
| ObjectId + populate() | Messages reference Users; `populate()` = SQL JOIN |
| Middleware | `verifyToken`, API logger |
| updateMany() | Read receipts |
| findByIdAndUpdate() | Profile bio update |
| Aggregation Pipeline | Chat statistics |
| $regex search | Message search |
| Socket.io events | Real-time messaging, typing, reactions |
| HTTP-only cookies | JWT authentication |
| PATCH vs PUT | Partial vs full document update |

