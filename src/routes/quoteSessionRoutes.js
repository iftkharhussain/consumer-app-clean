const express = require('express');
const router = express.Router();
const quoteSessionController = require('../controllers/quoteSessionController');
const { authMiddleware } = require('../middlewares/auth');

/**
 * Quote Session Routes
 * 
 * All routes require authentication
 */

// Create new quote session
router.post(
  '/',
  authMiddleware,
  quoteSessionController.createQuoteSession
);

// Get all quote sessions for current user
router.get(
  '/',
  authMiddleware,
  quoteSessionController.getQuoteSessions
);

// Get active quote session
router.get(
  '/active',
  authMiddleware,
  quoteSessionController.getActiveQuoteSession
);

// Activate a specific quote session
router.put(
  '/:sessionId/activate',
  authMiddleware,
  quoteSessionController.activateQuoteSession
);

// Update quote session status
router.put(
  '/:sessionId/status',
  authMiddleware,
  quoteSessionController.updateQuoteSessionStatus
);

// Link user products to session
router.post(
  '/:sessionId/products',
  authMiddleware,
  quoteSessionController.linkUserProductsToSession
);

module.exports = router;
