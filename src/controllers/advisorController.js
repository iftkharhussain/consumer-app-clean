const axios = require('axios');
const jwt = require('jsonwebtoken');

/**
 * Advisor Controller - Handles advisor-related proxy requests to Norga LMS
 */
const getAllAdvisors = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // 1. Create a Cross-App JWT Token to authenticate with Norga LMS
    const CROSS_APP_SECRET = process.env.CROSS_APP_JWT_SECRET;
    const token = jwt.sign(
      { 
        type: 'cross_app_request',
        source: 'consumer-app',
        timestamp: Date.now()
      }, 
      CROSS_APP_SECRET, 
      { algorithm: 'HS256', expiresIn: '1m' }
    );

    // 2. Call the Norga LMS API (Internal Backend-to-Backend call)
    const NORGA_API_URL = process.env.NORGA_APP_SERVER || 'http://localhost:3024';
    const targetUrl = `${NORGA_API_URL}/api/crossapp/all-advisors?email=${email}`;

    console.log(`[Proxy] Fetching advisors from Norga: ${targetUrl}`);

    const response = await axios.get(targetUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    // 3. Return the data to the frontend
    return res.status(200).json(response.data);

  } catch (error) {
    console.error('[Advisor Proxy Error]:', error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || 'Failed to fetch advisors from source',
      error: error.message
    });
  }
};

module.exports = {
  getAllAdvisors
};
