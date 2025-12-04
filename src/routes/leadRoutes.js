/**
 * Lead Routes
 */

const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const { authMiddleware } = require('../middlewares/auth');

// All lead routes require authentication
router.use(authMiddleware);

// Get lead by ID
router.get('/:leadId', leadController.getLead);

// Update lead status
router.patch('/:leadId/status', leadController.updateLeadStatus);

module.exports = router;
