/**
 * Paperform Routes
 */

const express = require('express');
const router = express.Router();
const paperformController = require('../controllers/paperformController');

// Webhook endpoint for Paperform submissions
router.post('/webhook', paperformController.handleWebhook);

// Test endpoint
router.get('/test', paperformController.testWebhook);
router.post('/test', paperformController.testWebhook);

module.exports = router;
