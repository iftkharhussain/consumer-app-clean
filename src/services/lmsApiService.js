/**
 * LMS API Service for Consumer App
 * 
 * Provides API-based access to LMS data, replacing direct database reads.
 * All requests are authenticated using CROSS_APP_JWT_SECRET.
 * 
 * Migration Note (Jan 2026):
 * This service replaces direct lmsDB (lmsCollections.js) access with API calls.
 * Part of the migration to decouple Consumer App from LMS database schema.
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const CROSS_APP_SECRET = process.env.CROSS_APP_JWT_SECRET;
const LMS_API_URL = process.env.NORGA_APP_SERVER;

// Debug: Log secret on startup (first 10 chars only for security)
console.log('[LmsApiService] Consumer CROSS_APP_SECRET loaded:', CROSS_APP_SECRET);
console.log('[LmsApiService] LMS_API_URL:', LMS_API_URL);

/**
 * Generate a cross-app request token
 * @param {Object} payload - Data to include in token
 * @param {string} expiresIn - Token expiry (default: 5m)
 * @returns {string} JWT token
 */
const generateCrossAppToken = (payload, expiresIn = '5m') => {
  const token = jwt.sign(
    {
      ...payload,
      type: 'cross_app_request',
      source: 'consumer_app'
    },
    CROSS_APP_SECRET,
    { 
      algorithm: 'HS256',
      expiresIn 
    }
  );
  console.log('[LmsApiService] Generated token:', token.substring(0, 50) + '... (length: ' + token.length + ')');
  return token;
};

/**
 * Make an authenticated GET request to LMS API
 * @param {string} endpoint - API endpoint (e.g., '/leads/:id/products')
 * @param {Object} tokenPayload - Data to include in the auth token
 * @param {Object} queryParams - Optional query parameters
 * @returns {Promise<Object>} API response
 */
const lmsGet = async (endpoint, tokenPayload, queryParams = {}) => {
  const token = generateCrossAppToken(tokenPayload);
  
  const url = new URL(`${LMS_API_URL}/api/crossapp${endpoint}`);
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  
  console.log('[LmsApiService] Making request to:', url.toString());

  const response = await axios.get(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    timeout: 15000
  });

  return response.data;
};

/**
 * Make an authenticated POST request to LMS API
 * @param {string} endpoint - API endpoint (e.g., '/fortus/request-call')
 * @param {Object} tokenPayload - Data to include in the auth token
 * @param {Object} body - Request body
 * @returns {Promise<Object>} API response
 */
const lmsPost = async (endpoint, tokenPayload, body = {}) => {
  const token = generateCrossAppToken(tokenPayload);
  
  const url = `${LMS_API_URL}/api/crossapp${endpoint}`;
  
  console.log('[LmsApiService] Making POST request to:', url);

  const response = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    timeout: 30000 // Longer timeout for processing requests
  });

  return response.data;
};

/**
 * Fetch lead products from LMS
 * 
 * Replaces: lmsDB.leadProducts.find({ leadId })
 * 
 * @param {string} leadId - The lead ID (from all_leads collection)
 * @returns {Promise<Object>} { success, products, count }
 */
const getLeadProducts = async (leadId) => {
  try {
    if (!leadId) {
      throw new Error('leadId is required');
    }

    logger.info('LmsApiService.getLeadProducts', { leadId });

    const result = await lmsGet(`/leads/${leadId}/products`, {
      appLeadId: leadId
    });

    return {
      success: true,
      products: result.products || [],
      count: result.count || 0
    };

  } catch (error) {
    logger.error('LmsApiService.getLeadProducts error', {
      leadId,
      message: error.message,
      response: error.response?.data
    });

    return {
      success: false,
      products: [],
      count: 0,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Fetch quote details from LMS by quote ID
 * 
 * Replaces: lmsDB.quoteRecords.findOne({ _id: quoteId })
 * 
 * @param {string} quoteId - The quote record ID
 * @param {string} leadId - The lead ID (for auth token)
 * @returns {Promise<Object>} { success, quote }
 */
const getQuoteById = async (quoteId, leadId) => {
  try {
    if (!quoteId) {
      throw new Error('quoteId is required');
    }

    logger.info('LmsApiService.getQuoteById', { quoteId, leadId });

    const result = await lmsGet(`/quotes/${quoteId}`, {
      appLeadId: leadId
    });

    return {
      success: true,
      quote: result.quote
    };

  } catch (error) {
    logger.error('LmsApiService.getQuoteById error', {
      quoteId,
      leadId,
      message: error.message,
      response: error.response?.data
    });

    if (error.response?.status === 404) {
      return {
        success: false,
        quote: null,
        notFound: true,
        error: 'Quote not found'
      };
    }

    return {
      success: false,
      quote: null,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Fetch quote by lead ID (latest quote for the lead)
 * 
 * Replaces: lmsDB.quoteRecords.findOne({ appLeadId, productId }).sort({ createdAt: -1 })
 * 
 * @param {string} leadId - The lead ID
 * @param {string} productId - Optional product ID filter
 * @returns {Promise<Object>} { success, quote }
 */
const getQuoteByLeadId = async (leadId, productId = null) => {
  try {
    if (!leadId) {
      throw new Error('leadId is required');
    }

    logger.info('LmsApiService.getQuoteByLeadId', { leadId, productId });

    const queryParams = { byLead: 'true' };
    if (productId) {
      queryParams.productId = productId;
    }

    const result = await lmsGet(`/quotes/${leadId}`, {
      appLeadId: leadId
    }, queryParams);

    return {
      success: true,
      quote: result.quote
    };

  } catch (error) {
    logger.error('LmsApiService.getQuoteByLeadId error', {
      leadId,
      productId,
      message: error.message,
      response: error.response?.data
    });

    if (error.response?.status === 404) {
      return {
        success: false,
        quote: null,
        notFound: true,
        error: 'Quote not found'
      };
    }

    return {
      success: false,
      quote: null,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Fetch all quotes for a lead (with pagination)
 * 
 * @param {string} leadId - The lead ID
 * @param {Object} options - { limit, skip, productId }
 * @returns {Promise<Object>} { success, quotes, pagination }
 */
const getLeadQuotes = async (leadId, options = {}) => {
  try {
    if (!leadId) {
      throw new Error('leadId is required');
    }

    const { limit = 10, skip = 0, productId } = options;

    logger.info('LmsApiService.getLeadQuotes', { leadId, limit, skip, productId });

    const result = await lmsGet(`/leads/${leadId}/quotes`, {
      appLeadId: leadId
    }, { limit, skip, productId });

    return {
      success: true,
      quotes: result.quotes || [],
      pagination: result.pagination || { total: 0, limit, skip, hasMore: false }
    };

  } catch (error) {
    logger.error('LmsApiService.getLeadQuotes error', {
      leadId,
      message: error.message,
      response: error.response?.data
    });

    return {
      success: false,
      quotes: [],
      pagination: { total: 0, hasMore: false },
      error: error.response?.data?.message || error.message
    };
  }
};

module.exports = {
  generateCrossAppToken,
  lmsGet,
  lmsPost,
  getLeadProducts,
  getQuoteById,
  getQuoteByLeadId,
  getLeadQuotes,
  // Export for testing
  LMS_API_URL
};
