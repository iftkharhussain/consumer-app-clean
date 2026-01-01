/**
 * Authentication Middleware
 * 
 * Verifies session tokens and attaches user info to requests.
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const SESSION_SECRET = process.env.JWT_SECRET || 'session-secret-change-in-production';

/**
 * Authentication middleware
 * 
 * Extracts and verifies the session token from:
 * 1. Authorization header (Bearer token)
 * 2. Cookie (session)
 * 
 * Attaches userId to req if valid.
 */
function authMiddleware(req, res, next) {
  try {
    let token = null;

    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // Fall back to cookie
    if (!token && req.cookies?.session) {
      token = req.cookies.session;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, SESSION_SECRET);

    if (decoded.type !== 'session') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type'
      });
    }

    // Attach user info to request
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userPhone = decoded.phone;
    req.leadId = decoded.leadId;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired'
      });
    }

    logger.error('Auth middleware error', { error: error.message });
    return res.status(401).json({
      success: false,
      message: 'Invalid session'
    });
  }
}

/**
 * Optional authentication middleware
 * 
 * Same as authMiddleware but doesn't fail if no token present.
 * Useful for endpoints that work differently for authenticated users.
 */
function optionalAuthMiddleware(req, res, next) {
  try {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token && req.cookies?.session) {
      token = req.cookies.session;
    }

    if (token) {
      const decoded = jwt.verify(token, SESSION_SECRET);
      if (decoded.type === 'session') {
        req.userId = decoded.userId;
        req.userEmail = decoded.email;
        req.userPhone = decoded.phone;
        req.leadId = decoded.leadId;
      }
    }

    next();
  } catch (error) {
    // Don't fail, just continue without user
    next();
  }
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware
};
