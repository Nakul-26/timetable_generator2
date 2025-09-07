const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require("dotenv").config();

// Assuming your routes are set up to use Mongoose models
const API = require('./models/routes/api');

const corsOptions = {
origin: [
    "http://localhost:5173", // local frontend
    "https://timetable-generator-3tvm-git-main-nakul-26s-projects.vercel.app",
    "https://timetable-generator-3tvm.vercel.app/" // deployed frontend
  ],
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

// --- Corrected Database Connection ---
const uri = process.env.MONGO_URI;

// mongoose.connect(uri, {
//   dbName: 'test2',
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
//   serverSelectionTimeoutMS: 20000 // Increase timeout for stability
// })
// .then(() => {
//   console.log("✅ Connected to MongoDB via Mongoose");
// })
// .catch((err) => {
//   console.error("❌ Mongoose connection error:", err);
// });
let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  try {
    await mongoose.connect(uri, {
      dbName: 'test2',
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 50000
    });
    isConnected = true;
    console.log("✅ Connected to MongoDB via Mongoose");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    throw err;
  }
}












// Log all incoming requests
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
  console.log("response:",res);
  console.log("--------------------------------------------------");
  next();
});

// --- Routes ---
app.use('/api', API);

app.get('/', (req, res) => {
  res.send('API is working 2');
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));