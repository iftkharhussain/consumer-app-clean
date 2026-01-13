/**
 * Postal Code Routes
 * API endpoints for postal code and location index lookups
 */
const express = require('express');
const router = express.Router();
const postalCodeController = require('../controllers/postalCodeController');
const { optionalAuthMiddleware } = require('../middlewares/auth');

// Postal code routes use optional auth (work for both authenticated and guest users)
router.use(optionalAuthMiddleware);

// GET /api/postal-codes/location-index - Get location index by postal code
router.get('/location-index', postalCodeController.getLocationIndex);

// POST /api/postal-codes/location-index-from-address - Get location index from full address
router.post('/location-index-from-address', postalCodeController.getLocationIndexFromAddress);

module.exports = router;
