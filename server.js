const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { Pool } = require("pg");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

// Comma-separated list. Add your Vercel URL(s) here or via CORS_ORIGINS in the environment.
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

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
/** Production (e.g. Render): cross-site cookies need Secure + SameSite=None. Local http needs secure: false. */
const isProduction = process.env.NODE_ENV === "production";
const sessionCookie = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "None" : "Lax",
};

// ─── PostgreSQL: set DATABASE_URL before `node server.js` ─────────────────────
// PowerShell (same terminal, replace YOUR_REAL_PASSWORD and flowchat if needed):
//   $env:DATABASE_URL = "postgresql://postgres:YOUR_REAL_PASSWORD@localhost:5432/flowchat"
//   node server.js
// URL shape: postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE
// If PASSWORD contains @ use %40 instead of @ (e.g. secret%40part for secret@part).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "Missing DATABASE_URL. In PowerShell run:\n" +
      '  $env:DATABASE_URL = "postgresql://postgres:YOUR_REAL_PASSWORD@localhost:5432/flowchat"\n' +
      "  node server.js\n" +
      "Then create database `flowchat` in pgAdmin if it does not exist yet."
  );
}

const useSsl =
  process.env.PGSSLMODE === "require" ||
  (databaseUrl && !/localhost|127\.0\.0\.1/i.test(databaseUrl));

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      password TEXT NOT NULL,
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      bio TEXT NOT NULL DEFAULT ''
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read BOOLEAN NOT NULL DEFAULT FALSE,
      read_at TIMESTAMPTZ
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      UNIQUE (message_id, user_id)
    );
  `);
}

function mapUserRow(row) {
  return {
    _id: String(row.id),
    username: row.username,
    lastSeen: row.last_seen,
    bio: row.bio ?? "",
  };
}

function mapMessageRow(row) {
  const reactions = Array.isArray(row.reactions) ? row.reactions : [];
  return {
    _id: String(row.id),
    content: row.content,
    sender: { _id: String(row.s_id), username: row.s_name },
    receiver: { _id: String(row.t_id), username: row.t_name },
    timestamp: row.created_at,
    read: row.read,
    readAt: row.read_at,
    reactions,
  };
}

const messageSelect = `
  SELECT m.id, m.content, m.created_at, m.read, m.read_at,
         s.id AS s_id, s.username AS s_name,
         t.id AS t_id, t.username AS t_name,
         COALESCE(
           (SELECT json_agg(json_build_object(
             'userId', mr.user_id::text,
             'username', ur.username,
             'emoji', mr.emoji
           ))
            FROM message_reactions mr
            JOIN users ur ON ur.id = mr.user_id
            WHERE mr.message_id = m.id),
           '[]'::json
         ) AS reactions
  FROM messages m
  JOIN users s ON s.id = m.sender_id
  JOIN users t ON t.id = m.receiver_id
`;

async function fetchMessageById(messageId) {
  const { rows } = await pool.query(`${messageSelect} WHERE m.id = $1`, [messageId]);
  return rows[0] ? mapMessageRow(rows[0]) : null;
}

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
    const existing = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    if (existing.rows.length)
      return res.status(400).json({ error: "Username already exists" });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, hashedPassword]
    );
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    if (error.code === "23505")
      return res.status(400).json({ error: "Username already exists" });
    res.status(500).json({ error: "Error registering user" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query("SELECT id, username, password FROM users WHERE username = $1", [
      username,
    ]);
    const user = rows[0];
    if (!user) return res.status(400).json({ error: "Invalid username or password" });
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Invalid username or password" });
    const token = jwt.sign({ _id: String(user.id) }, JWT_SECRET);
    res
      .cookie("token", token, sessionCookie)
      .json({ message: "Login successful", userId: String(user.id), username: user.username });
  } catch (error) {
    res.status(500).json({ error: "Error logging in" });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token", { ...sessionCookie }).json({ message: "Logout successful" });
});

app.get("/api/users", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, username, last_seen, bio FROM users WHERE id <> $1 ORDER BY username",
      [req.user._id]
    );
    res.json(rows.map(mapUserRow));
  } catch (error) {
    res.status(500).json({ error: "Error fetching users" });
  }
});

app.patch("/api/profile", verifyToken, async (req, res) => {
  try {
    const { bio } = req.body;
    const { rows } = await pool.query(
      "UPDATE users SET bio = COALESCE($1, bio) WHERE id = $2 RETURNING id, username, last_seen, bio",
      [bio ?? "", req.user._id]
    );
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    res.json(mapUserRow(rows[0]));
  } catch (error) {
    res.status(500).json({ error: "Error updating profile" });
  }
});

app.get("/api/messages/:userId", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${messageSelect}
       WHERE (m.sender_id = $1 AND m.receiver_id = $2) OR (m.sender_id = $2 AND m.receiver_id = $1)
       ORDER BY m.created_at ASC`,
      [req.user._id, req.params.userId]
    );
    res.json(rows.map(mapMessageRow));
  } catch (error) {
    res.status(500).json({ error: "Error fetching messages" });
  }
});

app.patch("/api/messages/read/:senderId", verifyToken, async (req, res) => {
  try {
    await pool.query(
      `UPDATE messages SET read = true, read_at = NOW()
       WHERE sender_id = $1 AND receiver_id = $2 AND read = false`,
      [req.params.senderId, req.user._id]
    );
    res.json({ message: "Messages marked as read" });
  } catch (error) {
    res.status(500).json({ error: "Error marking messages as read" });
  }
});

app.patch("/api/messages/:messageId/react", verifyToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { emoji } = req.body;
    await client.query("BEGIN");
    await client.query("DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2", [
      req.params.messageId,
      req.user._id,
    ]);
    if (emoji) {
      const u = await client.query("SELECT username FROM users WHERE id = $1", [req.user._id]);
      if (!u.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "User not found" });
      }
      await client.query(
        "INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)",
        [req.params.messageId, req.user._id, emoji]
      );
    }
    await client.query("COMMIT");
    const message = await fetchMessageById(req.params.messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });
    io.emit("reactionUpdate", { messageId: message._id, reactions: message.reactions });
    res.json(message);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    res.status(500).json({ error: "Error adding reaction" });
  } finally {
    client.release();
  }
});

app.get("/api/messages/search/:userId", verifyToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const { rows } = await pool.query(
      `${messageSelect}
       WHERE ((m.sender_id = $1 AND m.receiver_id = $2) OR (m.sender_id = $2 AND m.receiver_id = $1))
         AND POSITION(LOWER($3::text) IN LOWER(m.content)) > 0
       ORDER BY m.created_at ASC`,
      [req.user._id, req.params.userId, String(q)]
    );
    res.json(rows.map(mapMessageRow));
  } catch (error) {
    res.status(500).json({ error: "Error searching messages" });
  }
});

app.get("/api/stats/:userId", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sender_id::text AS _id,
              COUNT(*)::int AS count,
              AVG(LENGTH(content))::float AS "avgLength"
       FROM messages
       WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
       GROUP BY sender_id`,
      [req.user._id, req.params.userId]
    );
    res.json(rows);
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
      const ins = await pool.query(
        "INSERT INTO messages (content, sender_id, receiver_id) VALUES ($1, $2, $3) RETURNING id",
        [content, senderId, receiverId]
      );
      const populatedMessage = await fetchMessageById(ins.rows[0].id);
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
      pool.query("UPDATE users SET last_seen = NOW() WHERE id = $1", [userId]).catch(() => {});
      io.emit("activeUsers", Array.from(activeUsers.keys()));
    }
  });

  socket.on("disconnect", () => {
    const userId = [...activeUsers.entries()].find(([, sid]) => sid === socket.id)?.[0];
    if (userId) {
      activeUsers.delete(userId);
      pool.query("UPDATE users SET last_seen = NOW() WHERE id = $1", [userId]).catch(() => {});
      io.emit("activeUsers", Array.from(activeUsers.keys()));
    }
    console.log("Client disconnected");
  });
});

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    if (!databaseUrl) {
      console.error("Missing DATABASE_URL. Create a database in pgAdmin, then set DATABASE_URL.");
      process.exit(1);
    }
    await initDb();
    await pool.query("SELECT 1");
    console.log("Connected to PostgreSQL");
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error("Could not start server:", err);
    process.exit(1);
  }
}

start();
