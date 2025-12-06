/**
 * Quote Routes for Consumer App
 * 
 * Endpoints for quote management:
 * - Request quotes
 * - Check quote status
 * - Get quote details
 */

const express = require('express');
const router = express.Router();

const quoteController = require('../controllers/quoteController');
const { authMiddleware } = require('../middlewares/auth');

// All quote routes require authentication
router.use(authMiddleware);

/**
 * POST /api/quote/request
 * Request a quote for a user's product
 * Body: { productSlug: string } or { userProductId: string }
 */
router.post('/request', quoteController.requestQuote);

/**
 * GET /api/quote/products
 * Get all user products with their quote statuses
 */
router.get('/products', quoteController.getUserProducts);

/**
 * GET /api/quote/status/:userProductId
 * Get quote status for a specific user product
 */
router.get('/status/:userProductId', quoteController.getQuoteStatus);

/**
 * GET /api/quote/status
 * Get quote status by productSlug (query param)
 * Query: ?productSlug=car-insurance
 */
router.get('/status', quoteController.getQuoteStatus);

/**
 * GET /api/quote/details/:userProductId
 * Get full quote details from LMS database
 */
router.get('/details/:userProductId', quoteController.getQuoteDetails);

/**
 * GET /api/quote/fetch
 * Fetch quote for a product - single endpoint that:
 * 1. Finds user's product
 * 2. Checks if quote exists
 * 3. If not, requests quote from LMS
 * 4. Returns quote results
 * Query: ?productSlug=car-insurance
 */
router.get('/fetch', quoteController.fetchQuote);

module.exports = router;
