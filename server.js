const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "http://localhost:3000", methods: ["GET", "POST", "PATCH"], credentials: true },
});

app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ─── MERN LEARNING FEATURE #1: API Request Logger Middleware ─────────────────
// Middleware runs on EVERY request BEFORE the route handler.
// This teaches how Express middleware chain works (req → middleware → route).
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
  });
  next(); // IMPORTANT: call next() to pass control to the next middleware
});

const MONGO_URL = "mongodb://localhost:27017/chatapp";
const JWT_SECRET = "your_jwt_secret";

mongoose
  .connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Could not connect to MongoDB:", err));

// ─── SCHEMAS ─────────────────────────────────────────────────────────────────
// MERN LEARNING: Mongoose schemas define the shape of documents in MongoDB.
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  lastSeen: { type: Date, default: Date.now }, // NEW: track last online time
  bio: { type: String, default: "" },           // NEW: profile bio
});

const User = mongoose.model("User", userSchema);

// MERN LEARNING: ObjectId references create relationships between collections
// (like foreign keys in SQL).
const messageSchema = new mongoose.Schema({
  content: String,
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },   // NEW: read receipts
  readAt: { type: Date },
  reactions: [                                // NEW: message reactions
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      username: String,
      emoji: String,
    },
  ],
});

const Message = mongoose.model("Message", messageSchema);

// ─── JWT MIDDLEWARE ───────────────────────────────────────────────────────────
// MERN LEARNING: Reusable middleware — pass it as a second arg to any route
// to protect it: app.get("/api/protected", verifyToken, handler)
const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Access denied" });
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: "Invalid token" });
  }
};

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser)
      return res.status(400).json({ error: "Username already exists" });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    res.status(500).json({ error: "Error registering user" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "Invalid username or password" });
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Invalid username or password" });
    const token = jwt.sign({ _id: user._id }, JWT_SECRET);
    res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
      })
      .json({ message: "Login successful", userId: user._id, username: user.username });
  } catch (error) {
    res.status(500).json({ error: "Error logging in" });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token").json({ message: "Logout successful" });
});

// ─── USER ROUTES ──────────────────────────────────────────────────────────────
app.get("/api/users", verifyToken, async (req, res) => {
  try {
    // MERN LEARNING: Second arg to find() is a projection — select which fields to return.
    const users = await User.find({}, "_id username lastSeen bio");
    res.json(users.filter((u) => u._id.toString() !== req.user._id));
  } catch (error) {
    res.status(500).json({ error: "Error fetching users" });
  }
});

// NEW FEATURE: Update Profile bio
// MERN LEARNING: PATCH = partial update (vs PUT = full replace)
app.patch("/api/profile", verifyToken, async (req, res) => {
  try {
    const { bio } = req.body;
    // MERN LEARNING: { new: true } returns the updated document, not the original
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { bio },
      { new: true, select: "-password" }
    );
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Error updating profile" });
  }
});

// ─── MESSAGE ROUTES ───────────────────────────────────────────────────────────
app.get("/api/messages/:userId", verifyToken, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user._id },
      ],
    })
      .sort("timestamp")
      // MERN LEARNING: populate() replaces ObjectId with actual document data — like a SQL JOIN
      .populate("sender", "username")
      .populate("receiver", "username");
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Error fetching messages" });
  }
});

// NEW FEATURE: Mark messages as read (Read Receipts)
app.patch("/api/messages/read/:senderId", verifyToken, async (req, res) => {
  try {
    // MERN LEARNING: updateMany() updates ALL matching documents at once
    await Message.updateMany(
      { sender: req.params.senderId, receiver: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );
    res.json({ message: "Messages marked as read" });
  } catch (error) {
    res.status(500).json({ error: "Error marking messages as read" });
  }
});

// NEW FEATURE: Add/remove emoji reaction to a message
app.patch("/api/messages/:messageId/react", verifyToken, async (req, res) => {
  try {
    const { emoji } = req.body;
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    // Remove existing reaction from this user, then add new one
    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== req.user._id
    );
    if (emoji) {
      const user = await User.findById(req.user._id, "username");
      message.reactions.push({ userId: req.user._id, username: user.username, emoji });
    }
    await message.save();

    // Notify users via Socket.io in real-time
    io.emit("reactionUpdate", { messageId: message._id, reactions: message.reactions });
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: "Error adding reaction" });
  }
});

// NEW FEATURE: Message Search
// MERN LEARNING: $regex enables text search in MongoDB.
// For production apps, use MongoDB Atlas Search or Elasticsearch instead.
app.get("/api/messages/search/:userId", verifyToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user._id },
      ],
      content: { $regex: q, $options: "i" }, // i = case-insensitive
    })
      .sort("timestamp")
      .populate("sender", "username")
      .populate("receiver", "username");
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Error searching messages" });
  }
});

// NEW FEATURE: Chat Statistics using MongoDB Aggregation Pipeline
// MERN LEARNING: Aggregation pipeline chains stages to transform/analyze data.
// $match filters, $group groups+counts — similar to SQL GROUP BY + COUNT.
app.get("/api/stats/:userId", verifyToken, async (req, res) => {
  try {
    const stats = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: new mongoose.Types.ObjectId(req.user._id), receiver: new mongoose.Types.ObjectId(req.params.userId) },
            { sender: new mongoose.Types.ObjectId(req.params.userId), receiver: new mongoose.Types.ObjectId(req.user._id) },
          ],
        },
      },
      {
        $group: {
          _id: "$sender",
          count: { $sum: 1 },
          avgLength: { $avg: { $strLenCP: "$content" } },
        },
      },
    ]);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Error fetching stats" });
  }
});

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────
// MERN LEARNING: Socket.io enables real-time bidirectional communication.
// Unlike HTTP (request→response cycle), sockets stay open continuously.
const activeUsers = new Map(); // userId → socketId

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("login", (userId) => {
    activeUsers.set(userId, socket.id);
    io.emit("activeUsers", Array.from(activeUsers.keys()));
  });

  socket.on("sendMessage", async (data) => {
    try {
      const { senderId, receiverId, content } = data;
      const newMessage = new Message({ content, sender: senderId, receiver: receiverId });
      await newMessage.save();
      const populatedMessage = await Message.findById(newMessage._id)
        .populate("sender", "username")
        .populate("receiver", "username");
      const receiverSocketId = activeUsers.get(receiverId);
      if (receiverSocketId) io.to(receiverSocketId).emit("message", populatedMessage);
      socket.emit("message", populatedMessage);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  });

  // NEW FEATURE: Typing Indicator
  // MERN LEARNING: Sockets can emit small/fast events that don't need DB storage.
  // The typing state is ephemeral — we only need it in real-time.
  socket.on("typing", ({ senderId, receiverId, isTyping }) => {
    const receiverSocketId = activeUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", { senderId, isTyping });
    }
  });

  socket.on("disconnect", () => {
    const userId = [...activeUsers.entries()].find(([_, sid]) => sid === socket.id)?.[0];
    if (userId) {
      activeUsers.delete(userId);
      User.findByIdAndUpdate(userId, { lastSeen: new Date() }).exec();
      io.emit("activeUsers", Array.from(activeUsers.keys()));
    }
    console.log("Client disconnected");
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
