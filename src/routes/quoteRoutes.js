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
 * Request a quote for a user's product (LEGACY - uses product lookup)
 * Body: { productSlug: string } or { userProductId: string }
 */
router.post('/request', quoteController.requestQuote);

/**
 * POST /api/quote/request-direct
 * Request a quote directly (SIMPLIFIED - no product lookup needed)
 * Body: { 
 *   leadId: string,        // Required - all_leads._id
 *   carriers: string[],    // Optional - defaults to ['UNI']
 *   environment: string,   // Optional - 'test' or 'production'
 *   quoteType: string,     // Optional - 'auto' or 'home'
 *   forceNew: boolean      // Optional - skip existing quote check
 * }
 */
router.post('/request-direct', quoteController.requestQuoteDirect);

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
 * 
 * NOTE: For multiple products of same type (e.g., 2 cars), use /fetch-by-id/:userProductId
 */
router.get('/fetch', quoteController.fetchQuote);

/**
 * GET /api/quote/products/:productSlug
 * Get ALL products matching a product type (supports multiple of same type)
 * Example: /api/quote/products/car-insurance returns all car-insurance products
 * 
 * Use this to list multiple products before using fetch-by-id
 */
router.get('/products/:productSlug', quoteController.getProductsBySlug);

/**
 * GET /api/quote/fetch-by-id/:userProductId
 * Fetch quote for a SPECIFIC product by its unique ID
 * Essential for handling multiple products of same type (e.g., 2 car-insurance)
 * 
 * Use /products/:productSlug first to get list of userProductIds
 */
router.get('/fetch-by-id/:userProductId', quoteController.fetchQuoteById);

// ============================================
// ASYNC POLLING ENDPOINTS
// ============================================

/**
 * GET /api/quote/poll/:quoteId
 * Poll quote status by quoteId (Async Polling Pattern)
 * 
 * Call this every 5 seconds after requesting a quote until status is:
 * - 'success': Quote completed successfully, includes carriers data
 * - 'failed': Quote request failed
 * - 'timeout': Quote timed out after 5 minutes
 * 
 * While polling, status will be:
 * - 'pending': Quote request received, waiting to process
 * - 'processing': Quote is being processed by carriers
 */
router.get('/poll/:quoteId', quoteController.pollQuoteStatus);

/**
 * GET /api/quote/by-lead/:leadId
 * Get all quotes for a specific lead
 * 
 * Returns all quote records associated with a lead,
 * useful for checking history or multiple quote attempts.
 */
router.get('/by-lead/:leadId', quoteController.getQuotesByLead);

module.exports = router;
