require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const CORS_ORIGINS = (process.env.CORS_ORIGINS ||
  "http://localhost:3000,http://127.0.0.1:3000,https://chat-application-ucp1.vercel.app"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin || CORS_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
};

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ["GET", "POST", "PATCH"],
    credentials: true,
  },
});

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

const JWT_SECRET = process.env.JWT_SECRET || "change_me_in_production";
const isProduction = process.env.NODE_ENV === "production";
const sessionCookie = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "None" : "Lax",
};

const PORT = process.env.PORT || 5000;

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://sharmadigember35_db_user:Monu%40Sharma26@cluster0.yaqpjgk.mongodb.net/flowchat?retryWrites=true&w=majority&appName=Cluster0";

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  lastSeen: { type: Date, default: Date.now },
  bio: { type: String, default: "" },
});

const User = mongoose.model("User", userSchema);

const messageSchema = new mongoose.Schema({
  content: String,
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  reactions: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      username: String,
      emoji: String,
    },
  ],
});

const Message = mongoose.model("Message", messageSchema);

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

app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: "Username already exists" });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    if (error.code === 11000)
      return res.status(400).json({ error: "Username already exists" });
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
    const token = jwt.sign({ _id: user._id.toString() }, JWT_SECRET);
    res
      .cookie("token", token, sessionCookie)
      .json({
        message: "Login successful",
        userId: user._id.toString(),
        username: user.username,
      });
  } catch (error) {
    res.status(500).json({ error: "Error logging in" });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token", { ...sessionCookie }).json({ message: "Logout successful" });
});

app.get("/api/users", verifyToken, async (req, res) => {
  try {
    const users = await User.find({}, "_id username lastSeen bio");
    res.json(users.filter((u) => u._id.toString() !== req.user._id));
  } catch (error) {
    res.status(500).json({ error: "Error fetching users" });
  }
});

app.patch("/api/profile", verifyToken, async (req, res) => {
  try {
    const { bio } = req.body;
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

app.get("/api/messages/:userId", verifyToken, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user._id },
      ],
    })
      .sort("timestamp")
      .populate("sender", "username")
      .populate("receiver", "username");
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Error fetching messages" });
  }
});

app.patch("/api/messages/read/:senderId", verifyToken, async (req, res) => {
  try {
    await Message.updateMany(
      { sender: req.params.senderId, receiver: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );
    res.json({ message: "Messages marked as read" });
  } catch (error) {
    res.status(500).json({ error: "Error marking messages as read" });
  }
});

app.patch("/api/messages/:messageId/react", verifyToken, async (req, res) => {
  try {
    const { emoji } = req.body;
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== req.user._id
    );
    if (emoji) {
      const user = await User.findById(req.user._id, "username");
      message.reactions.push({ userId: req.user._id, username: user.username, emoji });
    }
    await message.save();

    io.emit("reactionUpdate", { messageId: message._id.toString(), reactions: message.reactions });
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: "Error adding reaction" });
  }
});

app.get("/api/messages/search/:userId", verifyToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user._id },
      ],
      content: { $regex: q, $options: "i" },
    })
      .sort("timestamp")
      .populate("sender", "username")
      .populate("receiver", "username");
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Error searching messages" });
  }
});

app.get("/api/stats/:userId", verifyToken, async (req, res) => {
  try {
    const stats = await Message.aggregate([
      {
        $match: {
          $or: [
            {
              sender: new mongoose.Types.ObjectId(req.user._id),
              receiver: new mongoose.Types.ObjectId(req.params.userId),
            },
            {
              sender: new mongoose.Types.ObjectId(req.params.userId),
              receiver: new mongoose.Types.ObjectId(req.user._id),
            },
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

const activeUsers = new Map();

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("login", (userId) => {
    activeUsers.set(String(userId), socket.id);
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
      const receiverSocketId = activeUsers.get(String(receiverId));
      if (receiverSocketId) io.to(receiverSocketId).emit("message", populatedMessage);
      socket.emit("message", populatedMessage);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  });

  socket.on("typing", ({ senderId, receiverId, isTyping }) => {
    const receiverSocketId = activeUsers.get(String(receiverId));
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", { senderId, isTyping });
    }
  });

  socket.on("logout", () => {
    const userId = [...activeUsers.entries()].find(([, sid]) => sid === socket.id)?.[0];
    if (userId) {
      activeUsers.delete(userId);
      User.findByIdAndUpdate(userId, { lastSeen: new Date() }).exec();
      io.emit("activeUsers", Array.from(activeUsers.keys()));
    }
  });

  socket.on("disconnect", () => {
    const userId = [...activeUsers.entries()].find(([, sid]) => sid === socket.id)?.[0];
    if (userId) {
      activeUsers.delete(userId);
      User.findByIdAndUpdate(userId, { lastSeen: new Date() }).exec();
      io.emit("activeUsers", Array.from(activeUsers.keys()));
    }
    console.log("Client disconnected");
  });
});