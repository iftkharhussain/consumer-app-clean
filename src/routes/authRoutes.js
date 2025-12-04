/**
 * Authentication Routes
 * 
 * Handles all authentication-related endpoints including:
 * - Traditional email/password authentication
 * - Phone-based authentication  
 * - Lead-based token authentication
 * - Token validation
 * - Session management
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/auth');

/**
 * Traditional Authentication
 */

/**
 * POST /api/auth/login
 * 
 * Email/password login
 * Body: { email: string, password: string }
 */
router.post('/login', authController.login);

/**
 * POST /api/auth/phone-login
 * 
 * Phone-based login (for verified lead users)
 * Body: { phone: string }
 */
router.post('/phone-login', authController.phoneLogin);

/**
 * POST /api/auth/register
 * 
 * Create new account with email/password
 * Body: { email: string, password: string, phone: string, firstName?: string, lastName?: string }
 */
router.post('/register', authController.register);

/**
 * Lead-Based Authentication
 */

/**
 * POST /api/auth/lead-login
 * 
 * Authenticate using a token from the lead management system.
 * Creates user if needed and establishes a session.
 * 
 * Body: { token: string }
 */
router.post('/lead-login', authController.leadLogin);

/**
 * POST /api/auth/check-token
 * 
 * Validate a lead login token without creating a session.
 * 
 * Body: { token: string }
 */
router.post('/check-token', authController.checkToken);

/**
 * Session Management
 */

/**
 * GET /api/auth/verify
 * 
 * Verify current session token and get user info
 * Requires authentication.
 */
router.get('/verify', authMiddleware, authController.verifyAuth);

/**
 * GET /api/auth/me
 * 
 * Get the currently authenticated user.
 * Requires authentication.
 */
router.get('/me', authMiddleware, authController.getCurrentUser);

/**
 * POST /api/auth/logout
 * 
 * Logout the current user (clears session).
 */
router.post('/logout', authController.logout);

module.exports = router;
