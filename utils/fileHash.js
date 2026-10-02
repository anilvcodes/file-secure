const crypto = require('crypto');
const fs = require('fs').promises;


async function calculateFileHash(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
}

module.exports = { calculateFileHash };