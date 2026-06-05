/**
 * Phone OTP Routes for Consumer App
 * 
 * These routes proxy phone verification requests to the main backend
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { otpVerifyLimiter, createRateLimiter } = require('../middlewares/rateLimiter');

// Rate limiter for sending OTP (prevent SMS abuse)
const sendOtpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,       // 15 min window
  maxAttempts: 10,                 // 10 requests per window
  blockDurationMs: 30 * 60 * 1000, // block for 30 min
  keyPrefix: 'send-otp',
});

// Main backend URL
const MAIN_BACKEND_URL = process.env.MAIN_BACKEND_URL || 'http://localhost:3024';

/**
 * POST /api/v1/phone/funnel/send-otp
 * Send OTP code to phone number
 */
router.post('/funnel/send-otp', sendOtpLimiter, async (req, res) => {
  try {
    const { phoneNumber, channel = 'sms', locale = 'fr' } = req.body;
    
    logger.info('Proxying send-otp request to main backend', {
      phoneNumber: phoneNumber ? phoneNumber.substring(0, 5) + '***' : 'N/A',
      channel,
      locale
    });

    // Forward request to main backend
    const response = await axios.post(
      `${MAIN_BACKEND_URL}/api/v1/phone/funnel/send-otp`,
      { phoneNumber, channel, locale },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    // Forward the response
    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error('Error proxying send-otp request', error);
    
    // If axios error, forward the error response
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    // Generic error
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/phone/funnel/verify-otp
 * Verify OTP code
 */
router.get('/funnel/verify-otp', otpVerifyLimiter, async (req, res) => {
  try {
    const { otp, phoneNumber, channel = 'sms', locale = 'fr' } = req.query;
    
    logger.info('Proxying verify-otp request to main backend', {
      phoneNumber: phoneNumber ? phoneNumber.substring(0, 5) + '***' : 'N/A',
      otp: otp ? '***' : 'N/A',
      channel
    });

    // Forward request to main backend
    const response = await axios.get(
      `${MAIN_BACKEND_URL}/api/v1/phone/funnel/verify-otp`,
      {
        params: { otp, phoneNumber, channel, locale },
        timeout: 10000
      }
    );

    // Forward the response
    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error('Error proxying verify-otp request', error);
    
    // If axios error, forward the error response
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    // Generic error
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
      error: error.message
    });
  }
});

module.exports = router;
