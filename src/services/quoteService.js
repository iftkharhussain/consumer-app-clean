/**
 * Quote Service for Consumer App
 * 
 * Handles communication with LMS for quote requests.
 * Signs requests with CROSS_APP_JWT_SECRET for authentication.
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const CROSS_APP_SECRET = process.env.CROSS_APP_JWT_SECRET || 'cross-app-secret-key-change-in-production';
const LMS_API_URL = process.env.NORGA_APP_SERVER || process.env.LMS_API_URL || 'http://localhost:3024';

/**
 * Generate a cross-app request token
 * @param {Object} payload - { leadId, productId, appLeadId }
 * @param {string} expiresIn - Token expiry (default: 5m)
 * @returns {string} JWT token
 */
const generateCrossAppToken = (payload, expiresIn = '5m') => {
  return jwt.sign(
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
};

/**
 * Request a quote from LMS
 * 
 * @param {Object} params
 * @param {string} params.leadId - The lead ID (from user_products.leadId -> all_leads._id)
 * @param {string} params.productId - The product ID (from products collection)
 * @param {string} params.leadProductId - The lead_products collection ID (optional)
 * @param {string} params.userProductId - The user_products collection ID (optional)
 * @returns {Promise<Object>} Quote response
 */
const requestQuote = async ({ leadId, productId, leadProductId, userProductId }) => {
  try {
    // Generate cross-app token with all necessary IDs
    const token = generateCrossAppToken({
      leadId,       // all_leads._id
      productId,    // products._id
      leadProductId, // lead_products._id
      userProductId, // user_products._id (for callback/update)
      appLeadId: leadId // For backwards compatibility
    });
    
    logger.info('QuoteService.requestQuote', {
      leadId,
      productId,
      leadProductId,
      userProductId,
      lmsUrl: LMS_API_URL
    });
    
    // Call LMS quote endpoint
    const response = await axios.post(
      `${LMS_API_URL}/api/crossapp/quote-request`,
      { 
        token,
        // Also send IDs in body for easier access
        leadId,
        productId,
        leadProductId,
        userProductId
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 60000 // 60 seconds timeout for quote requests
      }
    );
    
    return {
      success: response.data.success,
      message: response.data.message,
      quoteId: response.data.quoteId,
      quoteExists: response.data.quoteExists,
      responseTime: response.data.responseTime,
      data: response.data
    };
    
  } catch (error) {
    logger.error('QuoteService.requestQuote error', {
      message: error.message,
      response: error.response?.data
    });
    
    if (error.response) {
      return {
        success: false,
        message: error.response.data?.message || 'Quote request failed',
        error: error.response.data
      };
    }
    
    if (error.code === 'ECONNREFUSED') {
      return {
        success: false,
        message: 'Unable to connect to quote service',
        error: 'LMS server is not available'
      };
    }
    
    return {
      success: false,
      message: error.message || 'Quote request failed',
      error: error.message
    };
  }
};

/**
 * Check quote status from LMS
 * 
 * @param {Object} params
 * @param {string} params.appLeadId - The leads collection ID
 * @param {string} params.productId - The product ID (optional)
 * @returns {Promise<Object>} Quote status
 */
const checkQuoteStatus = async ({ appLeadId, productId }) => {
  try {
    // Generate cross-app token
    const token = generateCrossAppToken({
      appLeadId,
      productId
    });
    
    // Call LMS quote status endpoint
    const response = await axios.get(
      `${LMS_API_URL}/api/crossapp/quote-status`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 10000
      }
    );
    
    return {
      success: response.data.success,
      quoteExists: response.data.quoteExists,
      quoteId: response.data.quoteId,
      status: response.data.status,
      createdAt: response.data.createdAt,
      carriersCount: response.data.carriersCount,
      isSuccessful: response.data.isSuccessful
    };
    
  } catch (error) {
    logger.error('QuoteService.checkQuoteStatus error', {
      message: error.message,
      response: error.response?.data
    });
    
    return {
      success: false,
      quoteExists: false,
      message: error.response?.data?.message || error.message || 'Failed to check quote status'
    };
  }
};

module.exports = {
  requestQuote,
  checkQuoteStatus,
  generateCrossAppToken
};
