

const crypto = require('crypto');

class Block {
  constructor(index, timestamp, data, previousHash = '') {
    this.index = index;               // Block number: 0, 1, 2, ...
    this.timestamp = timestamp;       // When the block was created
    this.data = data;                 // What we store (file info)
    this.previousHash = previousHash; // Hash of the block BEFORE this one
    this.hash = this.calculateHash(); // This block's own hash
  }

  
  calculateHash() {
    return crypto
      .createHash('sha256')
      .update(
        this.index +
        this.timestamp +
        JSON.stringify(this.data) +
        this.previousHash
      )
      .digest('hex');
  }
}


class Blockchain {
  constructor() {
    
    this.chain = [this.createGenesisBlock()];
  }

  createGenesisBlock() {
    return new Block(
      0,
      new Date().toISOString(),
      { message: 'Genesis block — the first block in the chain' },
      '0' // The genesis block has no previous block
    );
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  // Create a new block pointing to the latest block, then attach it.
  addBlock(data) {
    const previousBlock = this.getLatestBlock();
    const newBlock = new Block(
      previousBlock.index + 1,
      new Date().toISOString(),
      data,
      previousBlock.hash // ← this is what "chains" the blocks together
    );
    this.chain.push(newBlock);
    return newBlock;
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

     
      if (currentBlock.hash !== currentBlock.calculateHash()) return false;
     
      if (currentBlock.previousHash !== previousBlock.hash) return false;
    }
    return true;
  }

  // Search the chain for a block that stores a given file hash.
  findBlockByFileHash(fileHash) {
    return (
      this.chain.find((block) => block.data && block.data.fileHash === fileHash) ||
      null
    );
  }
}


const fileBlockchain = new Blockchain();

module.exports = { Block, Blockchain, fileBlockchain };