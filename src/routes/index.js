/**
 * Main Routes Index
 */

const express = require('express');
const router = express.Router();

const paperformRoutes = require('./paperformRoutes');
const quoteRoutes = require('./quoteRoutes');
const leadRoutes = require('./leadRoutes');

// Mount routes
router.use('/paperform', paperformRoutes);
router.use('/quotes', quoteRoutes);
router.use('/leads', leadRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
