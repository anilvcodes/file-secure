const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },  // e.g. "report.pdf"
    storedName: { type: String, required: true },    // random name on disk
    filePath: { type: String, required: true },      // e.g. "uploads/1712-abc.pdf"
    fileSize: { type: Number, required: true },      // in bytes
    mimeType: { type: String, required: true },      // e.g. "application/pdf"
    fileHash: { type: String, required: true },      // SHA-256 fingerprint of content
    blockchainHash: { type: String, required: true },// hash of the block that stores it
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',            // links this file to a user
      required: true,
    },
  },
  { timestamps: true } // adds createdAt automatically
);

module.exports = mongoose.model('File', fileSchema);