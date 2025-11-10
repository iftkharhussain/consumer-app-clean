/**
 * Paperform Controller - Handles Paperform webhook requests
 */

const leadService = require('../services/leadService');
const quoteService = require('../services/quoteService');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Handle Paperform webhook submission
 * @route POST /api/paperform/webhook
 */
const handleWebhook = async (req, res, next) => {
  try {
    const paperformData = req.body;

    logger.info('Received Paperform webhook', {
      submissionId: paperformData.submission_id,
    });

    // Create lead from Paperform data
    const lead = await leadService.createLeadFromPaperform(paperformData);

    // Automatically create quote for the lead
    let quoteResult = null;
    try {
      quoteResult = await quoteService.createQuoteForLead(lead._id);
    } catch (quoteError) {
      logger.error('Failed to create quote for lead', {
        leadId: lead._id,
        error: quoteError.message,
      });
      // Don't fail the webhook if quote generation fails
      // The lead is still saved and quote can be retried later
    }

    return successResponse(res, {
      lead: {
        id: lead._id,
        email: lead.email,
        status: lead.status,
      },
      quote: quoteResult ? {
        id: quoteResult.quote._id,
        status: quoteResult.quote.status,
        trackingNumber: quoteResult.quote.trackingNumber,
      } : null,
      message: quoteResult 
        ? 'Lead created and quote generated successfully'
        : 'Lead created successfully, but quote generation failed',
    }, 'Webhook processed successfully', 201);

  } catch (error) {
    logger.error('Paperform webhook error', {
      error: error.message,
      stack: error.stack,
    });
    return next(error);
  }
};

/**
 * Test endpoint for Paperform webhook
 * @route POST /api/paperform/test
 */
const testWebhook = async (req, res) => {
  return successResponse(res, {
    message: 'Paperform webhook endpoint is active',
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  handleWebhook,
  testWebhook,
};
