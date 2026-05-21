/**
 * In-Memory Rate Limiter Middleware
 * 
 * IP-based rate limiting for sensitive endpoints (login, OTP).
 * No external dependencies required.
 * 
 * Note: In-memory store resets on server restart. For production with
 * multiple instances, consider using Redis-backed rate limiting.
 */

const logger = require('../utils/logger');

// Store: { [key]: { count, firstRequest, blockedUntil } }
const store = new Map();

// Clean up expired entries every 10 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    // Remove entries that are past their window AND not blocked
    if (!entry.blockedUntil && now - entry.firstRequest > 15 * 60 * 1000) {
      store.delete(key);
    }
    // Remove entries whose block has expired
    if (entry.blockedUntil && now > entry.blockedUntil) {
      store.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Create a rate limiter middleware
 * 
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 15 min)
 * @param {number} options.maxAttempts - Max requests per window (default: 10)
 * @param {number} options.blockDurationMs - How long to block after exceeding limit (default: 30 min)
 * @param {string} options.keyPrefix - Prefix for the store key to separate different limiters
 * @param {Function} options.keyGenerator - Custom function to generate rate limit key from req (default: IP-based)
 * @param {boolean} options.skipSuccessfulRequests - If true, don't count successful responses (default: false)
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000,        // 15 minutes
    maxAttempts = 10,
    blockDurationMs = 30 * 60 * 1000,  // 30 minutes
    keyPrefix = 'rl',
    keyGenerator = null,
    skipSuccessfulRequests = false,
  } = options;

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = keyGenerator 
      ? `${keyPrefix}:${keyGenerator(req)}`
      : `${keyPrefix}:${ip}`;

    const now = Date.now();
    let entry = store.get(key);

    // Check if currently blocked
    if (entry && entry.blockedUntil && now < entry.blockedUntil) {
      const remainingMs = entry.blockedUntil - now;
      const remainingMin = Math.ceil(remainingMs / (60 * 1000));

      logger.warn('Rate limit: request blocked', { 
        ip, key, remainingMin, 
        blockedUntil: new Date(entry.blockedUntil).toISOString() 
      });

      return res.status(429).json({
        success: false,
        rateLimited: true,
        message: `Trop de tentatives. Veuillez réessayer dans ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.`,
        retryAfterMs: remainingMs
      });
    }

    // Reset if window has passed
    if (entry && (now - entry.firstRequest > windowMs)) {
      store.delete(key);
      entry = null;
    }

    // Initialize entry if not exists
    if (!entry) {
      entry = { count: 0, firstRequest: now, blockedUntil: null };
      store.set(key, entry);
    }

    // If skipSuccessfulRequests, we need to count after the response
    if (skipSuccessfulRequests) {
      // Override res.json to check response status
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Only count failed requests
        if (!body?.success) {
          entry.count++;
          if (entry.count >= maxAttempts) {
            entry.blockedUntil = now + blockDurationMs;
            logger.warn('Rate limit: threshold exceeded, blocking', { 
              ip, key, count: entry.count, maxAttempts,
              blockedUntil: new Date(entry.blockedUntil).toISOString()
            });
          }
        }
        return originalJson(body);
      };
    } else {
      // Count every request
      entry.count++;
      if (entry.count > maxAttempts) {
        entry.blockedUntil = now + blockDurationMs;
        logger.warn('Rate limit: threshold exceeded, blocking', { 
          ip, key, count: entry.count, maxAttempts,
          blockedUntil: new Date(entry.blockedUntil).toISOString()
        });

        const remainingMin = Math.ceil(blockDurationMs / (60 * 1000));
        return res.status(429).json({
          success: false,
          rateLimited: true,
          message: `Trop de tentatives. Veuillez réessayer dans ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.`,
          retryAfterMs: blockDurationMs
        });
      }
    }

    next();
  };
}

// ─── Pre-configured limiters for auth routes ─────────────────────────────────

/**
 * Phone login rate limiter
 * Limits phone lookup attempts per IP.
 * - 6 failed attempts per 15 min window → blocked for 30 min
 * - Only counts failed requests (successful lookups don't count)
 */
const phoneLoginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,       // 15 min window
  maxAttempts: 6,                  // 6 failed attempts
  blockDurationMs: 30 * 60 * 1000, // block for 30 min
  keyPrefix: 'phone-login',
  skipSuccessfulRequests: true,
});

/**
 * OTP verification rate limiter
 * Limits OTP code guessing per IP.
 * - 5 failed attempts per 10 min window → blocked for 60 min
 * - Only counts failed requests
 */
const otpVerifyLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,       // 10 min window
  maxAttempts: 5,                  // 5 failed attempts
  blockDurationMs: 60 * 60 * 1000, // block for 1 hour
  keyPrefix: 'otp-verify',
  skipSuccessfulRequests: true,
});

/**
 * Email/password login rate limiter
 * - 5 failed attempts per 15 min window → blocked for 15 min
 * - Only counts failed requests
 */
const emailLoginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,       // 15 min window
  maxAttempts: 5,                  // 5 failed attempts
  blockDurationMs: 15 * 60 * 1000, // block for 15 min
  keyPrefix: 'email-login',
  skipSuccessfulRequests: true,
});

/**
 * Phone login complete rate limiter
 * - 5 failed attempts per 15 min window → blocked for 30 min
 */
const phoneLoginCompleteLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
  blockDurationMs: 30 * 60 * 1000,
  keyPrefix: 'phone-complete',
  skipSuccessfulRequests: true,
});

module.exports = {
  createRateLimiter,
  phoneLoginLimiter,
  otpVerifyLimiter,
  emailLoginLimiter,
  phoneLoginCompleteLimiter,
};
