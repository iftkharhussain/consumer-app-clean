/**
 * Quote Routes for Consumer App
 * 
 * Endpoints for quote management:
 * - Request quotes
 * - Check quote status
 * - Get quote details
 * - Get carrier configuration
 */

const express = require('express');
const router = express.Router();

const quoteController = require('../controllers/quoteController');
const { authMiddleware, optionalAuthMiddleware } = require('../middlewares/auth');
const carrierConfig = require('../config/carrierConfig');

/**
 * GET /api/quote/carriers
 * Get enabled carriers for the frontend
 * Returns only carriers that are enabled and available for quoting
 * 
 * No auth required - public endpoint for UI configuration
 */
router.get('/carriers', (req, res) => {
    try {
        const enabledCarriers = carrierConfig.getEnabledCarriers();
        const featuredCarrier = carrierConfig.getFeaturedCarrier();

        res.json({
            success: true,
            featuredCarrier,
            carriers: enabledCarriers,
            carrierCodes: enabledCarriers.map(c => c.code)
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to get carrier configuration'
        });
    }
});

/**
 * GET /api/quote/carriers/all
 * Get all carriers with their enabled/disabled status
 * Useful for admin or showing unavailable carriers as "coming soon"
 */
router.get('/carriers/all', (req, res) => {
    try {
        const allCarriers = carrierConfig.getAllCarriersWithStatus();
        const featuredCarrier = carrierConfig.getFeaturedCarrier();

        res.json({
            success: true,
            featuredCarrier,
            defaultEnvironment: carrierConfig.getDefaultEnvironment(),
            carriers: allCarriers
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to get carrier configuration'
        });
    }
});

/**
 * POST /api/quote/carriers/filter
 * Filter requested carriers to enabled/disabled
 * Body: { carriers: ['GC', 'UNI', 'PAF'] }
 * Returns: { enabled: [...], disabled: [...] }
 */
router.post('/carriers/filter', (req, res) => {
    try {
        const { carriers = [] } = req.body;

        if (!Array.isArray(carriers) || carriers.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'carriers array is required'
            });
        }

        const result = carrierConfig.filterCarriers(carriers);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to filter carriers'
        });
    }
});

// ============================================
// AUTHENTICATED ROUTES
// ============================================
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
