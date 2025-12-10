// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion } from "mongodb";
import cookieParser from "cookie-parser";
import API from "./models/routes/api.js"; // ensure this uses ESM too
import mongoose from "mongoose";
import rateLimit from 'express-rate-limit';

// const mongoose = require('mongoose');

dotenv.config();
const app = express();

// --- Rate Limiter ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});




// --- MongoDB Client ---
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
app.use(cors(corsOptions));
app.use(express.json());
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
    console.log("👉 Body:", req.body);
  }
  console.log("👉 Query:", req.query);
  console.log("👉 Params:", req.params);
  console.log("👉 IP:", req.ip);
  console.log("👉 Time:", new Date().toISOString());
  next();
});

// --- Routes ---


app.use("/api", API);
app.get("/", (req, res) => {
  res.send("API is working 2");
});




// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.log(`Error: ${err.message}`);
    // Close server & exit process
    server.close(() => process.exit(1));
});

// --- Start Server ---
const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));