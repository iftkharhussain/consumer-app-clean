const express = require('express');
const router = express.Router();
const productOrderController = require('../controllers/productOrderController');
const { authMiddleware } = require('../middlewares/auth');

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/product-order/check
 * Check if user has pending orders for a product
 * Query params: productSlug
 */
router.get('/check', productOrderController.checkPendingOrder);

/**
 * GET /api/product-order/:userProductId
 * Get full order details including selectedQuote
 * Advisor info will be fetched from LMS when needed
 */
router.get('/:userProductId', productOrderController.getOrderDetails);

/**
 * POST /api/product-order
 * Create a product order when user requests a call
 * Body: { userProductId, leadId, productSlug, quoteId?, fortusDeliveryId?, metadata? }
 */
router.post('/', productOrderController.createProductOrder);

/**
 * GET /api/product-order
 * Get user's product orders
 * Query params: productSlug?, status?
 */
router.get('/', productOrderController.getUserOrders);

/**
 * PUT /api/product-order/:orderId
 * Update order status
 * Body: { status?, metadata? }
 */
router.put('/:orderId', productOrderController.updateOrderStatus);

module.exports = router;
