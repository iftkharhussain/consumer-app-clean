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

    // ── WinQuote (life / insurance) products: SYNCHRONOUS quote, no polling ──
    // Fortus (auto) products fall through to the existing async block below, unchanged.
    if ((userProduct.quoteEngine || 'fortus') === 'winquote') {
      await userProduct.updateQuoteStatus('fetching');

      logger.info('Requesting LIFE quote from LMS (WinQuote)', {
        userProductId: userProduct._id,
        appLeadId: userProduct.appLeadId,   // all_leads._id
        productSlug: userProduct.productSlug
      });

      const lifeResult = await quoteService.requestLifeQuoteDirect({
        leadId: userProduct.appLeadId.toString()  // all_leads._id
      });

      if (lifeResult.success) {
        // Synchronous engine → persist result on the user_product and mark success immediately.
        userProduct.lmsMetadata = {
          ...(userProduct.lmsMetadata || {}),
          quoteData: lifeResult.quote
        };
        await userProduct.updateQuoteStatus('success'); // saves the doc (incl. lmsMetadata)

        return res.status(200).json({
          success: true,
          message: lifeResult.message || 'Life quote generated',
          status: 'success',
          quoteProvider: 'winquote',
          userProductId: userProduct._id,
          leadId: userProduct.leadId.toString(),
          quote: lifeResult.quote
        });
      }

      await userProduct.updateQuoteStatus('failed', lifeResult.message);
      return res.status(200).json({
        success: false,
        message: lifeResult.message || 'Life quote failed',
        status: 'failed',
        userProductId: userProduct._id,
        error: lifeResult.error
      });
    }

    // Update quote status to fetching
    await userProduct.updateQuoteStatus('fetching');

    logger.info('Requesting quote from LMS', {
      userProductId: userProduct._id,
      leadId: userProduct.leadId,        // leads._id (internal)
      appLeadId: userProduct.appLeadId,  // all_leads._id (external)
      productId: userProduct.productId,
      leadProductId: userProduct.leadProductId
    });

    // Request quote from LMS using simplified direct flow
    // Use appLeadId (all_leads._id) - this is the external-facing ID
    // Use enabled carriers from config (ENABLED_CARRIERS env var)
    // NOTE: LMS now returns immediately with quoteId (async pattern)
    // Frontend should poll for status using checkQuoteStatus endpoint
    const result = await quoteService.requestQuoteDirect({
      leadId: userProduct.appLeadId.toString(),  // USE all_leads._id
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
 * Optimization: If quote data already exists in consumer DB and is complete,
 * serve from cache instead of calling LMS API.
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
    let allLeadsId = null;  // all_leads._id from user session
    if (userId) {
      const User = require('../schema/User');
      const user = await User.findById(userId);
      allLeadsId = user?.leadSystemInfo?.leadId?.toString();
      console.log('[pollQuoteStatus] Got allLeadsId from user', { allLeadsId });
      
      // Check if we already have complete quote data in consumer DB
      if (allLeadsId) {
        const userProduct = await UserProduct.findOne({
          leadId: allLeadsId,  // all_leads._id
          status: 'active',
          'lmsMetadata.quoteData.quoteId': quoteId
        });
        
        if (userProduct && userProduct.lmsMetadata?.quoteData) {
          const cachedQuote = userProduct.lmsMetadata.quoteData;
          const isComplete = ['success', 'failed', 'timeout'].includes(cachedQuote.status);
          
          // If we have complete quote data cached, return it immediately
          if (isComplete) {
            console.log('[pollQuoteStatus] Serving from cache', {
              quoteId,
              status: cachedQuote.status,
              carriersCount: cachedQuote.carriers?.length || 0
            });
            
            return res.status(200).json({
              success: true,
              quoteId: cachedQuote.quoteId,
              leadId: allLeadsId,  // all_leads._id
              status: cachedQuote.status,
              isComplete: true,
              fromCache: true, // Indicator that this came from cache
              ...(cachedQuote.status === 'success' && {
                carriers: cachedQuote.carriers || [],
                carriersCount: cachedQuote.carriers?.length || 0
              }),
              ...(cachedQuote.status === 'failed' && {
                error: cachedQuote.error || 'Quote request failed'
              }),
              createdAt: cachedQuote.createdAt,
              updatedAt: cachedQuote.updatedAt
            });
          }
        }
      }
    }

    console.log('[pollQuoteStatus] No cache found, calling LMS API', { quoteId, allLeadsId });

    // Call LMS to get current quote status - pass object with both IDs
    const result = await quoteService.checkQuoteStatusById({ quoteId, allLeadsId });
    console.log(' [LMS POLL RAW]:', JSON.stringify(result, null, 2));

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

    // If quote is complete and we have leadId, update local status AND save quote data
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
          
          // Save quote data to lmsMetadata for future use
          if (quote.status === 'success') {
            const quoteData = {
              quoteId: quote._id || quoteId,
              status: quote.status,
              carriers: quote.carriers || [],
              coverages: null,
              createdAt: quote.createdAt,
              updatedAt: quote.updatedAt
            };
            
            // Extract coverages from first successful carrier
            const firstCarrier = quote.carriers?.find(c => c.status === 'success');
            if (firstCarrier && firstCarrier.coverages) {
              quoteData.coverages = firstCarrier.coverages;
            }
            
            // Update lmsMetadata with quote data - properly handle nested object
            if (!userProduct.lmsMetadata) {
              userProduct.lmsMetadata = {};
            }
            
            // Convert to plain object if it's a Mongoose document
            const existingMetadata = userProduct.lmsMetadata.toObject ? 
              userProduct.lmsMetadata.toObject() : userProduct.lmsMetadata;
            
            userProduct.lmsMetadata = {
              ...existingMetadata,
              quoteData
            };
            
            // Mark as modified for Mongoose to detect change
            userProduct.markModified('lmsMetadata');
            
            await userProduct.save();
            
            console.log('[pollQuoteStatus] Saved quote data to user_products', {
              userProductId: userProduct._id,
              quoteId: quoteData.quoteId,
              hasCoverages: !!quoteData.coverages,
              carriersCount: quoteData.carriers.length
            });
          }
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
      updatedAt: quote.updatedAt,
      cars: await (async () => {
        try {
          const leadIdForCars = quote.leadId || allLeadsId;
          if (leadIdForCars) {
            const UserProduct = require('../schema/UserProduct');
            const up = await UserProduct.findOne({ leadId: leadIdForCars, status: 'active' });
            let content = up?.lmsMetadata?.content;
            if (typeof content === 'string') {
              try { content = JSON.parse(content); } catch (e) {}
            }
            return content?.cars || [];
          }
        } catch (e) {
          console.error('[pollQuoteStatus] Error fetching cars:', e.message);
        }
        return [];
      })()
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

    // Fetch quote record from LMS API using appLeadId (all_leads._id)
    const result = await lmsApiService.getQuoteByLeadId(
      userProduct.appLeadId.toString(),  // Use all_leads._id
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

    const products = userProducts.map(up => {
      const o = up.toObject ? up.toObject() : up;
      return {
        id: o._id,
        leadId: o.leadId,
        productId: o.productId,
        productSlug: o.productSlug,
        productName: o.productName,
        quoteEngine: o.quoteEngine,
        advisor: o.advisor || null, // persisted advisor (absolute avatar URL)
        // Submitted form data (the lead notes), so result pages can show the
        // user's actual inputs (coverage, needs, etc.) instead of placeholders.
        submission: o.lmsMetadata?.content || null,
        quoteStatus: o.quoteStatus,
        quoteRequestedAt: o.quoteRequestedAt,
        quoteCompletedAt: o.quoteCompletedAt,
        status: o.status,
        createdAt: o.createdAt
      };
    });

    // Enrich each advisor's calendar link LIVE. The advisor is persisted on the
    // product at lead-login time, so a link the advisor sets/changes afterwards
    // wouldn't otherwise show. Best-effort — keep the persisted value on any failure.
    try {
      if (products.some(p => p.advisor && p.advisor._id)) {
        const User = require('../schema/User');
        const user = await User.findById(userId).select('email').lean();
        if (user?.email) {
          const adv = await lmsApiService.lmsGet('/all-advisors', { source: 'consumer-app' }, { email: user.email });
          const liveMap = {};
          (adv?.data || []).forEach(item => {
            const a = item?.advisor;
            if (a && a._id) liveMap[String(a._id)] = { calendarLink: a.calendarLink || '', calendarType: a.calendarType || 'none' };
          });
          products.forEach(p => {
            const live = p.advisor && liveMap[String(p.advisor._id)];
            if (live) {
              p.advisor.calendarLink = live.calendarLink;
              p.advisor.calendarType = live.calendarType;
            }
          });
        }
      }
    } catch (e) {
      logger.error('getUserProducts: live advisor calendar enrichment failed', { message: e.message });
    }

    return res.status(200).json({ success: true, products });

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

    // Get the active quote session to ensure we fetch the right product
    const QuoteSession = require('../schema/QuoteSession');
    const activeSession = await QuoteSession.findOne({
      userId,
      isActive: true,
      status: 'active'
    });

    logger.info('Active quote session check', {
      userId,
      hasActiveSession: !!activeSession,
      sessionId: activeSession?.sessionId,
      requestId
    });

    // Find the user's product for the active session
    let userProduct;
    
    if (activeSession) {
      // Find product associated with the active session
      userProduct = await UserProduct.findOne({
        userId,
        productSlug,
        quoteSessionId: activeSession.sessionId,
        status: 'active'
      });
      
      logger.info('Looking for product in active session', {
        sessionId: activeSession.sessionId,
        found: !!userProduct,
        requestId
      });
    }
    
    // Fallback to any product with this slug if no active session
    if (!userProduct) {
      userProduct = await UserProduct.findByUserAndSlug(userId, productSlug);
    }

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
        if (activeSession) {
          userProduct = await UserProduct.findOne({
            userId,
            productSlug,
            quoteSessionId: activeSession.sessionId,
            status: 'active'
          });
        }
        
        if (!userProduct) {
          userProduct = await UserProduct.findByUserAndSlug(userId, productSlug);
        }
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
      leadId: userProduct.leadId,        // leads._id (internal)
      appLeadId: userProduct.appLeadId,  // all_leads._id (external)
      productId: userProduct.productId,
      quoteStatus: userProduct.quoteStatus,
      requestId
    });

    // ── WinQuote (life / insurance) products: synchronous; return stored quote or generate ──
    // Fortus (auto) products fall through to the existing async+poll logic below, unchanged.
    if ((userProduct.quoteEngine || 'fortus') === 'winquote') {
      // Already generated -> return the stored quote (reload-safe)
      if (userProduct.quoteStatus === 'success' && userProduct.lmsMetadata?.quoteData) {
        return res.status(200).json({
          success: true,
          status: 'success',
          quoteProvider: 'winquote',
          userProductId: userProduct._id,
          quote: userProduct.lmsMetadata.quoteData
        });
      }

      // Otherwise generate synchronously via WinQuote and persist
      await userProduct.updateQuoteStatus('fetching');
      const lifeResult = await quoteService.requestLifeQuoteDirect({
        leadId: userProduct.appLeadId.toString()
      });

      if (lifeResult.success) {
        userProduct.lmsMetadata = {
          ...(userProduct.lmsMetadata || {}),
          quoteData: lifeResult.quote
        };
        await userProduct.updateQuoteStatus('success'); // saves doc incl. lmsMetadata
        return res.status(200).json({
          success: true,
          status: 'success',
          quoteProvider: 'winquote',
          userProductId: userProduct._id,
          quote: lifeResult.quote
        });
      }

      await userProduct.updateQuoteStatus('failed', lifeResult.message);
      return res.status(200).json({
        success: false,
        status: 'failed',
        userProductId: userProduct._id,
        message: lifeResult.message || 'Life quote failed',
        error: lifeResult.error
      });
    }

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
      // Get quote details from LMS API using appLeadId (all_leads._id)
      const result = await lmsApiService.getQuoteByLeadId(
        userProduct.appLeadId.toString()  // Use all_leads._id for quote lookup
      );

      if (result.success && result.quote) {
        console.log(' [LMS RAW QUOTE]:', JSON.stringify(result.quote, null, 2));
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
            trackingNumber: quoteRecord.trackingNumber,
            cars: (() => {
              let content = userProduct.lmsMetadata?.content;
              if (typeof content === 'string') {
                try { content = JSON.parse(content); } catch (e) {}
              }
              return content?.cars || [];
            })()
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
    // Use appLeadId (all_leads._id) - this is the external-facing ID
    // LMS returns immediately with quoteId for async polling
    const result = await quoteService.requestQuoteDirect({
      leadId: userProduct.appLeadId.toString(),  // USE all_leads._id
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
          leadId: userProduct.appLeadId.toString(),  // Return all_leads._id to frontend
          // Polling hints for frontend
          pollInterval: 5000,  // 5 seconds
          maxPollTime: 300000  // 5 minutes
        });
      }

      // Quote is already complete (from existing quote)
      if (quoteStatus === 'success') {
        await userProduct.updateQuoteStatus('success');
        
        // Fetch quote details via API using appLeadId
        const quoteResult = await lmsApiService.getQuoteByLeadId(
          userProduct.appLeadId.toString()  // Use all_leads._id
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
        appLeadId: userProduct.appLeadId,  // all_leads._id
        requestId
      });

      // Fetch the quote details from LMS API using appLeadId (all_leads._id)
      const quoteResult = await lmsApiService.getQuoteByLeadId(
        userProduct.appLeadId.toString()  // Use all_leads._id
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
      leadId: userProduct.leadId,        // leads._id (internal)
      appLeadId: userProduct.appLeadId,  // all_leads._id (external)
      productSlug: userProduct.productSlug,
      quoteStatus: userProduct.quoteStatus,
      requestId
    });

    // Check if quote already exists
    if (userProduct.quoteStatus === 'success') {
      // Fetch existing quote from LMS using appLeadId (all_leads._id)
      const quoteResult = await lmsApiService.getQuoteByLeadId(
        userProduct.appLeadId.toString()  // Use all_leads._id
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
    // Use appLeadId (all_leads._id) - this is the external-facing ID
    // Use enabled carriers from config (ENABLED_CARRIERS env var)
    const result = await quoteService.requestQuoteDirect({
      leadId: userProduct.appLeadId.toString(),  // USE all_leads._id
      carriers: carrierConfig.getEnabledCarrierCodes(),
      environment: carrierConfig.getDefaultEnvironment(),
      quoteType: 'auto'
    });

    if (result.success) {
      await userProduct.updateQuoteStatus('success');

      const quoteResult = await lmsApiService.getQuoteByLeadId(
        userProduct.appLeadId.toString()  // Use all_leads._id
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

/**
 * Recalculate quote with modified coverage settings
 * 
 * POST /api/quote/recalculate
 * Body: { userProductId: string, protections: {...} }
 * 
 * Returns temporary quote data - NOT saved to database.
 * Quote only gets persisted when user clicks "Demander un appel".
 */
const recalculateQuote = async (req, res) => {
  try {
    const userId = req.userId;
    const { userProductId, protections } = req.body;

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

    if (!protections) {
      return res.status(400).json({
        success: false,
        message: 'protections object is required'
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
        message: 'Product not found for this user'
      });
    }

    logger.info('Recalculating quote with modified protections', {
      userProductId,
      leadId: userProduct.leadId,        // leads._id (internal)
      appLeadId: userProduct.appLeadId,  // all_leads._id (external)
      hasProtections: !!protections
    });

    // Call LMS to recalculate quote using appLeadId (all_leads._id)
    const result = await quoteService.recalculateQuote({
      leadId: userProduct.appLeadId.toString(),  // USE all_leads._id
      coverageModifications: protections
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message || 'Quote recalculated (temporary)',
        isTemporary: true,
        userProductId: userProduct._id,
        quote: {
          carriers: result.carriers,
          carriersCount: result.carriers?.length || 0,
          processingTime: result.processingTime,
          coverageModifications: result.coverageModifications
        },
        errors: result.errors
      });
    } else {
      return res.status(200).json({
        success: false,
        message: result.message || 'Failed to recalculate quote',
        userProductId: userProduct._id,
        error: result.message
      });
    }

  } catch (error) {
    logger.error('QuoteController.recalculateQuote error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while recalculating quote'
    });
  }
};

/**
 * POST /api/quote/personalize-life
 * Re-price the user's life (WinQuote) product with a new term (plan) and/or coverage
 * amount from the "Personnaliser" popup, persist the new quote, and return it.
 * Body: { plan?, faceAmount?, productSlug? }
 */
const personalizeLifeQuote = async (req, res) => {
  try {
    const userId = req.userId;
    const { plan, faceAmount, productSlug = 'life-insurance' } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!plan && (faceAmount === undefined || faceAmount === null || faceAmount === '')) {
      return res.status(400).json({ success: false, message: 'plan or faceAmount is required' });
    }

    const userProduct = await UserProduct.findByUserAndSlug(userId, productSlug);
    if (!userProduct) {
      return res.status(404).json({ success: false, message: 'Product not found for this user' });
    }
    if ((userProduct.quoteEngine || 'fortus') !== 'winquote') {
      return res.status(400).json({ success: false, message: 'Personalization is only available for life/insurance quotes' });
    }

    const overrides = {};
    if (plan) overrides.plan = plan;
    if (faceAmount !== undefined && faceAmount !== null && faceAmount !== '') overrides.faceAmount = Number(faceAmount);

    await userProduct.updateQuoteStatus('fetching');
    const lifeResult = await quoteService.requestLifeQuoteDirect({
      leadId: userProduct.appLeadId.toString(),
      overrides
    });

    if (lifeResult.success) {
      userProduct.lmsMetadata = { ...(userProduct.lmsMetadata || {}), quoteData: lifeResult.quote };
      await userProduct.updateQuoteStatus('success'); // saves doc incl. lmsMetadata
      return res.status(200).json({
        success: true,
        status: 'success',
        quoteProvider: 'winquote',
        userProductId: userProduct._id,
        quote: lifeResult.quote
      });
    }

    await userProduct.updateQuoteStatus('failed', lifeResult.message);
    return res.status(200).json({
      success: false,
      status: 'failed',
      userProductId: userProduct._id,
      message: lifeResult.message || 'Life quote personalization failed',
      error: lifeResult.error
    });
  } catch (error) {
    logger.error('QuoteController.personalizeLifeQuote error', { message: error.message });
    return res.status(500).json({ success: false, message: 'An error occurred while personalizing the quote' });
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
  getQuotesByLead,
  // Recalculate quote
  recalculateQuote,
  // Life personalizer (term / coverage amount re-price)
  personalizeLifeQuote
};
