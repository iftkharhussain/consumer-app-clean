/**
 * Main Routes Index
 */

const express = require('express');
const router = express.Router();

const leadRoutes = require('./leadRoutes');
const vehicleRoutes = require('./vehicleRoutes');
const authRoutes = require('./authRoutes');
const quoteRoutes = require('./quoteRoutes');

// Mount routes
router.use('/leads', leadRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/auth', authRoutes);
router.use('/quote', quoteRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
