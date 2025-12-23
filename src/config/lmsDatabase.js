/**
 * LMS Database Connection
 * 
 * This module creates a separate connection to the Lead Management System (LMS) database
 * allowing the Consumer App to access LMS data (leads, users, products, etc.)
 */

const mongoose = require('mongoose');

// LMS Database connection string from environment
const LMS_DB_URI = process.env.LMS_DB_URI || process.env.NORGA_DB;

let lmsConnection = null;

if (!LMS_DB_URI) {
  console.error('❌ [LMS DATABASE] LMS_DB_URI is not defined in environment variables');
  console.error('❌ [LMS DATABASE] Available env vars:', Object.keys(process.env).filter(k => k.includes('DB') || k.includes('MONGO')));
} else {
  try {
    // Connection options
    const connectionOptions = {
      maxPoolSize: 5,           // Smaller pool since this is secondary connection
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      retryReads: true,
      bufferCommands: false,
    };

    // Create separate connection to LMS database
    lmsConnection = mongoose.createConnection(LMS_DB_URI, connectionOptions);

    // Connection event handlers
    lmsConnection.on('connected', () => {
      console.log('✅ [LMS DATABASE] Connected to LMS MongoDB');
    });

    lmsConnection.on('disconnected', () => {
      console.log('❌ [LMS DATABASE] Disconnected from LMS MongoDB');
    });

    lmsConnection.on('error', (error) => {
      console.error('💥 [LMS DATABASE] Connection error:', error.message);
    });
  } catch (error) {
    console.error('💥 [LMS DATABASE] Failed to create connection:', error.message);
  }
}


module.exports = lmsConnection;
