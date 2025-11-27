const logger = require('../utils/logger');

/**
 * Request logging middleware
 * Only logs errors and slow requests (>1000ms)
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log response only for errors or slow requests
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Log errors (4xx, 5xx)
    if (res.statusCode >= 400) {
      logger.error(`${req.method} ${req.path} ${res.statusCode}`, {
        duration: `${duration}ms`,
        ip: req.ip,
      });
    }
    // Log slow requests (>1000ms)
    else if (duration > 1000) {
      logger.warn(`Slow request: ${req.method} ${req.path}`, {
        duration: `${duration}ms`,
      });
    }
  });

  next();
};

module.exports = requestLogger;
