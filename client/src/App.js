import React, { useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client";
import "bootstrap/dist/css/bootstrap.min.css";
import Footer from "./components/Footer";
import EmojiPicker from "emoji-picker-react";
import "./App.css";

const socket = io("http://localhost:5000");
const API = "http://localhost:5000/api";

// ─── MERN LEARNING PANEL ─────────────────────────────────────────────────────
function MernPanel({ tip }) {
  const [open, setOpen] = useState(false);
  if (!tip) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        maxWidth: 340,
      }}
    >
      <button
        className="btn btn-warning btn-sm w-100 d-flex align-items-center gap-2"
        onClick={() => setOpen((o) => !o)}
        style={{ borderRadius: open ? "8px 8px 0 0" : 8 }}
      >
        <span>🧠</span>
        <span className="fw-bold">MERN Learning</span>
        <span className="ms-auto">{open ? "▼" : "▲"}</span>
      </button>
      {open && (
        <div
          className="p-3 bg-warning bg-opacity-10 border border-warning rounded-bottom"
          style={{ fontSize: 13 }}
        >
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "monospace",
              marginBottom: 0,
              fontSize: 12,
            }}
          >
            {tip}
          </pre>
        </div>
      )}
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [user, setUser] = useState(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [error, setError] = useState("");
  const [activeUsers, setActiveUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showLoginForm, setShowLoginForm] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

  const [typingUsers, setTypingUsers] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [stats, setStats] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [bio, setBio] = useState("");
  const [mernTip, setMernTip] = useState("");
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [allUsers, setAllUsers] = useState([]);

  const loginSectionRef = useRef(null);
  const pickerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

  // Auto scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Socket event listeners
  useEffect(() => {
    socket.on("message", (message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on("activeUsers", (userIds) => {
      setActiveUsers(userIds.filter((id) => id !== user?.userId));
    });

    socket.on("typing", ({ senderId, isTyping }) => {
      setTypingUsers((prev) => ({ ...prev, [senderId]: isTyping }));
    });

    socket.on("reactionUpdate", ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, reactions } : m
        )
      );
    });

    return () => {
      socket.off("message");
      socket.off("activeUsers");
      socket.off("typing");
      socket.off("reactionUpdate");
    };
  }, [user]);

  // ✅ FIX: Defined BEFORE useEffect and wrapped in useCallback
  const fetchMessages = useCallback(async () => {
    if (!selectedUser) return;
    try {
      const res = await fetch(`${API}/messages/${selectedUser._id}`, {
        credentials: "include",
      });
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  }, [selectedUser]);

  const markAsRead = useCallback(async () => {
    if (!selectedUser) return;
    try {
      await fetch(`${API}/messages/read/${selectedUser._id}`, {
        method: "PATCH",
        credentials: "include",
      });
    } catch (err) {
      console.error("Error marking as read:", err);
    }
  }, [selectedUser]);

  const fetchStats = useCallback(async () => {
    if (!selectedUser) return;
    try {
      const res = await fetch(`${API}/stats/${selectedUser._id}`, {
        credentials: "include",
      });
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, [selectedUser]);

  // ✅ FIX: All 3 functions now listed in the dependency array
  useEffect(() => {
    if (user && selectedUser) {
      fetchMessages();
      markAsRead();
      fetchStats();
      setMernTip(
        `// MERN: GET /api/messages/:userId\n// Express route fetches from MongoDB:\nMessage.find({\n  $or: [\n    { sender: myId, receiver: theirId },\n    { sender: theirId, receiver: myId }\n  ]\n}).populate("sender", "username")\n// .populate() = SQL JOIN on ObjectId`
      );
    }
  }, [user, selectedUser, fetchMessages, markAsRead, fetchStats]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputMessage && user && selectedUser) {
      socket.emit("sendMessage", {
        senderId: user.userId,
        receiverId: selectedUser._id,
        content: inputMessage,
      });
      setInputMessage("");
      socket.emit("typing", {
        senderId: user.userId,
        receiverId: selectedUser._id,
        isTyping: false,
      });
    }
  };

  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    if (!selectedUser) return;

    socket.emit("typing", {
      senderId: user.userId,
      receiverId: selectedUser._id,
      isTyping: true,
    });

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", {
        senderId: user.userId,
        receiverId: selectedUser._id,
        isTyping: false,
      });
    }, 2000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setMernTip(
      `// MERN: POST /api/login\n// Server-side:\n1. User.findOne({ username })\n2. bcrypt.compare(password, hash)\n3. jwt.sign({ _id }) → cookie\n\n// HTTP-only cookie = browser stores\n// the JWT securely (JS can't read it)`
    );
    try {
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
        socket.emit("login", data.userId);
        fetchActiveUsers();
        setError("");
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Error logging in");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setMernTip(
      `// MERN: POST /api/register\n// bcrypt hashing explained:\nconst salt = await bcrypt.genSalt(10)\n// salt = random string to prevent\n// rainbow table attacks\nconst hash = await bcrypt.hash(pw, salt)\n// Store ONLY the hash, never plain text!`
    );
    try {
      const res = await fetch(`${API}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: registerUsername, password: registerPassword }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setError("Registration successful. Please log in.");
        setShowLoginForm(true);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Error registering");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API}/logout`, { method: "POST", credentials: "include" });
      setUser(null);
      setMessages([]);
      setSelectedUser(null);
      setMernTip("");
      socket.emit("logout");
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };

  const fetchActiveUsers = async () => {
    try {
      const res = await fetch(`${API}/users`, { credentials: "include" });
      const data = await res.json();
      setAllUsers(data);
      setActiveUsers(data);
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  };

  const selectUser = (u) => {
    setSelectedUser(u);
    setMessages([]);
    setSearchResults(null);
    setSearchQuery("");
    setShowStats(false);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setMernTip(
      `// MERN: MongoDB $regex search\nMessage.find({\n  content: {\n    $regex: "${searchQuery}",\n    $options: "i" // case-insensitive\n  }\n})\n// For large apps, use Atlas Search\n// or Elasticsearch instead of $regex`
    );
    try {
      const res = await fetch(
        `${API}/messages/search/${selectedUser._id}?q=${encodeURIComponent(searchQuery)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error("Search error:", err);
    }
  };

  const handleUpdateBio = async () => {
    setMernTip(
      `// MERN: PATCH /api/profile\n// PATCH = partial update\nUser.findByIdAndUpdate(\n  req.user._id,\n  { bio },\n  { new: true } // return updated doc\n)\n// vs PUT = full document replace`
    );
    try {
      const res = await fetch(`${API}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio }),
        credentials: "include",
      });
      if (res.ok) {
        setShowProfile(false);
        alert("Profile updated!");
      }
    } catch (err) {
      console.error("Error updating profile:", err);
    }
  };

  const handleReact = async (messageId, emoji) => {
    setMernTip(
      `// MERN: PATCH /api/messages/:id/react\n// Updates an array field in MongoDB:\nmessage.reactions.push({\n  userId, username, emoji\n})\nawait message.save()\n// Then emit via Socket.io so both\n// users see the update instantly!`
    );
    try {
      await fetch(`${API}/messages/${messageId}/react`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
        credentials: "include",
      });
      setReactionPickerFor(null);
    } catch (err) {
      console.error("Reaction error:", err);
    }
  };

  const onEmojiClick = (emojiData) => {
    setInputMessage((prev) => prev + emojiData.emoji);
    setShowPicker(false);
  };

  const isOnline = (userId) => activeUsers.some((u) => (u._id || u) === (userId?._id || userId));

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatLastSeen = (ts) => {
    if (!ts) return "";
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const displayMessages = searchResults !== null ? searchResults : messages;

  // ─── LANDING PAGE ─────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="container-fluid p-0">
        <div className="bg-light py-5 mb-5">
          <div className="container text-center">
            <h1 className="display-4 fw-bold text-primary mb-4">
              FlowChat: Your Gateway to Effortless Chat
            </h1>
            <button
              className="btn btn-primary btn-lg px-4 mb-4"
              onClick={() => loginSectionRef.current.scrollIntoView({ behavior: "smooth" })}
            >
              Login / Register
            </button>
            <p className="lead px-4 text-muted">
              FlowChat: Real-time messaging powered by the MERN stack — MongoDB,
              Express, React, and Node.js.
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="container mb-5">
          <h2 className="text-center mb-4 fw-bold text-primary">Key Features</h2>
          <div className="row g-4">
            {[
              ["💬", "Instant Messaging", "Real-time via Socket.io"],
              ["🔒", "JWT Auth", "Secure HTTP-only cookie sessions"],
              ["⌨️", "Typing Indicator", "Live typing status via sockets"],
              ["👍", "Reactions", "Emoji reactions on messages"],
              ["📖", "Read Receipts", "Know when messages are seen"],
              ["🔍", "Message Search", "MongoDB $regex full-text search"],
              ["📊", "Chat Stats", "MongoDB Aggregation Pipeline"],
              ["🟢", "Online Status", "Live presence tracking"],
            ].map(([icon, title, desc]) => (
              <div className="col-md-3" key={title}>
                <div className="card h-100 border-0 shadow-sm">
                  <div className="card-body text-center">
                    <h3 className="h4 mb-3">{icon} {title}</h3>
                    <p className="text-muted small">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Auth Section */}
        <div className="container my-5" ref={loginSectionRef}>
          <div className="row justify-content-center">
            <div className="col-md-6">
              <div className="card border-0 shadow">
                <div className="card-body p-4">
                  <h2 className="text-center mb-4 text-primary">Welcome to FlowChat</h2>
                  <div className="d-flex justify-content-center gap-3 mb-4">
                    <button
                      className={`btn ${showLoginForm ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => setShowLoginForm(true)}
                    >Login</button>
                    <button
                      className={`btn ${!showLoginForm ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => setShowLoginForm(false)}
                    >Register</button>
                  </div>

                  {showLoginForm ? (
                    <form onSubmit={handleLogin} className="needs-validation">
                      <h3 className="h4 text-center mb-4 text-secondary">Already Registered? Login Here!</h3>
                      <div className="mb-3">
                        <input type="text" className="form-control form-control-lg" placeholder="Username"
                          value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} required />
                      </div>
                      <div className="mb-4">
                        <input type="password" className="form-control form-control-lg" placeholder="Password"
                          value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
                      </div>
                      <button type="submit" className="btn btn-primary w-100 btn-lg mb-3">Login</button>
                    </form>
                  ) : (
                    <form onSubmit={handleRegister} className="needs-validation">
                      <h3 className="h4 text-center mb-4 text-secondary">New Here? Register!</h3>
                      <div className="mb-3">
                        <input type="text" className="form-control form-control-lg" placeholder="Username"
                          value={registerUsername} onChange={(e) => setRegisterUsername(e.target.value)} required />
                      </div>
                      <div className="mb-4">
                        <input type="password" className="form-control form-control-lg" placeholder="Password"
                          value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} required />
                      </div>
                      <button type="submit" className="btn btn-primary w-100 btn-lg mb-3">Register</button>
                    </form>
                  )}

                  {error && <div className="alert alert-danger text-center">{error}</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
        <MernPanel tip={mernTip} />
      </div>
    );
  }

  // ─── CHAT INTERFACE ────────────────────────────────────────────────────────
  return (
    <div className="container-fluid vh-100 d-flex flex-column">
      {/* Header */}
      <div className="row py-2 bg-primary text-white border-bottom align-items-center px-3">
        <div className="col">
          <h1 className="h4 mb-0 fw-bold">⚡ FlowChat</h1>
        </div>
        <div className="col text-center">
          <span className="fw-bold">{user.username}</span>
        </div>
        <div className="col text-end d-flex gap-2 justify-content-end">
          <button className="btn btn-outline-light btn-sm" onClick={() => { setShowProfile(true); setMernTip(`// MERN: PATCH /api/profile\n// Partial document update:\nUser.findByIdAndUpdate(\n  userId,\n  { bio: newBio },\n  { new: true }\n)`); }}>
            👤 Profile
          </button>
          <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div className="row flex-grow-1 overflow-hidden">
        {/* Sidebar: User List */}
        <div className="col-md-3 border-end p-0 d-flex flex-column">
          <div className="p-3 bg-light border-bottom">
            <h2 className="h6 mb-0 fw-bold">All Users</h2>
            <small className="text-muted">🟢 = online now</small>
          </div>
          <div className="list-group list-group-flush overflow-auto flex-grow-1">
            {allUsers.map((u) => {
              const online = isOnline(u._id);
              return (
                <button
                  key={u._id}
                  onClick={() => selectUser(u)}
                  className={`list-group-item list-group-item-action d-flex align-items-center gap-2 ${selectedUser?._id === u._id ? "active" : ""}`}
                >
                  <span style={{ fontSize: 10 }}>{online ? "🟢" : "⚪"}</span>
                  <div>
                    <div className="fw-semibold">{u.username}</div>
                    {!online && u.lastSeen && (
                      <div className="small opacity-75">last seen {formatLastSeen(u.lastSeen)}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="col-md-9 p-0 d-flex flex-column">
          {selectedUser ? (
            <>
              {/* Chat Header */}
              <div className="p-3 bg-light border-bottom d-flex align-items-center gap-3">
                <div>
                  <span className="me-2">{isOnline(selectedUser._id) ? "🟢" : "⚪"}</span>
                  <strong>{selectedUser.username}</strong>
                  {selectedUser.bio && <span className="text-muted small ms-2">— {selectedUser.bio}</span>}
                </div>
                <div className="ms-auto d-flex gap-2">
                  <button
                    className={`btn btn-sm ${showStats ? "btn-warning" : "btn-outline-warning"}`}
                    onClick={() => {
                      setShowStats((s) => !s);
                      setMernTip(`// MERN: MongoDB Aggregation Pipeline\nMessage.aggregate([\n  { $match: { ... } },\n  { $group: {\n      _id: "$sender",\n      count: { $sum: 1 },\n      avgLength: { $avg: ... }\n  }}\n])\n// Like SQL: GROUP BY sender\n// COUNT(*), AVG(LENGTH(content))`);
                    }}
                  >
                    📊 Stats
                  </button>
                </div>
              </div>

              {/* Stats Panel */}
              {showStats && stats.length > 0 && (
                <div className="p-3 bg-warning bg-opacity-10 border-bottom">
                  <h6 className="fw-bold mb-2">📊 Chat Statistics (MongoDB Aggregation)</h6>
                  <div className="row g-2">
                    {stats.map((s) => (
                      <div key={s._id} className="col-6">
                        <div className="card border-0 bg-white shadow-sm p-2 text-center">
                          <div className="fw-bold">{s.count} messages</div>
                          <div className="small text-muted">avg {Math.round(s.avgLength)} chars</div>
                          <div className="small text-primary">{s._id === user.userId ? "You" : selectedUser.username}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Bar */}
              <div className="px-3 pt-2 pb-0 border-bottom bg-light">
                <form onSubmit={handleSearch} className="d-flex gap-2 pb-2">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="🔍 Search messages…"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults(null); }}
                  />
                  <button type="submit" className="btn btn-outline-primary btn-sm">Search</button>
                  {searchResults !== null && (
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => { setSearchResults(null); setSearchQuery(""); }}>✕</button>
                  )}
                </form>
                {searchResults !== null && (
                  <div className="text-muted small pb-2">
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for "{searchQuery}"
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-grow-1 p-3 overflow-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
                {displayMessages.map((msg, index) => {
                  const isMine = msg.sender._id === user.userId || msg.sender._id?.toString() === user.userId;
                  return (
                    <div key={msg._id || index} className={`d-flex mb-3 ${isMine ? "justify-content-end" : "justify-content-start"}`}>
                      <div style={{ maxWidth: "75%" }}>
                        <div
                          className={`rounded p-3 position-relative ${isMine ? "bg-primary text-white" : "bg-light border"}`}
                          style={{ cursor: "pointer" }}
                          onDoubleClick={() => setReactionPickerFor(reactionPickerFor === msg._id ? null : msg._id)}
                        >
                          <div className="small mb-1 opacity-75">{msg.sender.username}</div>
                          {msg.content}
                          <div className="small mt-1 opacity-60 text-end">{formatTime(msg.timestamp)}</div>

                          {/* Read receipt */}
                          {isMine && (
                            <div className="text-end" style={{ fontSize: 10 }}>
                              {msg.read ? "✓✓ seen" : "✓ sent"}
                            </div>
                          )}
                        </div>

                        {/* Reactions display */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {Object.entries(
                              msg.reactions.reduce((acc, r) => {
                                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                return acc;
                              }, {})
                            ).map(([emoji, count]) => (
                              <span
                                key={emoji}
                                className="badge bg-white border text-dark"
                                style={{ cursor: "pointer", fontSize: 14 }}
                                onClick={() => handleReact(msg._id, emoji)}
                                title="Click to react"
                              >
                                {emoji} {count}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Quick reaction picker (double-click message to open) */}
                        {reactionPickerFor === msg._id && (
                          <div className="d-flex gap-1 mt-1 bg-white border rounded p-1 shadow-sm">
                            {REACTIONS.map((e) => (
                              <button
                                key={e}
                                className="btn btn-sm p-1"
                                style={{ fontSize: 18, lineHeight: 1 }}
                                onClick={() => handleReact(msg._id, e)}
                              >
                                {e}
                              </button>
                            ))}
                            <button className="btn btn-sm p-1 text-muted" onClick={() => setReactionPickerFor(null)}>✕</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Typing Indicator */}
                {typingUsers[selectedUser._id] && (
                  <div className="d-flex justify-content-start mb-2">
                    <div className="bg-light border rounded p-2 text-muted small">
                      <em>{selectedUser.username} is typing…</em>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-3 border-top bg-light position-relative">
                <form onSubmit={sendMessage} className="d-flex gap-2">
                  <input
                    type="text"
                    className="form-control"
                    value={inputMessage}
                    onChange={handleInputChange}
                    placeholder="Type a message… (double-click messages to react)"
                  />
                  <div className="position-relative">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={(e) => { e.preventDefault(); setShowPicker((p) => !p); }}
                    >😀</button>
                    {showPicker && (
                      <div style={{ position: "absolute", bottom: "100%", right: 0, zIndex: 9999, marginBottom: 10 }} ref={pickerRef}>
                        <EmojiPicker onEmojiClick={onEmojiClick} width={300} height={400} />
                      </div>
                    )}
                  </div>
                  <button type="submit" className="btn btn-primary">Send</button>
                </form>
              </div>
            </>
          ) : (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted flex-column gap-3">
              <div style={{ fontSize: 48 }}>💬</div>
              <p className="mb-0 fs-5">Select a user to start chatting!</p>
              <p className="small text-muted">Double-click any message to react with an emoji</p>
            </div>
          )}
        </div>
      </div>

      {/* Profile Modal */}
      {showProfile && (
        <div className="modal d-block" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Profile</h5>
                <button className="btn-close" onClick={() => setShowProfile(false)}></button>
              </div>
              <div className="modal-body">
                <label className="form-label fw-bold">Bio</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Tell others about yourself…"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={100}
                />
                <small className="text-muted">This will appear next to your name in chats.</small>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowProfile(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleUpdateBio}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <MernPanel tip={mernTip} />
    </div>
  );
}

export default App;