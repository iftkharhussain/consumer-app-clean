const path = require('path');
// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });

console.log('🔧 [CONFIG] Environment file:', envFile);
console.log('🔧 [CONFIG] MONGODB_URI loaded:', !!process.env.MONGODB_URI);
console.log('🔧 [CONFIG] MongoDB URI:', process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/:[^:@]*@/, ':***@') : 'NOT SET');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3025,
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/consumer_app',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  // LMS Database connection (shared database for leads)
  lmsDb: {
    uri: process.env.LMS_DB_URI || 'mongodb://localhost:27017/app',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  }
};
