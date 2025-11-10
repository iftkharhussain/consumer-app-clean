/**
 * Lead Routes
 */

const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

// Get lead by ID
router.get('/:leadId', leadController.getLead);

// Update lead status
router.patch('/:leadId/status', leadController.updateLeadStatus);

module.exports = router;
