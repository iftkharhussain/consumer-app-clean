/**
 * Quote Routes
 */

const express = require('express');
const router = express.Router();
const quoteController = require('../controllers/quoteController');

// Get quote by ID
router.get('/:quoteId', quoteController.getQuote);

// Get quote result page
router.get('/:quoteId/result', quoteController.getQuoteResult);

// Create new quote
router.post('/', quoteController.createQuote);

module.exports = router;
