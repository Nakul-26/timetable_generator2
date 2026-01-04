// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion } from "mongodb";
import cookieParser from "cookie-parser";
import API from "./routes/api.js"; // ensure this uses ESM too
import ManualAPI from "./routes/timetableManual.js";
import mongoose from "mongoose";
// import rateLimit from 'express-rate-limit';

// const mongoose = require('mongoose');

dotenv.config();
const app = express();

// // --- Rate Limiter ---
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
//   legacyHeaders: false, // Disable the `X-RateLimit-*` headers
// });

// --- MongoDB Client ---
// MongoClient: used for admin / low-level access
// Mongoose: used for application models
const uri = process.env.MONGO_URI;
if (!uri) {
  throw new Error("❌ MONGO_URI is not defined in .env");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function connectDB() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB via MongoClient");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1); // Exit if cannot connect
  }
}
connectDB();

// --- Middleware ---
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://timetable-generator-3tvm-git-main-nakul-26s-projects.vercel.app",
    "https://timetable-generator-3tvm.vercel.app",
  ],
  optionsSuccessStatus: 200,
  credentials: true
};

// const corsOptions = {
//   origin: process.env.CORS_ORIGINS?.split(",") || [
//     "http://localhost:5173"
//   ],
//   credentials: true
// };

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

mongoose.connect(uri, {
  dbName: 'timetable_jayanth',
  serverSelectionTimeoutMS: 20000 // Increase timeout for stability
})
    .then(() => {
        console.log("✅ Connected to MongoDB via Mongoose");
    })
    .catch((err) => {
        console.error("❌ Mongoose connection error:", err);
    });

// Logging middleware
app.use((req, res, next) => {
  console.log(`📥 Incoming request: ${req.method} ${req.url}`);
  console.log("👉 Headers:", req.headers.origin);
  if (req.body && Object.keys(req.body).length > 0) {
    if (process.env.NODE_ENV !== "production") {
      console.log("👉 Body:", req.body);
    }
  }
  console.log("👉 Query:", req.query);
  console.log("👉 Params:", req.params);
  console.log("👉 IP:", req.ip);
  console.log("👉 Time:", new Date().toISOString());
  next();
});

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

// --- Routes ---
app.use("/api", API);
app.use("/api/manual", ManualAPI);
app.get("/", (req, res) => {
  res.send("API is working 2");
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);

let isShuttingDown = false;

const gracefulShutdown = async (reason, exitCode, err) => {
  if (isShuttingDown) {
    console.log("Graceful shutdown already in progress, ignoring duplicate signal.");
    return;
  }
  isShuttingDown = true;

  console.error(`❌ ${reason}`);
  if (err) console.error("Associated error:", err);

  server.close(async () => {
    console.log("🔌 Server closed. Closing database connections...");
    try {
      await mongoose.connection.close(false);
      console.log("Mongoose connection closed.");
      await client.close();
      console.log("MongoClient connection closed.");
      console.log("🛑 Clean shutdown complete.");
    } catch (e) {
      console.error("❗️Error during database connection closing:", e);
    } finally {
      process.exit(exitCode);
    }
  });

  // Force shutdown if server.close() hangs
  setTimeout(() => {
    console.error("❗️Could not close connections in time, forcing shutdown.");
    process.exit(exitCode);
  }, 10000).unref(); // 10 seconds
};

process.on("unhandledRejection", (err) =>
  gracefulShutdown("UNHANDLED PROMISE REJECTION", 1, err)
);

process.on("uncaughtException", (err) =>
  gracefulShutdown("UNCAUGHT EXCEPTION", 1, err)
);

process.on("SIGTERM", () =>
  gracefulShutdown("SIGTERM RECEIVED", 0)
);

process.on("SIGINT", () =>
  gracefulShutdown("SIGINT RECEIVED", 0)
);

// --- Start Server ---
// const PORT = process.env.PORT;
// app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));