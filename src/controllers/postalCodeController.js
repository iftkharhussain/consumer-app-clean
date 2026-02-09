/**
 * Postal Code Controller
 * Handles HTTP requests for postal code and location index endpoints
 */
const postalCodeService = require('../services/postalCodeService');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Get location index by postal code
 * GET /api/postal-codes/location-index?postalCode=H3C0S5
 */
const getLocationIndex = async (req, res) => {
  try {
    const { postalCode } = req.query;

    if (!postalCode) {
      return errorResponse(res, 'Postal code is required', 400);
    }

    const result = await postalCodeService.getLocationIndexByPostalCode(postalCode);

    if (!result) {
      return errorResponse(res, 'Postal code not found', 404);
    }

    // Check if result indicates out of coverage
    if (result.error === 'out_of_coverage') {
      return errorResponse(res, result.message, 400);
    }

    return successResponse(res, result, 'Location index retrieved successfully');
  } catch (error) {
    console.error('Get location index error:', error);
    return errorResponse(res, 'Failed to get location index', 500);
  }
};

/**
 * Get location index from address
 * POST /api/postal-codes/location-index-from-address
 * Body: { address: "123 Main St, Montreal, QC H3C 0S5" }
 */
const getLocationIndexFromAddress = async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return errorResponse(res, 'Address is required', 400);
    }

    const result = await postalCodeService.getLocationIndexFromAddress(address);

    if (!result) {
      return errorResponse(res, 'No postal code found in address', 404);
    }

    return successResponse(res, result, 'Location index retrieved successfully');
  } catch (error) {
    console.error('Get location index from address error:', error);
    return errorResponse(res, 'Failed to get location index', 500);
  }
};

module.exports = {
  getLocationIndex,
  getLocationIndexFromAddress,
};
