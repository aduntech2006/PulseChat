// server.js
import postgres from "postgres";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";

// Routes & Socket handlers
import authRoutes from "./routes/authRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import { setupSocketHandlers } from "./socket/socketHandlers.js";

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;

// ---------- Uploads Directory ----------
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ---------- CORS Configuration ----------
const allowedOrigins = [
  "http://localhost:5174",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://chat-realtime-front.vercel.app" // Add your actual Vercel URL
];

const corsOptions = {
  origin: function (origin, callback) {
    console.log("CORS origin:", origin);

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`CORS blocked origin: ${origin}`);
      callback(new Error(`CORS policy: No access from ${origin}`), false);
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

// ✅ Apply CORS globally (no wildcard path errors)
app.use(cors(corsOptions));
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// ---------- Socket.IO Setup ----------
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
  }
});

// Initialize socket handlers
setupSocketHandlers(io);

// ---------- Health Check ----------
app.get("/", (req, res) => {
  res.json({
    message: "Chat API is running",
    timestamp: new Date().toISOString(),
    status: "healthy",
    environment: process.env.NODE_ENV || "development"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || "development"
  });
});

// ---------- Routes ----------
app.use("/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);

// ---------- Error Handling ----------
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : "Something went wrong"
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ---------- Graceful Shutdown ----------
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});

// ---------- Start Server ----------
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`📁 Upload directory: ${uploadDir}`);
  console.log(`🌐 CORS origins: ${allowedOrigins.join(", ")}`);
  console.log(`🔗 Files served at: http://localhost:${PORT}/uploads`);
  console.log(`🏠 API Base: http://localhost:${PORT}`);
});

// ---------- Database Connection Test ----------
const sql = postgres(process.env.DATABASE_URL, {
  ssl: { rejectUnauthorized: false } // Required for Supabase
});

(async () => {
  try {
    const result = await sql`SELECT NOW() AS current_time`;
    console.log("✅ Database connected!");
    console.log("🕒 Current time:", result[0].current_time);
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
})();
