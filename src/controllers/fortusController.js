/**
 * Fortus Leads Controller for Consumer App
 * 
 * Handles Fortus Leads integration endpoints.
 * Triggered when consumer clicks "Demander un appel" button.
 * 
 * Flow:
 * 1. Consumer fills out form and clicks "Demander un appel"
 * 2. Frontend calls POST /api/fortus/request-call
 * 3. This controller validates the request
 * 4. Calls fortusService which communicates with LMS
 * 5. Returns result to frontend for display
 */

const fortusService = require('../services/fortusService');
const UserProduct = require('../schema/UserProduct');
const ProductOrder = require('../schema/ProductOrder');
const logger = require('../utils/logger');

/**
 * Request a call - sends lead to Fortus Leads platform
 * 
 * POST /api/fortus/request-call
 * Body: { userProductId: string } or { productSlug: string }
 * 
 * The consumer clicks "Demander un appel" after seeing office hours.
 * This triggers the lead to be sent to the Fortus Leads platform.
 */
const requestCall = async (req, res) => {
  try {
    const userId = req.userId;
    const { userProductId, productSlug, selectedQuote, recalculatedQuote } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Find the user product to get the leadId
    let userProduct;

    if (userProductId) {
      userProduct = await UserProduct.findOne({
        _id: userProductId,
        userId,
        status: 'active'
      });
    } else if (productSlug) {
      userProduct = await UserProduct.findByUserAndSlug(userId, productSlug);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either productSlug or userProductId is required'
      });
    }

    if (!userProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found for this user'
      });
    }

    if (!userProduct.leadId) {
      return res.status(400).json({
        success: false,
        message: 'No lead associated with this product. Please complete the questionnaire first.'
      });
    }

    logger.info('FortusController.requestCall', {
      userId,
      userProductId: userProduct._id,
      leadId: userProduct.leadId,
      hasRecalculatedQuote: !!recalculatedQuote
    });

    // Call Fortus service to send the lead
    // If recalculatedQuote is provided, it will be saved to quote_records in LMS
    const result = await fortusService.requestCall(userProduct.leadId, recalculatedQuote);

    if (!result.success) {
      logger.warn('FortusController.requestCall failed', {
        leadId: userProduct.leadId,
        error: result.error,
        message: result.message
      });

      // Return appropriate status based on error type
      const statusCode = result.error === 'QUOTE_NOT_AVAILABLE' ? 400 : 500;
      
      return res.status(statusCode).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }

    logger.info('FortusController.requestCall success', {
      leadId: userProduct.leadId,
      fortusLeadId: result.data?.fortusLeadId
    });

    // Create product order to track this call request
    try {
      const existingOrder = await ProductOrder.findOne({
        userId,
        userProductId: userProduct._id,
        status: 'call_requested'
      });

      if (!existingOrder) {
        const productOrder = new ProductOrder({
          userId,
          userProductId: userProduct._id,
          leadId: userProduct.leadId,
          productSlug: userProduct.productSlug,
          quoteId: null,
          selectedQuote: selectedQuote || null, // Save selected insurer details from frontend
          fortusDeliveryId: result.data?.deliveryId || result.data?.fortusLeadId,
          status: 'call_requested',
          requestedAt: new Date(),
          metadata: {
            alreadySent: result.data?.alreadySent || false,
            sentAt: result.data?.sentAt || new Date()
          }
        });

        await productOrder.save();
        logger.info('ProductOrder created', { 
          orderId: productOrder._id,
          selectedInsurer: selectedQuote?.insurerName 
        });
      } else {
        logger.info('ProductOrder already exists', { orderId: existingOrder._id });
      }
    } catch (orderError) {
      // Log error but don't fail the request
      logger.error('Failed to create ProductOrder', {
        error: orderError.message,
        userProductId: userProduct._id
      });
    }

    return res.json({
      success: true,
      message: result.message || 'Your call request has been submitted successfully!',
      data: {
        fortusLeadId: result.data?.fortusLeadId,
        status: result.data?.status,
        userProductId: userProduct._id.toString()
      }
    });

  } catch (error) {
    logger.error('FortusController.requestCall error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request. Please try again.'
    });
  }
};

/**
 * Get office hours for the current user's lead
 * 
 * GET /api/fortus/office-hours
 * Query: { userProductId: string } or { productSlug: string }
 * 
 * Returns office hours configuration for display to consumer.
 * This is for DISPLAY purposes - consumer can still submit request anytime.
 */
const getOfficeHours = async (req, res) => {
  try {
    const userId = req.userId;
    const { userProductId, productSlug } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Find the user product to get the leadId
    let userProduct;

    if (userProductId) {
      userProduct = await UserProduct.findOne({
        _id: userProductId,
        userId,
        status: 'active'
      });
    } else if (productSlug) {
      userProduct = await UserProduct.findByUserAndSlug(userId, productSlug);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either productSlug or userProductId is required'
      });
    }

    if (!userProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found for this user'
      });
    }

    if (!userProduct.leadId) {
      return res.status(400).json({
        success: false,
        message: 'No lead associated with this product.'
      });
    }

    logger.info('FortusController.getOfficeHours', {
      userId,
      leadId: userProduct.leadId
    });

    // Get office hours from LMS via lead
    const result = await fortusService.getOfficeHoursByLead(userProduct.leadId);

    if (!result.success) {
      // Return default/empty office hours if not configured
      return res.json({
        success: true,
        data: {
          officeHours: null,
          isCurrentlyOpen: true, // Default to open if not configured
          timezone: 'America/Toronto',
          configured: false
        }
      });
    }

    return res.json({
      success: true,
      data: {
        officeHours: result.officeHours,
        isCurrentlyOpen: result.isCurrentlyOpen,
        timezone: result.timezone,
        configured: !!result.officeHours
      }
    });

  } catch (error) {
    logger.error('FortusController.getOfficeHours error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching office hours.'
    });
  }
};

module.exports = {
  requestCall,
  getOfficeHours
};
