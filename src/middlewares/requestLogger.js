const logger = require('../utils/logger');

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.info(`Incoming ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`Completed ${req.method} ${req.path} ${res.statusCode}`, {
      duration: `${duration}ms`,
    });
  });

  next();
};

module.exports = requestLogger;
