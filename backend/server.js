const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require("dotenv").config();

// Assuming your routes are set up to use Mongoose models
const API = require('./models/routes/api');

const corsOptions = {
  origin: 'frontend_URL' in process.env ? process.env.frontend_URL : 'http://localhost:3000',
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

const options = {
  httpOnly: true,
  secure: true,
  sameSite: 'None',
  path: '/' 
};

const app = express();
app.use(cors(corsOptions, options));
app.use(express.json());

// --- Corrected Database Connection ---
const uri = process.env.MONGO_URI;

mongoose.connect(uri, {
  dbName: 'test2',
  serverSelectionTimeoutMS: 20000 // Increase timeout for stability
})
.then(() => {
  console.log("✅ Connected to MongoDB via Mongoose");
})
.catch((err) => {
  console.error("❌ Mongoose connection error:", err);
});

// --- Routes ---
app.use('/api', API);

app.get('/', (req, res) => {
  res.send('API is working 2');
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));