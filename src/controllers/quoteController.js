/**
 * Quote Controller for Consumer App
 * 
 * Handles quote-related endpoints for the consumer app.
 * Uses quoteService to communicate with LMS.
 * 
 * Migration Note (Jan 2026):
 * - Now uses lmsApiService for quote fetching instead of direct DB access.
 * - Async Polling Pattern: LMS returns immediately with quoteId, 
 *   frontend polls for status updates every 5 seconds (max 5 minutes).
 *   Quote statuses: pending → processing → success/failed/timeout
 */

const quoteService = require('../services/quoteService');
const lmsApiService = require('../services/lmsApiService');
const UserProduct = require('../schema/UserProduct');
const carrierConfig = require('../config/carrierConfig');
// Legacy: Direct DB access - to be deprecated
// const lmsDB = require('../config/lmsCollections');
const logger = require('../utils/logger');

/**
 * Request a quote for a product
 * 
 * POST /api/quote/request
 * Body: { productSlug: string } or { userProductId: string }
 */
const requestQuote = async (req, res) => {
  try {
    const userId = req.userId;
    const { productSlug, userProductId } = req.body;

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

    // Check if quote is already being fetched
    if (userProduct.quoteStatus === 'fetching') {
      return res.status(200).json({
        success: true,
        message: 'Quote is already being fetched',
        status: 'fetching',
        userProductId: userProduct._id
      });
    }

    // Check if quote already exists and is successful
    if (userProduct.quoteStatus === 'success') {
      return res.status(200).json({
        success: true,
        message: 'Quote already exists',
        status: 'success',
        userProductId: userProduct._id
      });
    }

    // Update quote status to fetching
    await userProduct.updateQuoteStatus('fetching');

    logger.info('Requesting quote from LMS', {
      userProductId: userProduct._id,
      leadId: userProduct.leadId,
      productId: userProduct.productId,
      leadProductId: userProduct.leadProductId
    });

    // Request quote from LMS using simplified direct flow
    // Use enabled carriers from config (ENABLED_CARRIERS env var)
    // NOTE: LMS now returns immediately with quoteId (async pattern)
    // Frontend should poll for status using checkQuoteStatus endpoint
    const result = await quoteService.requestQuoteDirect({
      leadId: userProduct.leadId.toString(),
      carriers: carrierConfig.getEnabledCarrierCodes(),
      environment: carrierConfig.getDefaultEnvironment(),
      quoteType: 'auto'
    });

    // Update quote status based on result
    if (result.success) {
      // For async pattern, status will be 'pending' or 'processing'
      // Don't set to 'success' yet - that happens after polling confirms completion
      const quoteStatus = result.status || 'fetching';
      
      if (quoteStatus === 'success') {
        await userProduct.updateQuoteStatus('success');
      }
      // Keep as 'fetching' for pending/processing

      return res.status(200).json({
        success: true,
        message: result.message,
        quoteId: result.quoteId,
        userProductId: userProduct._id,
        leadId: userProduct.leadId.toString(),
        status: quoteStatus,
        // Include polling hint for frontend
        pollInterval: 5000, // 5 seconds
        maxPollTime: 300000 // 5 minutes
      });
    } else {
      await userProduct.updateQuoteStatus('failed', result.message);

      return res.status(200).json({
        success: false,
        message: result.message,
        userProductId: userProduct._id,
        status: 'failed',
        error: result.error
      });
    }

  } catch (error) {
    logger.error('QuoteController.requestQuote error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while requesting quote'
    });
  }
};

/**
 * Get quote status for a product
 * 
 * GET /api/quote/status/:userProductId
 * or GET /api/quote/status?productSlug=car-insurance
 */
const getQuoteStatus = async (req, res) => {
  try {
    const userId = req.userId;
    const { userProductId } = req.params;
    const { productSlug } = req.query;

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
        message: 'Either userProductId or productSlug is required'
      });
    }

    if (!userProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found for this user'
      });
    }

    // Return local status
    return res.status(200).json({
      success: true,
      userProductId: userProduct._id,
      leadId: userProduct.leadId,
      productId: userProduct.productId,
      productSlug: userProduct.productSlug,
      productName: userProduct.productName,
      quoteStatus: userProduct.quoteStatus,
      quoteRequestedAt: userProduct.quoteRequestedAt,
      quoteCompletedAt: userProduct.quoteCompletedAt,
      quoteError: userProduct.quoteError
    });

  } catch (error) {
    logger.error('QuoteController.getQuoteStatus error', {
      message: error.message
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while getting quote status'
    });
  }
};

/**
 * Poll quote status by quoteId (Async Polling Pattern)
 * 
 * GET /api/quote/poll/:quoteId
 * 
 * This is the primary endpoint for frontend polling.
 * Call this every 5 seconds after requesting a quote.
 * 
 * Returns:
 * - status: 'pending' | 'processing' | 'success' | 'failed' | 'timeout'
 * - When status is 'success', includes full quote data with carriers
 */
const pollQuoteStatus = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const userId = req.userId;

    console.log('[pollQuoteStatus] Started', { quoteId, userId });

    if (!quoteId) {
      return res.status(400).json({
        success: false,
        message: 'Quote ID is required'
      });
    }

    // Get user's leadId for token generation
    let appLeadId = null;
    if (userId) {
      const User = require('../schema/User');
      const user = await User.findById(userId);
      appLeadId = user?.leadSystemInfo?.leadId?.toString();
      console.log('[pollQuoteStatus] Got appLeadId from user', { appLeadId });
    }

    console.log('[pollQuoteStatus] Calling quoteService.checkQuoteStatusById', { quoteId, appLeadId });

    // Call LMS to get current quote status - pass object with both IDs
    const result = await quoteService.checkQuoteStatusById({ quoteId, appLeadId });

    console.log('[pollQuoteStatus] Result from LMS:', { 
      success: result.success, 
      status: result.status,
      hasCarriers: !!result.carriers,
      message: result.message
    });

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.message || 'Quote not found'
      });
    }

    // Result is the quote data directly (not nested in .quote)
    const quote = result;
    const isComplete = ['success', 'failed', 'timeout'].includes(quote.status);

    console.log('[pollQuoteStatus] Quote status:', { status: quote.status, isComplete });

    // If quote is complete and we have leadId, update local status
    if (isComplete && quote.leadId) {
      try {
        const userProduct = await UserProduct.findOne({ 
          leadId: quote.leadId,
          status: 'active'
        });
        if (userProduct) {
          const newStatus = quote.status === 'success' ? 'success' : 'failed';
          await userProduct.updateQuoteStatus(
            newStatus, 
            quote.status === 'failed' ? 'Quote request failed' : null
          );
        }
      } catch (updateError) {
        logger.warn('Failed to update userProduct status during poll', {
          quoteId,
          error: updateError.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      quoteId: quote._id || quoteId,
      leadId: quote.leadId || quote.appLeadId, // Include leadId for frontend
      status: quote.status,
      isComplete,
      // Only include carriers data when complete
      ...(isComplete && quote.status === 'success' && {
        carriers: quote.carriers || [],
        carriersCount: quote.carriersCount || (quote.carriers?.length || 0),
        responseTime: quote.responseTime
      }),
      // Include error for failed quotes
      ...(quote.status === 'failed' && {
        error: quote.error || 'Quote request failed'
      }),
      // Include timing info
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt
    });

  } catch (error) {
    console.error('[pollQuoteStatus] ERROR:', error.message);
    console.error('[pollQuoteStatus] Stack:', error.stack);
    
    logger.error('QuoteController.pollQuoteStatus error', {
      quoteId: req.params.quoteId,
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while polling quote status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all quotes for a lead (Async Polling Pattern)
 * 
 * GET /api/quote/by-lead/:leadId
 * 
 * Returns all quote records for a specific lead.
 */
const getQuotesByLead = async (req, res) => {
  try {
    const { leadId } = req.params;

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID is required'
      });
    }

    logger.debug('Getting quotes by lead', { leadId });

    const result = await quoteService.getQuotesByLead(leadId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.message || 'No quotes found'
      });
    }

    return res.status(200).json({
      success: true,
      quotes: result.quotes,
      count: result.quotes.length
    });

  } catch (error) {
    logger.error('QuoteController.getQuotesByLead error', {
      leadId: req.params.leadId,
      message: error.message
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while getting quotes'
    });
  }
};

/**
 * Get quote details from LMS API
 * 
 * GET /api/quote/details/:userProductId
 * 
 * Migration Note (Jan 2026):
 * Now uses lmsApiService.getQuoteByLeadId() instead of direct DB access.
 */
const getQuoteDetails = async (req, res) => {
  try {
    const userId = req.userId;
    const { userProductId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Find the user product
    const userProduct = await UserProduct.findOne({
      _id: userProductId,
      userId,
      status: 'active'
    });

    if (!userProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Fetch quote record from LMS API (replaces direct DB access)
    const result = await lmsApiService.getQuoteByLeadId(
      userProduct.leadId.toString(),
      userProduct.productId?.toString()
    );

    if (!result.success || !result.quote) {
      return res.status(404).json({
        success: false,
        message: 'No quote found for this product',
        quoteStatus: userProduct.quoteStatus
      });
    }

    const quoteRecord = result.quote;

    // Get carriers (API response already includes carriers)
    const carriers = quoteRecord.carriers || [];

    // Return quote details (without sensitive data)
    return res.status(200).json({
      success: true,
      quote: {
        id: quoteRecord._id,
        status: quoteRecord.status,
        quoteProvider: quoteRecord.quoteProvider,
        carriersCount: carriers.length || quoteRecord.carriersCount,
        carriers: carriers,
        createdAt: quoteRecord.createdAt,
        responseTime: quoteRecord.responseTime,
        isSuccessful: quoteRecord.isSuccessful
      },
      userProduct: {
        id: userProduct._id,
        productSlug: userProduct.productSlug,
        productName: userProduct.productName
      }
    });

  } catch (error) {
    logger.error('QuoteController.getQuoteDetails error', {
      message: error.message
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while getting quote details'
    });
  }
};

/**
 * Get all user products with their quote statuses
 * 
 * GET /api/quote/products
 */
const getUserProducts = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userProducts = await UserProduct.findByUserId(userId);

    return res.status(200).json({
      success: true,
      products: userProducts.map(up => ({
        id: up._id,
        leadId: up.leadId,
        productId: up.productId,
        productSlug: up.productSlug,
        productName: up.productName,
        quoteStatus: up.quoteStatus,
        quoteRequestedAt: up.quoteRequestedAt,
        quoteCompletedAt: up.quoteCompletedAt,
        status: up.status,
        createdAt: up.createdAt
      }))
    });

  } catch (error) {
    logger.error('QuoteController.getUserProducts error', {
      message: error.message
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while getting user products'
    });
  }
};

/**
 * Fetch quote for a product - single endpoint that handles everything
 * 
 * GET /api/quote/fetch?productSlug=car-insurance
 * 
 * This endpoint:
 * 1. Finds the user's product
 * 2. Checks if quote already exists (returns it)
 * 3. If not, requests quote from LMS
 * 4. Returns the quote results
 */
const fetchQuote = async (req, res) => {
  try {
    const userId = req.userId;
    const { productSlug } = req.query;
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    logger.info('QuoteController.fetchQuote called', {
      userId,
      productSlug,
      requestId
    });

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!productSlug) {
      return res.status(400).json({
        success: false,
        message: 'productSlug is required'
      });
    }

    // Find the user's product
    let userProduct = await UserProduct.findByUserAndSlug(userId, productSlug);

    if (!userProduct) {
      // Product not found - try to sync from LMS
      logger.info('Product not found, attempting to sync from LMS', {
        userId,
        productSlug,
        requestId
      });

      // Get user to find leadId
      const User = require('../schema/User');
      const user = await User.findById(userId);

      if (user?.leadSystemInfo?.leadId) {
        // Try syncing products from LMS
        const { syncLeadProducts } = require('./authController');
        await syncLeadProducts(userId, user.leadSystemInfo.leadId);

        // Try finding the product again
        userProduct = await UserProduct.findByUserAndSlug(userId, productSlug);
      }

      if (!userProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found for this user'
        });
      }
    }

    logger.info('Found user product', {
      userProductId: userProduct._id,
      leadId: userProduct.leadId,
      productId: userProduct.productId,
      quoteStatus: userProduct.quoteStatus,
      requestId
    });

    // If quote is already being fetched, check if it's stale (older than 2 minutes)
    if (userProduct.quoteStatus === 'fetching') {
      const fetchingTimeout = 2 * 60 * 1000; // 2 minutes
      const statusAge = userProduct.quoteStatusUpdatedAt
        ? Date.now() - new Date(userProduct.quoteStatusUpdatedAt).getTime()
        : fetchingTimeout + 1; // If no timestamp, consider it stale

      if (statusAge < fetchingTimeout) {
        logger.info('Quote already being fetched, returning early', {
          userProductId: userProduct._id,
          statusAge: statusAge / 1000,
          requestId
        });
        return res.status(200).json({
          success: true,
          message: 'Quote is being fetched',
          quoteStatus: 'fetching',
          userProductId: userProduct._id
        });
      } else {
        // Status is stale - ACTUALLY reset it to pending so we can re-fetch
        logger.info('Quote fetching status is stale, resetting to pending', {
          userProductId: userProduct._id,
          statusAge: statusAge / 1000,
          requestId
        });

        // Force reset the stale status
        await UserProduct.findByIdAndUpdate(userProduct._id, {
          $set: {
            quoteStatus: 'pending',
            quoteStatusUpdatedAt: new Date()
          }
        });

        // Refresh the userProduct object
        userProduct.quoteStatus = 'pending';
      }
    }

    // If quote already exists and is successful, fetch and return details
    if (userProduct.quoteStatus === 'success') {
      // Get quote details from LMS API (replaces direct DB access)
      // Don't filter by productId since simplified flow doesn't set it
      const result = await lmsApiService.getQuoteByLeadId(
        userProduct.leadId.toString()
        // Note: Not passing productId - simplified flow doesn't require it
      );

      if (result.success && result.quote) {
        const quoteRecord = result.quote;
        // Get carriers from the API response
        const carriers = quoteRecord.carriers || [];

        return res.status(200).json({
          success: true,
          message: 'Quote already exists',
          quoteStatus: 'success',
          userProductId: userProduct._id,
          quote: {
            id: quoteRecord._id,
            carriers: carriers,
            carriersCount: carriers.length || quoteRecord.carriersCount || 0,
            responseTime: quoteRecord.responseTime,
            createdAt: quoteRecord.createdAt,
            trackingNumber: quoteRecord.trackingNumber
          }
        });
      }
    }

    // Quote doesn't exist or failed - request new quote from LMS
    logger.info('Requesting quote from LMS', {
      userProductId: userProduct._id,
      leadId: userProduct.leadId,
      productId: userProduct.productId,
      requestId
    });

    // Use atomic update to prevent race conditions
    // Only update to 'fetching' if current status is not 'fetching'
    const updateResult = await UserProduct.findOneAndUpdate(
      {
        _id: userProduct._id,
        quoteStatus: { $ne: 'fetching' }  // Only update if not already fetching
      },
      {
        $set: {
          quoteStatus: 'fetching',
          quoteStatusUpdatedAt: new Date()
        }
      },
      { new: true }
    );

    // If update didn't happen (document not found), another request is already fetching
    if (!updateResult) {
      logger.info('Quote fetch already in progress by another request', {
        userProductId: userProduct._id,
        requestId
      });
      return res.status(200).json({
        success: true,
        message: 'Quote is being fetched by another request',
        quoteStatus: 'fetching',
        userProductId: userProduct._id
      });
    }

    logger.info('Set quote status to fetching atomically', {
      userProductId: userProduct._id,
      requestId
    });

    // Request quote from LMS using simplified direct flow
    // Use enabled carriers from config (ENABLED_CARRIERS env var)
    // LMS returns immediately with quoteId for async polling
    const result = await quoteService.requestQuoteDirect({
      leadId: userProduct.leadId.toString(),
      carriers: carrierConfig.getEnabledCarrierCodes(),
      environment: carrierConfig.getDefaultEnvironment(),
      quoteType: 'auto'
    });

    logger.info('LMS quote response', {
      success: result.success,
      message: result.message,
      status: result.status,
      quoteId: result.quoteId,
      requestId
    });

    // Handle async polling flow
    // LMS returns immediately with quoteId and status: 'pending'
    // Frontend should poll for status using /api/quote/poll/:quoteId
    if (result.success && result.quoteId) {
      const quoteStatus = result.status || 'pending';
      
      // If LMS is still processing (pending/processing), return quoteId for polling
      if (['pending', 'processing'].includes(quoteStatus)) {
        logger.info('Quote is being processed, return for polling', {
          userProductId: userProduct._id,
          quoteId: result.quoteId,
          status: quoteStatus,
          requestId
        });

        // Keep local status as 'fetching' while LMS processes
        return res.status(200).json({
          success: true,
          message: 'Quote request submitted, poll for status',
          quoteStatus: 'fetching',
          status: quoteStatus,
          quoteId: result.quoteId,
          userProductId: userProduct._id,
          leadId: userProduct.leadId.toString(),
          // Polling hints for frontend
          pollInterval: 5000,  // 5 seconds
          maxPollTime: 300000  // 5 minutes
        });
      }

      // Quote is already complete (from existing quote)
      if (quoteStatus === 'success') {
        await userProduct.updateQuoteStatus('success');
        
        // Fetch quote details via API
        const quoteResult = await lmsApiService.getQuoteByLeadId(
          userProduct.leadId.toString()
        );

        const quoteRecord = quoteResult.success ? quoteResult.quote : null;
        const carriers = quoteRecord?.carriers || [];

        return res.status(200).json({
          success: true,
          message: result.message || 'Quote fetched successfully',
          quoteStatus: 'success',
          userProductId: userProduct._id,
          quoteId: result.quoteId,
          quote: quoteRecord ? {
            id: quoteRecord._id,
            carriers: carriers,
            carriersCount: carriers.length || quoteRecord.carriersCount || 0,
            responseTime: quoteRecord.responseTime,
            createdAt: quoteRecord.createdAt,
            trackingNumber: quoteRecord.trackingNumber
          } : null
        });
      }
    }

    // Update quote status based on result (legacy flow or failed)
    if (result.success) {
      await userProduct.updateQuoteStatus('success');
      logger.info('Quote successful, fetching quote record via API', {
        userProductId: userProduct._id,
        leadId: userProduct.leadId,
        requestId
      });

      // Fetch the quote details from LMS API (replaces direct DB access)
      // Don't filter by productId since simplified flow doesn't set it
      const quoteResult = await lmsApiService.getQuoteByLeadId(
        userProduct.leadId.toString()
        // Note: Not passing productId - simplified flow doesn't require it
      );

      const quoteRecord = quoteResult.success ? quoteResult.quote : null;

      logger.info('Quote record lookup result via API', {
        found: !!quoteRecord,
        quoteRecordId: quoteRecord?._id,
        carriersCount: quoteRecord?.carriers?.length || 0,
        requestId
      });

      // Get carriers from the API response
      const carriers = quoteRecord?.carriers || [];

      return res.status(200).json({
        success: true,
        message: result.message || 'Quote fetched successfully',
        quoteStatus: 'success',
        userProductId: userProduct._id,
        quoteId: result.quoteId,
        quote: quoteRecord ? {
          id: quoteRecord._id,
          carriers: carriers,
          carriersCount: carriers.length || quoteRecord.carriersCount || 0,
          responseTime: quoteRecord.responseTime,
          createdAt: quoteRecord.createdAt,
          trackingNumber: quoteRecord.trackingNumber
        } : null
      });
    } else {
      logger.warn('Quote fetch failed', {
        userProductId: userProduct._id,
        message: result.message,
        error: result.error,
        requestId
      });

      await userProduct.updateQuoteStatus('failed', result.message);

      return res.status(200).json({
        success: false,
        message: result.message || 'Failed to fetch quote',
        quoteStatus: 'failed',
        userProductId: userProduct._id,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('QuoteController.fetchQuote error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching quote'
    });
  }
};

/**
 * Request quote directly using leadId + carriers + environment (SIMPLIFIED FLOW)
 * 
 * POST /api/quote/request-direct
 * Body: {
 *   leadId: string,        // Required - all_leads._id
 *   carriers: string[],    // Optional - defaults to ENABLED_CARRIERS from env
 *   environment: string,   // Optional - defaults to FORTUS_DEFAULT_ENVIRONMENT from env
 *   quoteType: string,     // Optional - 'auto' or 'home' (default: 'auto')
 *   forceNew: boolean      // Optional - skip existing quote check (default: false)
 * }
 * 
 * This is the simplified flow - no product lookup required.
 */
const requestQuoteDirect = async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get defaults from carrier config (env: ENABLED_CARRIERS, FORTUS_DEFAULT_ENVIRONMENT)
    const defaultCarriers = carrierConfig.getEnabledCarrierCodes();
    const defaultEnvironment = carrierConfig.getDefaultEnvironment();
    
    const { 
      leadId, 
      carriers = defaultCarriers, 
      environment = defaultEnvironment,
      quoteType = 'auto',
      forceNew = false 
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: 'leadId is required'
      });
    }

    // Validate carriers using carrier config
    const supportedCarriers = quoteService.getSupportedCarriers();
    const { SUPPORTED_ENVIRONMENTS } = quoteService;
    const invalidCarriers = carriers.filter(c => !supportedCarriers.includes(c));
    if (invalidCarriers.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid carriers: ${invalidCarriers.join(', ')}. Valid: ${supportedCarriers.join(', ')}`
      });
    }

    if (!SUPPORTED_ENVIRONMENTS.includes(environment)) {
      return res.status(400).json({
        success: false,
        message: 'environment must be "test" or "production"'
      });
    }

    logger.info('Requesting quote (direct flow)', {
      leadId,
      carriers,
      environment,
      quoteType,
      forceNew
    });

    // Request quote from LMS using simplified flow
    const result = await quoteService.requestQuoteDirect({
      leadId,
      carriers,
      environment,
      quoteType,
      forceNew
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message,
        quoteId: result.quoteId,
        quoteExists: result.quoteExists,
        carriers: result.carriers,
        responseTime: result.responseTime
      });
    } else {
      return res.status(200).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('QuoteController.requestQuoteDirect error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while requesting quote'
    });
  }
};

/**
 * Get all products of a specific type for a user
 * 
 * GET /api/quote/products/:productSlug
 * 
 * Returns all products matching the slug (e.g., all car-insurance products)
 * Supports multiple products of same type (2 cars, 3 homes, etc.)
 */
const getProductsBySlug = async (req, res) => {
  try {
    const userId = req.userId;
    const { productSlug } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!productSlug) {
      return res.status(400).json({
        success: false,
        message: 'productSlug is required'
      });
    }

    // Get ALL products matching this slug (supports multiple of same type)
    const userProducts = await UserProduct.findAllByUserAndSlug(userId, productSlug);

    return res.status(200).json({
      success: true,
      count: userProducts.length,
      products: userProducts.map(up => ({
        id: up._id,
        leadId: up.leadId,
        productId: up.productId,
        productSlug: up.productSlug,
        productName: up.productName,
        quoteStatus: up.quoteStatus,
        quoteRequestedAt: up.quoteRequestedAt,
        quoteCompletedAt: up.quoteCompletedAt,
        status: up.status,
        createdAt: up.createdAt,
        // Include lead metadata to help identify (e.g., "Toyota Camry" vs "Honda Civic")
        vehicleInfo: up.lmsMetadata?.content?.vehicle || up.lmsMetadata?.content?.vehicleInfo || null
      }))
    });

  } catch (error) {
    logger.error('QuoteController.getProductsBySlug error', {
      message: error.message
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while getting products'
    });
  }
};

/**
 * Fetch quote by userProductId - use this for multiple products of same type
 * 
 * GET /api/quote/fetch-by-id/:userProductId
 * 
 * Unlike fetchQuote which uses productSlug, this uses the unique userProductId
 * Essential for handling multiple car-insurance products
 */
const fetchQuoteById = async (req, res) => {
  try {
    const userId = req.userId;
    const { userProductId } = req.params;
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    logger.info('QuoteController.fetchQuoteById called', {
      userId,
      userProductId,
      requestId
    });

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!userProductId) {
      return res.status(400).json({
        success: false,
        message: 'userProductId is required'
      });
    }

    // Find the specific user product
    const userProduct = await UserProduct.findOne({
      _id: userProductId,
      userId,
      status: 'active'
    });

    if (!userProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    logger.info('Found user product by ID', {
      userProductId: userProduct._id,
      leadId: userProduct.leadId,
      productSlug: userProduct.productSlug,
      quoteStatus: userProduct.quoteStatus,
      requestId
    });

    // Check if quote already exists
    if (userProduct.quoteStatus === 'success') {
      // Fetch existing quote from LMS
      const quoteResult = await lmsApiService.getQuoteByLeadId(
        userProduct.leadId.toString()
      );

      const quoteRecord = quoteResult.success ? quoteResult.quote : null;
      const carriers = quoteRecord?.carriers || [];

      return res.status(200).json({
        success: true,
        message: 'Quote already exists',
        quoteStatus: 'success',
        userProductId: userProduct._id,
        quote: quoteRecord ? {
          id: quoteRecord._id,
          carriers: carriers,
          carriersCount: carriers.length,
          responseTime: quoteRecord.responseTime,
          createdAt: quoteRecord.createdAt,
          trackingNumber: quoteRecord.trackingNumber
        } : null
      });
    }

    // Check if already fetching
    if (userProduct.quoteStatus === 'fetching') {
      const fetchingTimeout = 2 * 60 * 1000;
      const statusAge = userProduct.quoteStatusUpdatedAt
        ? Date.now() - new Date(userProduct.quoteStatusUpdatedAt).getTime()
        : fetchingTimeout + 1;

      if (statusAge < fetchingTimeout) {
        return res.status(200).json({
          success: true,
          message: 'Quote is being fetched',
          quoteStatus: 'fetching',
          userProductId: userProduct._id
        });
      }
    }

    // Atomically set status to fetching
    const updateResult = await UserProduct.findOneAndUpdate(
      {
        _id: userProduct._id,
        quoteStatus: { $ne: 'fetching' }
      },
      {
        $set: {
          quoteStatus: 'fetching',
          quoteStatusUpdatedAt: new Date()
        }
      },
      { new: true }
    );

    if (!updateResult) {
      return res.status(200).json({
        success: true,
        message: 'Quote is being fetched by another request',
        quoteStatus: 'fetching',
        userProductId: userProduct._id
      });
    }

    // Request quote from LMS
    // Use enabled carriers from config (ENABLED_CARRIERS env var)
    const result = await quoteService.requestQuoteDirect({
      leadId: userProduct.leadId.toString(),
      carriers: carrierConfig.getEnabledCarrierCodes(),
      environment: carrierConfig.getDefaultEnvironment(),
      quoteType: 'auto'
    });

    if (result.success) {
      await userProduct.updateQuoteStatus('success');

      const quoteResult = await lmsApiService.getQuoteByLeadId(
        userProduct.leadId.toString()
      );

      const quoteRecord = quoteResult.success ? quoteResult.quote : null;
      const carriers = quoteRecord?.carriers || [];

      return res.status(200).json({
        success: true,
        message: result.message || 'Quote fetched successfully',
        quoteStatus: 'success',
        userProductId: userProduct._id,
        quote: quoteRecord ? {
          id: quoteRecord._id,
          carriers: carriers,
          carriersCount: carriers.length,
          responseTime: quoteRecord.responseTime,
          createdAt: quoteRecord.createdAt,
          trackingNumber: quoteRecord.trackingNumber
        } : null
      });
    } else {
      await userProduct.updateQuoteStatus('failed', result.message);

      return res.status(200).json({
        success: false,
        message: result.message || 'Failed to fetch quote',
        quoteStatus: 'failed',
        userProductId: userProduct._id,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('QuoteController.fetchQuoteById error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching quote'
    });
  }
};

module.exports = {
  requestQuote,
  requestQuoteDirect,
  getQuoteStatus,
  getQuoteDetails,
  getUserProducts,
  getProductsBySlug,
  fetchQuote,
  fetchQuoteById,
  // Async polling endpoints
  pollQuoteStatus,
  getQuotesByLead
};
