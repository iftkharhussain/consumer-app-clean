/**
 * Vehicle Controller
 * Handles HTTP requests for vehicle data endpoints
 */

const vehicleService = require('../services/vehicleService');
const { successResponse, errorResponse } = require('../utils/response');

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
  getStatus,
  getYears,
  getMakes,
  getModels,
  lookupVIN,
  getVehicleDetails,
  searchVehicles,
};
