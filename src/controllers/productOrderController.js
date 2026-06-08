const ProductOrder = require('../schema/ProductOrder');
const logger = require('../utils/logger');
const lmsApiService = require('../services/lmsApiService');
const { isOfficeOpen, formatOfficeHours } = require('../utils/officeHoursHelper');

/**
 * Get product order details by userProductId
 * Used by order page to display order information
 * Fetches advisor info from LMS via leadId
 */
exports.getOrderDetails = async (req, res) => {
  try {
    const userId = req.userId;
    const { userProductId } = req.params;

    if (!userProductId) {
      return res.status(400).json({
        success: false,
        message: 'userProductId is required'
      });
    }

    // Find the order - userProductId in URL is actually the order's userProductId field
    // We need to find the order that has this userProductId and belongs to this user
    const order = await ProductOrder.findOne({
      userProductId: userProductId,
      userId
    }).sort({ createdAt: -1 }); // Get most recent if multiple exist

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Fetch advisor info from LMS using leadId
    let advisorInfo = null;
    let coverages = [];
    
    // First, check if coverages are already stored in selectedQuote
    if (order.selectedQuote?.coverages && order.selectedQuote.coverages.length > 0) {
      coverages = order.selectedQuote.coverages;
      logger.info('Using coverages from selectedQuote', {
        orderanaId: order._id,
        coveragesCount: coverages.length
      });
    }
    
    try {
      // Get advisor and fortus config from LMS
      const lmsResponse = await lmsApiService.lmsGet(`/fortus/advisor-info/${order.leadId}`, {
        leadId: order.leadId
      });

      if (lmsResponse.success && lmsResponse.data) {
        const { fortusConfig, advisor } = lmsResponse.data;
        
        // Build advisor info with office status
        const officeStatus = fortusConfig?.officeHours 
          ? isOfficeOpen(fortusConfig.officeHours, fortusConfig.timezone || 'America/Toronto')
          : { isOpen: false, message: 'Fermé' };

        const formattedHours = fortusConfig?.officeHours 
          ? formatOfficeHours(fortusConfig.officeHours)
          : '';

        advisorInfo = {
          companyName: fortusConfig?.companyName || 'Courtika',
          logo: '/images/courtika-assurances-inc.png', // Static for now
          phone: fortusConfig?.phone || 'XXX XXX XXXX',
          officeHours: fortusConfig?.officeHours || null,
          timezone: fortusConfig?.timezone || 'America/Toronto',
          isOpen: officeStatus.isOpen,
          openStatus: officeStatus.message,
          formattedHours,
          callDuration: 15, // Default 15 minutes
          maxRetries: 2, // Default 2 retries
        };
      }

      // Fetch quote to get coverages if leadId and productId are available
      // Only fetch if we don't already have coverages from selectedQuote
      if (!coverages.length && order.leadId && order.userProductId) {
        try {
          // Get the productId from userProduct
          const UserProduct = require('../schema/UserProduct');
          const userProduct = await UserProduct.findById(order.userProductId).lean();
          
          if (userProduct && userProduct.productId) {
            // Use the correct endpoint to get full quote details including coverages
            const quoteResponse = await lmsApiService.lmsGet(`/quotes/${order.leadId}`, {
              byLead: 'true',
              productId: userProduct.productId
            });
            
            if (quoteResponse.success && quoteResponse.quote) {
              const quote = quoteResponse.quote;
              
              // Find coverages for the selected carrier
              if (quote.carriers && quote.carriers.length > 0) {
                const selectedCarrier = quote.carriers.find(c => c.carrierCode === order.selectedQuote?.carrierCode);
                
                if (selectedCarrier && selectedCarrier.coverages && selectedCarrier.coverages.length > 0) {
                  coverages = selectedCarrier.coverages;
                  logger.info('Coverages found for selected carrier', {
                    carrierCode: order.selectedQuote?.carrierCode,
                    coveragesCount: coverages.length
                  });
                } else {
                  logger.warn('No coverages found for selected carrier, using first available', {
                    carrierCode: order.selectedQuote?.carrierCode,
                    availableCarriers: quote.carriers.map(c => c.carrierCode)
                  });
                  // Fallback: use coverages from first carrier that has them
                  const carrierWithCoverages = quote.carriers.find(c => c.coverages && c.coverages.length > 0);
                  if (carrierWithCoverages) {
                    coverages = carrierWithCoverages.coverages;
                  }
                }
              }
            }
          }
        } catch (quoteError) {
          logger.warn('Failed to fetch coverages from quote', {
            error: quoteError.message,
            leadId: order.leadId
          });
        }
      }
    } catch (lmsError) {
      logger.warn('Failed to fetch advisor info from LMS', {
        error: lmsError.message,
        leadId: order.leadId
      });
      // Continue with null advisorInfo - frontend can handle it
    }

    const orderData = {
      ...order.toObject(),
      advisorInfo,
      coverages
    };

    logger.info('ProductOrder.getOrderDetails', {
      userId,
      userProductId,
      status: order.status
    });

    return res.json({
      success: true,
      data: orderData
    });

  } catch (error) {
    logger.error('ProductOrder.getOrderDetails error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
};

/**
 * Check if user has pending product orders for a specific product
 * Used to redirect user to order page if they have active call requests
 */
exports.checkPendingOrder = async (req, res) => {
  try {
    const userId = req.userId;
    const { productSlug } = req.query;

    if (!productSlug) {
      return res.status(400).json({
        success: false,
        message: 'productSlug is required'
      });
    }

    // Find most recent pending order for this user and product
    const pendingOrder = await ProductOrder.findOne({
      userId,
      productSlug,
      status: 'call_requested'
    }).sort({ requestedAt: -1 });

    if (pendingOrder) {
      logger.info('ProductOrder.checkPendingOrder', {
        userId,
        productSlug,
        userProductId: pendingOrder.userProductId,
        requestedAt: pendingOrder.requestedAt
      });

      return res.json({
        success: true,
        hasPendingOrder: true,
        userProductId: pendingOrder.userProductId.toString(),
        fortusDeliveryId: pendingOrder.fortusDeliveryId,
        requestedAt: pendingOrder.requestedAt
      });
    }

    return res.json({
      success: true,
      hasPendingOrder: false
    });

  } catch (error) {
    logger.error('ProductOrder.checkPendingOrder error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to check pending order'
    });
  }
};

/**
 * Create product order when user requests a call
 */
exports.createProductOrder = async (req, res) => {
  try {
    const userId = req.userId;
    const { userProductId, leadId, productSlug, quoteId, fortusDeliveryId, metadata } = req.body;

    if (!userProductId || !leadId || !productSlug) {
      return res.status(400).json({
        success: false,
        message: 'userProductId, leadId, and productSlug are required'
      });
    }

    // Check if order already exists
    const existingOrder = await ProductOrder.findOne({
      userId,
      userProductId,
      status: 'call_requested'
    });

    if (existingOrder) {
      logger.info('ProductOrder already exists', { orderId: existingOrder._id });
      return res.json({
        success: true,
        message: 'Order already exists',
        order: existingOrder
      });
    }

    // Create new order
    const order = new ProductOrder({
      userId,
      userProductId,
      leadId,
      productSlug,
      quoteId,
      fortusDeliveryId,
      status: 'call_requested',
      requestedAt: new Date(),
      metadata: metadata || {}
    });

    await order.save();

    logger.info('ProductOrder created', {
      orderId: order._id,
      userId,
      userProductId,
      productSlug
    });

    return res.json({
      success: true,
      message: 'Product order created',
      order
    });

  } catch (error) {
    logger.error('ProductOrder.createProductOrder error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to create product order'
    });
  }
};

/**
 * Get user's product orders
 */
exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.userId;
    const { productSlug, status } = req.query;

    const query = { userId };
    if (productSlug) query.productSlug = productSlug;
    if (status) query.status = status;

    const orders = await ProductOrder.find(query)
      .sort({ requestedAt: -1 })
      .populate('userProductId');

    return res.json({
      success: true,
      orders
    });

  } catch (error) {
    logger.error('ProductOrder.getUserOrders error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to get orders'
    });
  }
};

/**
 * Update product order status
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;
    const { status, metadata } = req.body;

    const order = await ProductOrder.findOne({
      _id: orderId,
      userId
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (status) {
      order.status = status;
      if (['completed', 'cancelled'].includes(status)) {
        order.completedAt = new Date();
      }
    }

    if (metadata) {
      order.metadata = { ...order.metadata, ...metadata };
    }

    await order.save();

    logger.info('ProductOrder updated', {
      orderId,
      status,
      userId
    });

    return res.json({
      success: true,
      message: 'Order updated',
      order
    });

  } catch (error) {
    logger.error('ProductOrder.updateOrderStatus error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to update order'
    });
  }
};

/**
 * Send a quote confirmation email when a user lands on the call/meeting
 * confirmation page. Forwards to Norga-App (LMS) which renders + sends the email.
 *
 * POST /api/product-order/send-confirmation-email
 * Body: { userProductId, type: 'call' | 'meeting', quote, meetingDate? }
 *
 * The recipient is the authenticated user (req.userEmail). A per-type flag is
 * stored on the order's metadata so a page refresh doesn't resend the email.
 */
exports.sendConfirmationEmail = async (req, res) => {
  try {
    const userId = req.userId;
    const email = req.userEmail;
    const { userProductId, type, quote, meetingDate } = req.body;

    if (!type || !['call', 'meeting'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "type is required and must be 'call' or 'meeting'"
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'No email associated with this account'
      });
    }

    // Resolve the user's first name for the greeting
    let firstName = 'client';
    try {
      const User = require('../schema/User');
      const user = await User.findById(userId).select('firstName fullName').lean();
      firstName = user?.firstName || user?.fullName?.split(' ')[0] || firstName;
    } catch (userErr) {
      logger.warn('sendConfirmationEmail: failed to load user name', { error: userErr.message });
    }

    // Find the related order (for de-duplication across page refreshes)
    let order = null;
    if (userProductId) {
      order = await ProductOrder.findOne({ userProductId, userId }).sort({ createdAt: -1 });

      if (order?.metadata?.confirmationEmailSent?.[type]) {
        logger.info('sendConfirmationEmail: already sent, skipping', { userProductId, type });
        return res.json({
          success: true,
          alreadySent: true,
          message: 'Confirmation email already sent'
        });
      }
    } else {
      logger.warn('sendConfirmationEmail: userProductId is missing or invalid', { userProductId, type });
    }

    // If order not found, warn and continue (email will still be sent, but de-dup flag won't be saved)
    if (userProductId && !order) {
      logger.warn('sendConfirmationEmail: order not found for de-duplication', { userProductId, userId, type });
      // This could happen if the order hasn't been created yet in Consumer App DB
      // The email will be sent, but we recommend the frontend also track sent status in localStorage
    }

    // Forward to LMS to render and send the email.
    // appLeadId lets the LMS enrich the email with lead-side data (e.g. vehicle make/model/year).
    await lmsApiService.lmsPost('/send-quote-confirmation-email', { type: 'quote_confirmation_email' }, {
      email,
      firstName,
      type,
      quote: quote || {},
      meetingDate: meetingDate || null,
      appLeadId: order?.leadId ? String(order.leadId) : null
    });

    // Mark as sent so refreshes don't resend
    if (order) {
      try {
        // Initialize metadata structure if needed
        if (!order.metadata) order.metadata = {};
        if (!order.metadata.confirmationEmailSent) order.metadata.confirmationEmailSent = {};
        if (!order.metadata.confirmationEmailSent.sentAt) order.metadata.confirmationEmailSent.sentAt = {};

        // Mark email as sent with timestamp
        order.metadata.confirmationEmailSent[type] = true;
        order.metadata.confirmationEmailSent.sentAt[type] = new Date();

        order.markModified('metadata');
        await order.save();
        logger.info('ProductOrder.sendConfirmationEmail: de-dup flag saved', { 
          userProductId, 
          type, 
          sentAt: order.metadata.confirmationEmailSent.sentAt[type]
        });
      } catch (saveErr) {
        logger.warn('ProductOrder.sendConfirmationEmail: failed to save de-dup flag', { 
          userProductId, type, error: saveErr.message 
        });
        // Don't block email send if save fails - the de-dup was attempted
      }
    } else {
      logger.warn('ProductOrder.sendConfirmationEmail: no order to save de-dup flag (frontend DB check should prevent resend)', { 
        userProductId, type, email 
      });
    }

    logger.info('ProductOrder.sendConfirmationEmail sent', { userProductId, type, email });

    return res.json({
      success: true,
      message: 'Confirmation email sent'
    });

  } catch (error) {
    logger.error('ProductOrder.sendConfirmationEmail error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to send confirmation email'
    });
  }
};
