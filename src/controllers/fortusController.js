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
    const { userProductId, productSlug, selectedQuote, recalculatedQuote, carrierCode, scheduleLater } = req.body;

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
      hasRecalculatedQuote: !!recalculatedQuote,
      carrierCode: carrierCode || 'not specified',
      scheduleLater: scheduleLater || false
    });

    let result = null;
    
    // If scheduleLater is true, skip Fortus API call and just create the order
    if (!scheduleLater) {
      // Call Fortus service to send the lead
      // If recalculatedQuote is provided, it will be saved to quote_records in LMS
      // Pass carrierCode to filter the correct quote in LMS
      result = await fortusService.requestCall(userProduct.leadId, recalculatedQuote, carrierCode);

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
    } else {
      logger.info('FortusController.requestCall - scheduling for later, skipping Fortus API call');
    }

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
          quoteTrackingNumber: result?.data?.trackingNumber || null,
          selectedQuote: selectedQuote || null, // Save selected insurer details from frontend
          fortusDeliveryId: result?.data?.deliveryId || result?.data?.fortusLeadId || null,
          status: 'call_requested',
          requestedAt: new Date(),
          metadata: {
            scheduledForLater: scheduleLater || false,
            alreadySent: result?.data?.alreadySent || false,
            sentAt: result?.data?.sentAt || new Date()
          }
        });

        await productOrder.save();
        logger.info('ProductOrder created', {
          orderId: productOrder._id,
          selectedInsurer: selectedQuote?.insurerName,
          quoteTrackingNumber: productOrder.quoteTrackingNumber,
          scheduledForLater: scheduleLater || false
        });
      } else {
        // Update existing order
        if (selectedQuote) {
          existingOrder.selectedQuote = selectedQuote;
        }

        // Update delivery ID if we just sent it (this happens in ScheduleConfirmation)
        const newDeliveryId = result?.data?.deliveryId || result?.data?.fortusLeadId;
        if (newDeliveryId) {
          existingOrder.fortusDeliveryId = newDeliveryId;
        }

        // Update tracking number if returned from LMS
        const newTrackingNumber = result?.data?.trackingNumber;
        if (newTrackingNumber && !existingOrder.quoteTrackingNumber) {
          existingOrder.quoteTrackingNumber = newTrackingNumber;
        }

        if (scheduleLater) {
          existingOrder.metadata = existingOrder.metadata || {};
          existingOrder.metadata.scheduledForLater = true;
        }

        await existingOrder.save();
        logger.info('ProductOrder already exists, updated with latest data', { 
          orderId: existingOrder._id,
          fortusDeliveryId: existingOrder.fortusDeliveryId
        });
      }
    } catch (orderError) {
      // Log error but don't fail the request
      logger.error('Failed to create/update ProductOrder', {
        error: orderError.message,
        userProductId: userProduct._id
      });
    }

    // --- CONSUMER EMAIL DISPATCH ---
    if (req.body.emailType && ['call', 'meeting'].includes(req.body.emailType)) {
      try {
        const ProductOrder = require('../schema/ProductOrder');
        const currentOrder = await ProductOrder.findOne({ userId, userProductId: userProduct._id, status: 'call_requested' });

        const wasAlreadySentToBroker = result?.data?.alreadySent || false;

        if (wasAlreadySentToBroker || currentOrder?.metadata?.confirmationEmailSent?.[req.body.emailType]) {
          logger.info('Consumer confirmation email skipped: lead already sent to broker or email already sent', {
            userProductId: userProduct._id,
            emailType: req.body.emailType,
            wasAlreadySentToBroker
          });
        } else {
          const User = require('../schema/User');
          const user = await User.findById(userId).select('email firstName fullName').lean();
          const email = user?.email;
          const firstName = user?.firstName || user?.fullName?.split(' ')[0] || 'client';

          if (email) {
            // Replicate the exact logic that hides the quote details for Courtika/Personalize flows
            // For meeting flow, selectedQuote is not re-sent from the frontend (it's already in DB),
            // so fall back to existingOrder.selectedQuote which was saved when "Schedule Later" was clicked.
            const sq = req.body.selectedQuote || currentOrder?.selectedQuote || existingOrder?.selectedQuote || {};
            const sqName = sq.insurerName || '';
            const isCourtikaSearch = sq.isCourtikaSearch || (sqName && sqName.toLowerCase().includes('courtika') && sqName.toLowerCase().includes('magasiner'));
            const showQuoteDetails = (sq.selectionType || 'explicit') === 'explicit' && !isCourtikaSearch;

            const quoteToEmail = showQuoteDetails 
              ? sq 
              : { 
                  insurerName: null, 
                  monthlyPrice: null, 
                  yearlyPrice: null, 
                  hasDiscount: false, 
                  discountLabel: null, 
                  protections: [] 
                };

            const lmsApiService = require('../services/lmsApiService');
            await lmsApiService.lmsPost('/send-quote-confirmation-email', { type: 'quote_confirmation_email' }, {
              email,
              firstName,
              type: req.body.emailType,
              quote: quoteToEmail,
              meetingDate: req.body.meetingDate || null,
              appLeadId: userProduct.leadId ? String(userProduct.leadId) : null
            });

            // Update the ProductOrder flag just like the old controller did
            if (currentOrder) {
              const sentFlags = { ...(currentOrder.metadata?.confirmationEmailSent || {}), [req.body.emailType]: true };
              currentOrder.metadata = { 
                ...currentOrder.metadata, 
                confirmationEmailSent: sentFlags 
              };
              currentOrder.markModified('metadata');
              await currentOrder.save();
            }
            logger.info('Consumer confirmation email sent automatically via ezLead flow');
          }
        }
      } catch (emailErr) {
        logger.error('Failed to auto-send confirmation email via ezLead flow', { error: emailErr.message });
      }
    }
    // --- END CONSUMER EMAIL DISPATCH ---

    return res.json({
      success: true,
      message: scheduleLater 
        ? 'Your order has been saved. Schedule your call to complete the request!'
        : (result?.message || 'Your call request has been submitted successfully!'),
      data: {
        fortusLeadId: result?.data?.fortusLeadId,
        status: result?.data?.status,
        userProductId: userProduct._id.toString(),
        scheduledForLater: scheduleLater || false
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

/**
 * 🔍 DEBUG ENDPOINT - Test request call WITHOUT sending to ezLeads
 * 
 * POST /api/fortus/test-request-call
 * 
 * This endpoint simulates the entire flow but stops before calling LMS Fortus API.
 * Use this to test which insurer will be sent without triggering actual ezLeads/emails.
 */
const testRequestCall = async (req, res) => {
  try {
    const userId = req.userId;
    const { userProductId, productSlug, selectedQuote, recalculatedQuote, carrierCode } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Find the user product
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

    // This is what WOULD be sent to LMS
    const whatWouldBeSent = {
      leadId: userProduct.leadId,
      carrierCode: carrierCode || 'NOT_SPECIFIED',
      hasRecalculatedQuote: !!recalculatedQuote,
      selectedQuote: selectedQuote ? {
        insurerName: selectedQuote.insurerName,
        carrierCode: selectedQuote.carrierCode,
        monthlyPrice: selectedQuote.monthlyPrice
      } : null
    };

    logger.info('🔍 FortusController.testRequestCall (TEST MODE)', {
      userId,
      userProductId: userProduct._id,
      whatWouldBeSent
    });

    return res.status(200).json({
      success: true,
      message: '🔍 TEST MODE - No actual request sent to ezLeads',
      testMode: true,
      debug: {
        userProduct: {
          _id: userProduct._id,
          leadId: userProduct.leadId,
          userId: userProduct.userId,
          productSlug: userProduct.productSlug
        },
        whatWouldBeSent: whatWouldBeSent,
        explanation: {
          carrierCode: carrierCode 
            ? `Will send to insurer with code: ${carrierCode}`
            : 'No carrierCode provided - LMS will use cheapest from quote_records',
          selectedQuote: selectedQuote
            ? `Frontend selected: ${selectedQuote.insurerName} (${selectedQuote.carrierCode})`
            : 'No selectedQuote in request',
          recalculatedQuote: recalculatedQuote
            ? 'Will save recalculated quote to quote_records'
            : 'Using existing quote from quote_records'
        }
      }
    });

  } catch (error) {
    logger.error('FortusController.testRequestCall error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while testing request.'
    });
  }
};

/**
 * Track a call or meeting event for analytics
 *
 * POST /api/fortus/track-event
 * Body: { userProductId: string, eventType: 'call' | 'meeting' }
 *
 * Called after the ezLead + email are sent:
 *  - 'call'    → consumer landed on the call confirmation page ("Appeler maintenant")
 *  - 'meeting' → consumer completed a Calendly booking ("Planifier un appel plus tard")
 *
 * Forwards to the LMS which records the event (deduped on reload). A tracking
 * failure must never break the consumer UI, so non-validation errors still
 * return 200 with success:false.
 */
const trackEvent = async (req, res) => {
  try {
    const userId = req.userId;
    const { userProductId, eventType, additionalData } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!userProductId || !eventType) {
      return res.status(400).json({
        success: false,
        message: 'userProductId and eventType are required'
      });
    }

    if (!['call', 'meeting'].includes(eventType)) {
      return res.status(400).json({
        success: false,
        message: 'eventType must be "call" or "meeting"'
      });
    }

    // Ensure the product belongs to the authenticated user
    const userProduct = await UserProduct.findOne({ _id: userProductId, userId });
    if (!userProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found for this user'
      });
    }

    logger.info('FortusController.trackEvent', { userId, userProductId, eventType, additionalData });

    const result = await fortusService.trackEvent(userProductId, eventType, additionalData);

    return res.json({
      success: result.success,
      message: result.message,
      alreadyExists: result.alreadyExists || false,
      data: result.data || {}
    });

  } catch (error) {
    logger.error('FortusController.trackEvent error', {
      message: error.message,
      stack: error.stack
    });

    // Don't hard-fail the UI on a tracking error
    return res.status(200).json({
      success: false,
      message: 'Failed to track event'
    });
  }
};

module.exports = {
  requestCall,
  getOfficeHours,
  testRequestCall,
  trackEvent
};
