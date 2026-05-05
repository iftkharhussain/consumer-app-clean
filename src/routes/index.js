/**
 * Main Routes Index
 */

const express = require('express');
const router = express.Router();

const leadRoutes = require('./leadRoutes');
const vehicleRoutes = require('./vehicleRoutes');
const authRoutes = require('./authRoutes');
const quoteRoutes = require('./quoteRoutes');
const quoteSessionRoutes = require('./quoteSessionRoutes');
const postalCodeRoutes = require('./postalCodeRoutes');
const fortusRoutes = require('./fortusRoutes');
const productOrderRoutes = require('./productOrderRoutes');
const advisorRoutes = require('./advisorRoutes');
const phoneRoutes = require('./phoneRoutes');

// Mount routes
router.use('/leads', leadRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/auth', authRoutes);
router.use('/quote', quoteRoutes);
router.use('/quote-sessions', quoteSessionRoutes);
router.use('/postal-codes', postalCodeRoutes);
router.use('/fortus', fortusRoutes);
router.use('/product-order', productOrderRoutes);
router.use('/advisor', advisorRoutes);
router.use('/v1/phone', phoneRoutes); // Phone OTP routes (proxied to main backend)

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
