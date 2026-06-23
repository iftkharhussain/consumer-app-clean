const express = require('express');
const router = express.Router();
const advisorController = require('../controllers/advisorController');

// Proxy route to get advisors for a user email
// GET /api/advisor/all?email=user@example.com
router.get('/all', advisorController.getAllAdvisors);

module.exports = router;
