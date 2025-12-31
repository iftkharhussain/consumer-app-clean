/**
 * Consumer App API - Main Application File
 */

// Load environment variables based on NODE_ENV or env file argument
const path = require('path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/database');
const config = require('./config');
const logger = require('./utils/logger');
const requestLogger = require('./middlewares/requestLogger');
const { errorHandler, notFound } = require('./middlewares/errorHandler');
const { authMiddleware } = require('./middlewares/auth');
const { uploadSingle } = require('./middlewares/upload');
const authController = require('./controllers/authController');
const routes = require('./routes');

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL,
      'https://consumer.norga.app',
      'https://www.norga.io',
      'https://norga.io',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002'
    ].filter(Boolean);
    
    // Allow requests with no origin (same-origin requests, mobile apps, etc.)
    if (!origin) {
      console.log('CORS: No origin, allowing request');
      return callback(null, true);
    }
    
    if (allowed.includes(origin)) {
      console.log('CORS: Origin allowed');
      callback(null, true);
    } else {
      console.log('CORS: Origin not allowed');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve question form static assets directly from question-form directory
app.use('/question-form', express.static(path.join(__dirname, '..', 'question-form')));

// Serve static files from the public directory (React build)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Request logging (only errors and slow requests)
app.use(requestLogger);

// Profile picture upload endpoint (before API routes to avoid conflicts)
app.post('/app/profile-pic', authMiddleware, uploadSingle, authController.uploadProfilePicture);

// API Routes
app.use('/api', routes);

// Catch-all route to serve React app for client-side routing
// This must be after API routes
app.get('*', (req, res, next) => {
  // If the request is for an API route, pass to next handler (404)
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 404 handler (for API routes that don't exist)
app.use(notFound);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Application started successfully on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', { error: err.message, stack: err.stack });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = app;
