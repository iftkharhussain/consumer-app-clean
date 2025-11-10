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
  fortus: {
    apiUrl: process.env.FORTUS_API_URL || 'https://ratingwebservices.compu-quote.com/RatingWebService.asmx',
    username: process.env.FORTUS_USERNAME,
    password: process.env.FORTUS_PASSWORD,
    callerName: process.env.FORTUS_CALLER_NAME || 'consumer-app-api',
    callerVersion: process.env.FORTUS_CALLER_VERSION || '1.0.0',
    majorVersion: process.env.FORTUS_MAJOR_VERSION || '6',
    minorVersion: process.env.FORTUS_MINOR_VERSION || '1',
    build: process.env.FORTUS_BUILD || '5',
  },
  paperform: {
    webhookSecret: process.env.PAPERFORM_WEBHOOK_SECRET || '',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  }
};
