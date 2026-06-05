const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authMiddleware } = require('../middlewares/auth');

// Public route for tracking page views and events (so Webflow script can hit it)
router.post('/track', analyticsController.trackEvent);

// Authenticated route for viewing conversion funnel metrics
router.get('/funnel', authMiddleware, analyticsController.getFunnelReport);

module.exports = router;
