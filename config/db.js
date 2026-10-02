const mongoose = require('mongoose');

// Connects our app to MongoDB.
// Called once from server.js before the server starts listening.
const connectDB = async () => {
  try {
    const mongoUri =
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/file_secure_system';

    const connection = await mongoose.connect(mongoUri);
    console.log(`MongoDB connected: ${connection.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1); // Stop the app — it cannot work without a database
  }
};

module.exports = connectDB;