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
  try {
    // Connect to Consumer App Database (primary)
    console.log('[DATABASE] Connecting to:', config.mongodb.uri);
    const conn = await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    
    console.log(`✅ [DATABASE] Connected to Consumer DB: ${conn.connection.host} / ${conn.connection.name}`);
    console.log(`[DATABASE] Connection ready state: ${mongoose.connection.readyState}`);
    console.log(`[DATABASE] Write concern: ${JSON.stringify(mongoose.connection.writeConcern || 'default')}`);
    
    // Debug: Check database and collections after connection
    setTimeout(async () => {
      try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`[DATABASE] Available collections: ${collections.map(c => c.name).join(', ')}`);
        
        // Check if users collection exists and count
        if (collections.some(c => c.name === 'users')) {
          const User = mongoose.connection.db.collection('users');
          const userCount = await User.countDocuments();
          console.log(`[DATABASE] Users collection exists with ${userCount} documents`);
          
          if (userCount > 0) {
            const adminUser = await User.findOne({ email: 'admin@norga.io' }, { projection: { email: 1, role: 1, isAdmin: 1 } });
          }
        } else {
          console.log(`[DATABASE] Users collection not found!`);
        }
      } catch (debugError) {
        console.error(`[DATABASE] Debug error:`, debugError.message);
      }
    }, 2000); // Wait 2 seconds for full connection
    
    // Connect to LMS Database (shared)
    lmsConnection = mongoose.createConnection(config.lmsDb.uri, config.lmsDb.options);
    
    lmsConnection.on('connected', () => {
      console.log(`[DATABASE] Connected to LMS DB (${extractDbName(config.lmsDb.uri)})`);
    });
    
    lmsConnection.on('error', (err) => {
      console.error(`[DATABASE] LMS DB connection error:`, err.message);
    });
    
    lmsConnection.on('disconnected', () => {
      console.log(`[DATABASE] Disconnected from LMS DB`);
    });
    
    // Handle primary connection events
    mongoose.connection.on('error', (err) => {
      console.error('[DATABASE] Consumer DB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('[DATABASE] Disconnected from Consumer DB');
    });
    
    // Handle application termination
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      if (lmsConnection) await lmsConnection.close();
      console.log('[DATABASE] All connections closed due to app termination');
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
