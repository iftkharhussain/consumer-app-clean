/**
 * Quote Controller - Handles quote-related requests
 */

const quoteService = require('../services/quoteService');
const logger = require('../utils/logger');
const { successResponse, errorResponse, notFoundResponse } = require('../utils/response');

/**
 * Get quote by ID
 * @route GET /api/quotes/:quoteId
 */
const getQuote = async (req, res, next) => {
  try {
    const { quoteId } = req.params;

    logger.info('Fetching quote', { quoteId });

    const quote = await quoteService.getQuoteById(quoteId);

    return successResponse(res, { quote });

  } catch (error) {
    logger.error('Failed to fetch quote', {
      quoteId: req.params.quoteId,
      error: error.message,
    });

    if (error.message === 'Quote not found') {
      return notFoundResponse(res, 'Quote not found');
    }

    return next(error);
  }
};

/**
 * Get quote result page data
 * @route GET /api/quotes/:quoteId/result
 */
const getQuoteResult = async (req, res, next) => {
  try {
    const { quoteId } = req.params;

    logger.info('Fetching quote result', { quoteId });

    const quote = await quoteService.getQuoteById(quoteId);

    // Format result data for display
    const resultData = {
      quoteId: quote._id,
      status: quote.status,
      trackingNumber: quote.trackingNumber,
      createdAt: quote.createdAt,
      lead: {
        name: `${quote.leadId.firstName} ${quote.leadId.lastName}`,
        email: quote.leadId.email,
        phone: quote.leadId.phone,
      },
      carriers: quote.carriers.map(carrier => ({
        name: carrier.name,
        available: carrier.available,
        premium: carrier.premium,
        errorMessage: carrier.errorMessage,
        coverages: carrier.coverages,
      })),
      bestQuote: findBestQuote(quote.carriers),
    };

    return successResponse(res, resultData);

  } catch (error) {
    logger.error('Failed to fetch quote result', {
      quoteId: req.params.quoteId,
      error: error.message,
    });

    if (error.message === 'Quote not found') {
      return notFoundResponse(res, 'Quote not found');
    }

    return next(error);
  }
};

/**
 * Create a new quote for a lead
 * @route POST /api/quotes
 */
const createQuote = async (req, res, next) => {
  try {
    const { leadId, options } = req.body;

    if (!leadId) {
      return errorResponse(res, 'Lead ID is required', 400);
    }

    logger.info('Creating quote for lead', { leadId });

    const result = await quoteService.createQuoteForLead(leadId, options);

    return successResponse(res, {
      quote: result.quote,
      carriers: result.fortusResult.carriers,
    }, 'Quote created successfully', 201);

  } catch (error) {
    logger.error('Failed to create quote', {
      error: error.message,
    });

    if (error.message === 'Lead not found') {
      return notFoundResponse(res, 'Lead not found');
    }

    return next(error);
  }
};

/**
 * Find the best (lowest premium) quote from carriers
 * @param {array} carriers - Array of carrier quotes
 * @returns {object|null} - Best quote or null
 */
const findBestQuote = (carriers) => {
  const availableCarriers = carriers.filter(c => c.available && c.premium > 0);
  
  if (availableCarriers.length === 0) {
    return null;
  }

  return availableCarriers.reduce((best, current) => {
    return current.premium < best.premium ? current : best;
  });
};

module.exports = {
  getQuote,
  getQuoteResult,
  createQuote,
};
