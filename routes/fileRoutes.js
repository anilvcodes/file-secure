const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');

const File = require('../models/File');
const protect = require('../middleware/authMiddleware');
const { calculateFileHash } = require('../utils/fileHash');
const { fileBlockchain } = require('../blockchain/Blockchain');

const router = express.Router();

// Absolute path to the uploads folder (one level up from /routes)
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');

// Maximum allowed file size: 5 MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// File types we never want on the server
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.msi'];

// ---------- Multer configuration ----------
const storage = multer.diskStorage({
  // WHERE to save the file
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  // WHAT name to give it on disk (random, so names never collide
  // and attackers can't guess paths)
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueName + extension);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(extension)) {
      const error = new Error('This file type is not allowed.');
      error.status = 400; // our global error handler will use this
      return cb(error);
    }
    cb(null, true); // accept the file
  },
});

// ---------- Helper: safe absolute path (path traversal protection) ----------
function getSafeFilePath(file) {
  const absolutePath = path.resolve(__dirname, '..', file.filePath);
  // The resolved path MUST stay inside the uploads folder.
  // This blocks tricks like filePath = "../../secrets.txt".
  if (!absolutePath.startsWith(UPLOADS_DIR + path.sep)) return null;
  return absolutePath;
}

// ---------- Helper: find a file AND check the requester owns it ----------
async function findOwnedFile(req, res) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ message: 'File not found.' });
    return null;
  }

  const file = await File.findById(id);
  if (!file) {
    res.status(404).json({ message: 'File not found.' });
    return null;
  }

  // Is this file owned by the logged-in user?
  if (file.owner.toString() !== req.user._id.toString()) {
    res.status(403).json({ message: 'You are not allowed to access this file.' });
    return null;
  }

  return file;
}

// ============================================
// POST /api/files/upload (protected)
// ============================================
router.post('/upload', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded. Please choose a file.' });
    }

    // 1. Calculate the SHA-256 fingerprint of the saved file
    const fileHash = await calculateFileHash(req.file.path);

    // 2. Save the file metadata in MongoDB
    const newFile = await File.create({
      originalName: req.file.originalname,
      storedName: req.file.filename,
      filePath: path.join('uploads', req.file.filename),
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      fileHash,
      blockchainHash: 'pending', // set to the real value just below
      owner: req.user._id,
    });

    // 3. Add the file's fingerprint to the blockchain
    const block = fileBlockchain.addBlock({
      fileId: newFile._id.toString(),
      fileName: newFile.originalName,
      fileHash,
      owner: req.user._id.toString(),
    });

    // 4. Remember which blockchain block holds this fingerprint
    newFile.blockchainHash = block.hash;
    await newFile.save();

    res.status(201).json({
      message: 'File uploaded and secured successfully.',
      file: {
        _id: newFile._id,
        originalName: newFile.originalName,
        fileSize: newFile.fileSize,
        fileHash: newFile.fileHash,
        blockchainHash: newFile.blockchainHash,
        createdAt: newFile.createdAt,
      },
    });
  } catch (error) {
    // If something failed AFTER the file was written to disk,
    // remove the orphan file so we don't collect garbage.
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    console.error('Upload error:', error.message);
    res.status(500).json({ message: 'Server error while uploading the file.' });
  }
});

// ============================================
// GET /api/files (protected) — list MY files
// ============================================
router.get('/', protect, async (req, res) => {
  try {
    // Only the logged-in user's files — nobody else's
    const files = await File.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ files });
  } catch (error) {
    console.error('List files error:', error.message);
    res.status(500).json({ message: 'Server error while loading files.' });
  }
});

// ============================================
// GET /api/files/blockchain/status (protected)
// Bonus endpoint: shows the state of our chain
// ============================================
router.get('/blockchain/status', protect, (req, res) => {
  res.json({
    blocks: fileBlockchain.chain.length,
    isValid: fileBlockchain.isChainValid(),
  });
});

// ============================================
// GET /api/files/:id/download (protected, owner only)
// ============================================
router.get('/:id/download', protect, async (req, res) => {
  try {
    const file = await findOwnedFile(req, res);
    if (!file) return; // a 404/403 response was already sent

    const absolutePath = getSafeFilePath(file);
    if (!absolutePath) {
      return res.status(400).json({ message: 'Invalid file path.' });
    }

    // Make sure the file still exists on disk
    try {
      await fs.access(absolutePath);
    } catch {
      return res.status(404).json({ message: 'File is missing on the server.' });
    }

    // Send the file with its ORIGINAL name
    res.download(absolutePath, file.originalName);
  } catch (error) {
    console.error('Download error:', error.message);
    res.status(500).json({ message: 'Server error while downloading the file.' });
  }
});

// ============================================
// GET /api/files/:id/verify (protected, owner only)
// ============================================
router.get('/:id/verify', protect, async (req, res) => {
  try {
    const file = await findOwnedFile(req, res);
    if (!file) return;

    const absolutePath = getSafeFilePath(file);
    if (!absolutePath) {
      return res.status(400).json({ message: 'Invalid file path.' });
    }

    // Step 1: Read the file from disk and hash it AGAIN
    let currentHash = null;
    try {
      currentHash = await calculateFileHash(absolutePath);
    } catch {
      return res.json({
        verified: false,
        message: 'File is missing from the server, so it cannot be verified.',
      });
    }


    const contentMatches = currentHash === file.fileHash;

    
    const block = fileBlockchain.findBlockByFileHash(file.fileHash);
    const blockchainRecordExists = Boolean(block);

    const verified = contentMatches && blockchainRecordExists;

    let message;
    if (verified) {
      message = 'File is authentic and has not been modified.';
    } else if (contentMatches && !blockchainRecordExists) {
      message = 'File content matches, but its blockchain record is missing.';
    } else {
      message = 'File may have been modified.';
    }

    res.json({ verified, message });
  } catch (error) {
    console.error('Verify error:', error.message);
    res.status(500).json({ message: 'Server error while verifying the file.' });
  }
});


router.delete('/:id', protect, async (req, res) => {
  try {
    const file = await findOwnedFile(req, res);
    if (!file) return;

    const absolutePath = getSafeFilePath(file);
    if (absolutePath) {
      // Remove the physical file. If it's already gone, that's fine.
      await fs.unlink(absolutePath).catch(() => {});
    }

    await File.deleteOne({ _id: file._id });

  
    res.json({ message: 'File deleted successfully.' });
  } catch (error) {
    console.error('Delete error:', error.message);
    res.status(500).json({ message: 'Server error while deleting the file.' });
  }
});

module.exports = router;