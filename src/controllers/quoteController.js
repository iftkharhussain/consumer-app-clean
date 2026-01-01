/**
 * Quote Controller for Consumer App
 * 
 * Handles quote-related endpoints for the consumer app.
 * Uses quoteService to communicate with LMS.
 */

const quoteService = require('../services/quoteService');
const UserProduct = require('../schema/UserProduct');
const lmsDB = require('../config/lmsCollections');
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

    // Request quote from LMS
    const result = await quoteService.requestQuote({
      leadId: userProduct.leadId.toString(),
      productId: userProduct.productId.toString(),
      leadProductId: userProduct.leadProductId?.toString(),
      userProductId: userProduct._id.toString()
    });

    // Update quote status based on result
    if (result.success) {
      if (result.quoteExists) {
        await userProduct.updateQuoteStatus('success');
      } else {
        await userProduct.updateQuoteStatus('success');
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        quoteId: result.quoteId,
        userProductId: userProduct._id,
        status: 'success'
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
 * Get quote details from LMS database
 * 
 * GET /api/quote/details/:userProductId
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

    // Fetch quote record from LMS database (read-only access via shared DB)
    const quoteRecord = await lmsDB.quoteRecords.findOne({
      appLeadId: userProduct.leadId,
      productId: userProduct.productId,
      status: 'success'
    });

    if (!quoteRecord) {
      return res.status(404).json({
        success: false,
        message: 'No quote found for this product',
        quoteStatus: userProduct.quoteStatus
      });
    }

    // Get carriers with fallback to responseBody
    let carriers = quoteRecord.carriers || [];
    const hasIncompleteCarriers = carriers.length > 0 && !carriers[0]?.carrierName && !carriers[0]?.name;
    if ((carriers.length === 0 || hasIncompleteCarriers) && quoteRecord.responseBody?.carriers) {
      carriers = quoteRecord.responseBody.carriers;
    }

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
      // Get quote details from LMS
      const quoteRecord = await lmsDB.quoteRecords.findOne({
        appLeadId: userProduct.leadId,
        status: 'success'
      });

      if (quoteRecord) {
        // Get carriers from the stored carriers array or from responseBody
        let carriers = quoteRecord.carriers || [];

        // If carriers array is empty OR has incomplete data (no carrierName), use responseBody.carriers
        const hasIncompleteCarriers = carriers.length > 0 && !carriers[0]?.carrierName && !carriers[0]?.name;
        if ((carriers.length === 0 || hasIncompleteCarriers) && quoteRecord.responseBody?.carriers) {
          carriers = quoteRecord.responseBody.carriers;
        }

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

    // Request quote from LMS
    const result = await quoteService.requestQuote({
      leadId: userProduct.leadId.toString(),
      productId: userProduct.productId.toString(),
      leadProductId: userProduct.leadProductId?.toString(),
      userProductId: userProduct._id.toString()
    });

    logger.info('LMS quote response', {
      success: result.success,
      message: result.message,
      requestId
    });

    // Update quote status based on result
    if (result.success) {
      await userProduct.updateQuoteStatus('success');
      logger.info('Quote successful, fetching quote record', {
        userProductId: userProduct._id,
        leadId: userProduct.leadId,
        requestId
      });

      // Fetch the quote details from LMS
      const quoteRecord = await lmsDB.quoteRecords.findOne({
        appLeadId: userProduct.leadId,
        status: 'success'
      });

      logger.info('Quote record lookup result', {
        found: !!quoteRecord,
        quoteRecordId: quoteRecord?._id,
        carriersInArray: quoteRecord?.carriers?.length || 0,
        carriersInResponseBody: quoteRecord?.responseBody?.carriers?.length || 0,
        requestId
      });

      // Get carriers from the stored carriers array or from responseBody
      let carriers = [];
      if (quoteRecord) {
        carriers = quoteRecord.carriers || [];
        // If carriers array is empty OR has incomplete data (no carrierName), use responseBody.carriers
        const hasIncompleteCarriers = carriers.length > 0 && !carriers[0]?.carrierName && !carriers[0]?.name;
        if ((carriers.length === 0 || hasIncompleteCarriers) && quoteRecord.responseBody?.carriers) {
          carriers = quoteRecord.responseBody.carriers;
        }
      }

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

module.exports = {
  requestQuote,
  getQuoteStatus,
  getQuoteDetails,
  getUserProducts,
  fetchQuote
};
