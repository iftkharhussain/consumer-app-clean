/**
 * Consumer App API - Main Application File
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/database');
const config = require('./config');
const logger = require('./utils/logger');
const requestLogger = require('./middlewares/requestLogger');
const { errorHandler, notFound } = require('./middlewares/errorHandler');
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
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002'
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files from the public directory (React build)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Request logging (only errors and slow requests)
app.use(requestLogger);

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
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Environment: ${config.env}`);
  logger.info(`API available at: http://localhost:${PORT}`);
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
