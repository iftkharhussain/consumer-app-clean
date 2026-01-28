/**
 * Vehicle Controller
 * Handles HTTP requests for vehicle data endpoints
 */

const vehicleService = require('../services/vehicleService');
const UserProduct = require('../schema/UserProduct');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Get vehicles for a user's product
 * Also fetches current coverages from LMS quote data
 * Used to display real vehicle data and pre-populate customize protections page
 * 
 * GET /api/vehicles/user
 * Query: { productSlug: string } or { userProductId: string }
 */
const getUserVehicles = async (req, res) => {
  try {
    const userId = req.userId;
    const { productSlug, userProductId } = req.query;

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

    // Extract vehicles from lmsMetadata.content.cars
    const cars = userProduct.lmsMetadata?.content?.cars || [];
    
    // Transform to frontend format
    const vehicles = cars.map((car, index) => {
      const details = car.vehicleDetails || {};
      const year = car.year || details.year || '';
      const make = car.manufacturer || details.make || '';
      const model = details.modelFr || details.model || '';
      
      return {
        id: index,
        name: `${make} ${model}, ${year}`.trim(),
        year,
        make,
        model,
        details: car
      };
    });

    // Get quote data from lmsMetadata (already synced during login)
    const quoteData = userProduct.lmsMetadata?.quoteData;
    let coverages = null;
    let quoteCarriers = null;
    
    if (quoteData) {
      coverages = quoteData.coverages;
      quoteCarriers = quoteData.carriers;
      
      logger.info('VehicleController.getUserVehicles - using cached quote data', {
        quoteId: quoteData.quoteId,
        hasCoverages: !!coverages,
        carriersCount: quoteCarriers?.length || 0
      });
    } else {
      logger.info('VehicleController.getUserVehicles - no quote data in metadata', {
        userProductId: userProduct._id
      });
    }

    logger.info('VehicleController.getUserVehicles', {
      userId,
      userProductId: userProduct._id,
      vehicleCount: vehicles.length,
      hasCoverages: !!coverages
    });

    return res.json({
      success: true,
      vehicles,
      count: vehicles.length,
      coverages, // null if no quote found
      carriers: quoteCarriers // Include carriers for reference
    });

  } catch (error) {
    logger.error('VehicleController.getUserVehicles error', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicles'
    });
  }
};

/**
 * Get vehicle data loading status
 */
const getStatus = async (req, res) => {
  try {
    const status = await vehicleService.getStatus();
    return successResponse(res, status, 'Vehicle data status retrieved');
  } catch (error) {
    return errorResponse(res, 'Failed to get status', 500);
  }
};

/**
 * Get all available years
 */
const getYears = async (req, res) => {
  try {
    const years = await vehicleService.getYears();
    return successResponse(res, years, 'Years retrieved successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to get years', 500);
  }
};

/**
 * Get all makes (optionally filtered by year)
 */
const getMakes = async (req, res) => {
  try {
    const { year } = req.query;
    const makes = await vehicleService.getMakes(year);
    return successResponse(res, makes, 'Makes retrieved successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to get makes', 500);
  }
};

/**
 * Get all models for a specific year and make
 */
const getModels = async (req, res) => {
  try {
    const { year, make } = req.query;
    
    if (!year || !make) {
      return errorResponse(res, 'Year and make are required', 400);
    }
    
    const models = await vehicleService.getModels(year, make);
    return successResponse(res, models, 'Models retrieved successfully');
  } catch (error) {
    return errorResponse(res, 'Failed to get models', 500);
  }
};

/**
 * Look up vehicle by VIN
 */
const lookupVIN = async (req, res) => {
  try {
    const { vin } = req.params;
    
    if (!vin || vin.length < 5) {
      return errorResponse(res, 'VIN must be at least 5 characters', 400);
    }
    
    const vehicles = await vehicleService.lookupVIN(vin);
    return successResponse(res, vehicles, 'VIN lookup completed');
  } catch (error) {
    return errorResponse(res, 'Failed to lookup VIN', 500);
  }
};

/**
 * Get vehicle details by VICC codes
 */
const getVehicleDetails = async (req, res) => {
  try {
    const { year, viccCode, extVicc } = req.query;
    
    if (!year || (!viccCode && !extVicc)) {
      return errorResponse(res, 'Year and viccCode or extVicc are required', 400);
    }
    
    const details = await vehicleService.getVehicleDetails(year, viccCode, extVicc);
    
    if (!details) {
      return errorResponse(res, 'Vehicle not found', 404);
    }
    
    return successResponse(res, details, 'Vehicle details retrieved');
  } catch (error) {
    return errorResponse(res, 'Failed to get vehicle details', 500);
  }
};

/**
 * Search vehicles by multiple criteria
 */
const searchVehicles = async (req, res) => {
  try {
    const criteria = req.query;
    const vehicles = await vehicleService.searchVehicles(criteria);
    return successResponse(res, vehicles, 'Search completed');
  } catch (error) {
    return errorResponse(res, 'Failed to search vehicles', 500);
  }
};

module.exports = {
  getUserVehicles,
  getStatus,
  getYears,
  getMakes,
  getModels,
  lookupVIN,
  getVehicleDetails,
  searchVehicles,
};
