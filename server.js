
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const File = require('./models/File');
const { fileBlockchain } = require('./blockchain/Blockchain');

// Safety check: the app cannot sign tokens without a secret
if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET is missing.');
  console.error('Create a .env file in the project root (see the setup guide).');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// ---------- Middleware (runs on EVERY request, in this order) ----------
app.use(helmet());        // Adds safe HTTP headers automatically
app.use(cors());          // Allows cross-origin requests (basic setup)
app.use(express.json());  // Lets Express read JSON request bodies

// Serve the frontend (HTML/CSS/JS) from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// ---------- API routes ----------
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error.message); // full detail only in the console

  // Multer errors (upload problems) → friendly 400 messages
  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum allowed size is 5 MB.'
        : `Upload error (${error.code}).`;
    return res.status(400).json({ message });
  }

  // Errors we created ourselves carry a .status property
  if (error.status) {
    return res.status(error.status).json({ message: error.message });
  }

  // Everything else: hide internal details from the user
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

// ---------- Start the server ----------
async function startServer() {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Make sure the uploads folder exists
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // 3. Rebuild the blockchain from files saved in MongoDB.
  //    Our chain lives in memory, so after a restart we rebuild it
  //    from the database (oldest file first) so verification
  //    keeps working across restarts.
  const savedFiles = await File.find({}).sort({ createdAt: 1 });
  for (const savedFile of savedFiles) {
    fileBlockchain.addBlock({
      fileId: savedFile._id.toString(),
      fileName: savedFile.originalName,
      fileHash: savedFile.fileHash,
      owner: savedFile.owner.toString(),
    });
  }
  console.log(`Blockchain ready: ${fileBlockchain.chain.length} block(s).`);

  // 4. Listen for requests
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();