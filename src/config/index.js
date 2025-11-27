require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3025,
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/lead-management-system',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  }
};
