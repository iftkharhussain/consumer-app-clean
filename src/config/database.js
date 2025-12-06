const mongoose = require('mongoose');
const config = require('./index');

// Extract database name from connection string
const extractDbName = (connString) => {
  if (!connString) return 'NOT SET';
  const match = connString.match(/\/([^/?]+)(\?|$)/);
  return match ? match[1] : 'unknown';
};

// LMS Database connection (separate connection for shared data)
let lmsConnection = null;

const connectDB = async () => {
  // Startup environment info
  console.log('='.repeat(60));
  console.log('🔧 ENVIRONMENT CONFIGURATION');
  console.log('='.repeat(60));
  console.log(`📍 NODE_ENV: ${config.env}`);
  console.log(`🗄️  Consumer DB: ${extractDbName(config.mongodb.uri)}`);
  console.log(`🗄️  LMS DB: ${extractDbName(config.lmsDb.uri)}`);
  console.log('='.repeat(60));

  try {
    // Connect to Consumer App Database (primary)
    const conn = await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    console.log(`✅ [DATABASE] Connected to Consumer DB (${extractDbName(config.mongodb.uri)})`);
    
    // Connect to LMS Database (shared)
    lmsConnection = mongoose.createConnection(config.lmsDb.uri, config.lmsDb.options);
    
    lmsConnection.on('connected', () => {
      console.log(`✅ [DATABASE] Connected to LMS DB (${extractDbName(config.lmsDb.uri)})`);
    });
    
    lmsConnection.on('error', (err) => {
      console.error(`❌ [DATABASE] LMS DB connection error:`, err.message);
    });
    
    lmsConnection.on('disconnected', () => {
      console.log(`❌ [DATABASE] Disconnected from LMS DB`);
    });
    
    // Handle primary connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ [DATABASE] Consumer DB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('❌ [DATABASE] Disconnected from Consumer DB');
    });
    
    // Handle application termination
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      if (lmsConnection) await lmsConnection.close();
      console.log('✅ [DATABASE] All connections closed due to app termination');
      process.exit(0);
    });
    
    return conn;
  } catch (error) {
    console.error('💥 [DATABASE] Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

// Export LMS connection for use in services
const getLmsConnection = () => lmsConnection;

module.exports = connectDB;
module.exports.getLmsConnection = getLmsConnection;
