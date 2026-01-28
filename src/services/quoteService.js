/**
 * Quote Service for Consumer App
 * 
 * Handles communication with LMS for quote requests.
 * Signs requests with CROSS_APP_JWT_SECRET for authentication.
 * 
 * Async Polling Flow (Jan 2026):
 * 1. requestQuoteDirect() - Submit quote request, returns immediately with quoteId
 * 2. checkQuoteStatusById() - Poll for status until success/failed/timeout
 * 3. Quote status: pending → processing → success/failed/timeout
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const carrierConfig = require('../config/carrierConfig');

const CROSS_APP_SECRET = process.env.CROSS_APP_JWT_SECRET || 'cross-app-secret-key-change-in-production';
const LMS_API_URL = process.env.NORGA_APP_SERVER || process.env.LMS_API_URL || 'http://localhost:3024';

/**
 * Get supported carriers from carrier config (reads from CARRIER_DEFINITIONS)
 * For validation of incoming carrier codes
 */
const getSupportedCarriers = () => {
  return carrierConfig.getAllCarrierCodes();
};

/**
 * Supported environments for quote requests
 */
const SUPPORTED_ENVIRONMENTS = ['test', 'production'];

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
 * Request a quote directly using leadId + insurers + environment (SIMPLIFIED)
 * 
 * @param {Object} params
 * @param {string} params.leadId - The lead ID (appLeadId / all_leads._id)
 * @param {string[]} params.insurers - Array of insurer names (defaults to ENABLED_CARRIERS from env)
 * @param {string} params.environment - 'test' or 'production' (defaults to FORTUS_DEFAULT_ENVIRONMENT from env)
 * @param {string} params.quoteType - 'auto' or 'home' (default: 'auto')
 * @param {boolean} params.forceNew - Skip existing quote check (default: false)
 * @returns {Promise<Object>} Quote response
 */
const requestQuoteDirect = async ({ 
  leadId, 
  insurers = carrierConfig.getEnabledInsurerGroups(), 
  environment = carrierConfig.getDefaultEnvironment(),
  quoteType = 'auto',
  forceNew = false 
}) => {
  try {
    if (!leadId) {
      return { success: false, message: 'leadId is required' };
    }

    // Validate insurers
    const validInsurers = carrierConfig.getAllInsurerGroups();
    const invalidInsurers = insurers.filter(i => !validInsurers.includes(i.toLowerCase()));
    if (invalidInsurers.length > 0) {
      return { 
        success: false, 
        message: `Invalid insurers: ${invalidInsurers.join(', ')}. Valid: ${validInsurers.join(', ')}` 
      };
    }

    if (!SUPPORTED_ENVIRONMENTS.includes(environment)) {
      return { success: false, message: 'environment must be "test" or "production"' };
    }

    // Generate cross-app token
    const token = generateCrossAppToken({
      appLeadId: leadId
    });
    
    logger.info('QuoteService.requestQuoteDirect', {
      leadId,
      insurers,
      environment,
      quoteType,
      forceNew,
      lmsUrl: LMS_API_URL
    });
    
    // Call LMS quote endpoint with insurers (not carrier codes)
    // LMS now returns immediately with quoteId, processes async
    const response = await axios.post(
      `${LMS_API_URL}/api/crossapp/quote-request`,
      { 
        insurers,
        leadId,  // Send leadId in body for proper linking
        environment,
        quoteType,
        forceNew
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 30000  // Reduced timeout since LMS returns immediately now
      }
    );
    
    return {
      success: response.data.success,
      message: response.data.message,
      quoteId: response.data.quoteId,
      status: response.data.status,  // New: pending, processing, success, failed
      quoteExists: response.data.quoteExists,
      carriers: response.data.carriers,
      responseTime: response.data.responseTime,
      data: response.data
    };
    
  } catch (error) {
    logger.error('QuoteService.requestQuoteDirect error', {
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
 * Request a quote from LMS (LEGACY - kept for backwards compatibility)
 * 
 * @param {Object} params
 * @param {string} params.leadId - The lead ID (from user_products.leadId -> all_leads._id)
 * @param {string} params.productId - The product ID (from products collection)
 * @param {string} params.leadProductId - The lead_products collection ID (optional)
 * @param {string} params.userProductId - The user_products collection ID (optional)
 * @returns {Promise<Object>} Quote response
 * @deprecated Use requestQuoteDirect instead
 */
const requestQuote = async ({ leadId, productId, leadProductId, userProductId }) => {
  // Delegate to the simpler requestQuoteDirect
  logger.warn('QuoteService.requestQuote called - consider using requestQuoteDirect instead');
  return requestQuoteDirect({ 
    leadId, 
    carriers: carrierConfig.getEnabledCarrierCodes(),
    environment: carrierConfig.getDefaultEnvironment(),
    quoteType: 'auto'
  });
};

/**
 * Check quote status by quoteId (for polling)
 * 
 * Use this after requestQuoteDirect() to poll until quote is ready.
 * 
 * @param {Object} params
 * @param {string} params.quoteId - The quote record ID returned from requestQuoteDirect
 * @param {string} params.appLeadId - The app lead ID (for token)
 * @returns {Promise<Object>} Quote status with carriers when ready
 */
const checkQuoteStatusById = async ({ quoteId, appLeadId }) => {
  try {
    if (!quoteId) {
      return { success: false, message: 'quoteId is required' };
    }

    // Generate cross-app token
    const token = generateCrossAppToken({
      appLeadId
    });
    
    // Call LMS quote status endpoint with quoteId
    const response = await axios.get(
      `${LMS_API_URL}/api/crossapp/quote-status/${quoteId}`,
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
      quoteId: response.data.quoteId,
      leadId: response.data.leadId,       // Include leadId for frontend
      appLeadId: response.data.appLeadId, // Include appLeadId for reference
      status: response.data.status,  // pending, processing, success, failed, timeout
      carriers: response.data.carriers,
      createdAt: response.data.createdAt,
      updatedAt: response.data.updatedAt,
      completedAt: response.data.completedAt,
      processingTime: response.data.processingTime,
      errorMessage: response.data.errorMessage
    };
    
  } catch (error) {
    logger.error('QuoteService.checkQuoteStatusById error', {
      quoteId,
      message: error.message,
      response: error.response?.data
    });
    
    if (error.response?.status === 404) {
      return {
        success: false,
        status: 'not_found',
        message: 'Quote not found'
      };
    }
    
    return {
      success: false,
      status: 'error',
      message: error.response?.data?.message || error.message || 'Failed to check quote status'
    };
  }
};

/**
 * Get all quotes for a lead
 * 
 * @param {Object} params
 * @param {string} params.leadId - The lead ID
 * @param {string} params.appLeadId - The app lead ID (for token)
 * @returns {Promise<Object>} List of quotes
 */
const getQuotesByLead = async ({ leadId, appLeadId }) => {
  try {
    if (!leadId) {
      return { success: false, message: 'leadId is required' };
    }

    // Generate cross-app token
    const token = generateCrossAppToken({
      appLeadId: appLeadId || leadId
    });
    
    // Call LMS endpoint
    const response = await axios.get(
      `${LMS_API_URL}/api/crossapp/quotes/by-lead/${leadId}`,
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
      count: response.data.count,
      quotes: response.data.quotes
    };
    
  } catch (error) {
    logger.error('QuoteService.getQuotesByLead error', {
      leadId,
      message: error.message,
      response: error.response?.data
    });
    
    return {
      success: false,
      quotes: [],
      message: error.response?.data?.message || error.message || 'Failed to get quotes'
    };
  }
};

/**
 * Check quote status from LMS (legacy - by appLeadId)
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

/**
 * Request a recalculated quote with modified coverage settings
 * 
 * Used when user modifies protection settings in the customize page.
 * Returns temporary quote data - NOT saved to database.
 * 
 * @param {Object} params
 * @param {string} params.leadId - The lead ID (appLeadId / all_leads._id)
 * @param {Object} params.coverageModifications - Modified coverage settings from frontend
 * @param {string[]} params.insurers - Optional - insurer names (defaults to enabled)
 * @param {string} params.environment - 'test' or 'production' (defaults from env)
 * @returns {Promise<Object>} Temporary quote response
 */
const recalculateQuote = async ({
  leadId,
  coverageModifications,
  insurers = carrierConfig.getEnabledInsurerGroups(),
  environment = carrierConfig.getDefaultEnvironment()
}) => {
  try {
    if (!leadId) {
      return { success: false, message: 'leadId is required' };
    }

    if (!coverageModifications) {
      return { success: false, message: 'coverageModifications is required' };
    }

    // Generate cross-app token
    const token = generateCrossAppToken({
      appLeadId: leadId
    });

    logger.info('QuoteService.recalculateQuote', {
      leadId,
      insurers,
      environment,
      hasModifications: !!coverageModifications
    });

    // Call LMS recalculate endpoint
    const response = await axios.post(
      `${LMS_API_URL}/api/crossapp/quote-recalculate`,
      {
        leadId,
        coverageModifications,
        insurers,
        environment
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 120000 // 2 minutes - recalculation can take time
      }
    );

    logger.info('QuoteService.recalculateQuote - Response', {
      success: response.data.success,
      carriersCount: response.data.carriers?.length || 0,
      isTemporary: response.data.isTemporary
    });

    return {
      success: response.data.success,
      message: response.data.message,
      isTemporary: response.data.isTemporary,
      carriers: response.data.carriers || [],
      coverageModifications: response.data.coverageModifications,
      processingTime: response.data.processingTime,
      errors: response.data.errors
    };

  } catch (error) {
    logger.error('QuoteService.recalculateQuote error', {
      message: error.message,
      response: error.response?.data
    });

    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to recalculate quote'
    };
  }
};

module.exports = {
  requestQuote,
  requestQuoteDirect,
  checkQuoteStatus,
  checkQuoteStatusById,
  getQuotesByLead,
  recalculateQuote,
  generateCrossAppToken,
  getSupportedCarriers,
  SUPPORTED_ENVIRONMENTS
};
