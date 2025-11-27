/**
 * Vehicle Service (Database Version)
 * Handles querying vehicle data from MongoDB
 */

const Vehicle = require('../schema/Vehicle');
const VinLookup = require('../schema/VinLookup');
const logger = require('../utils/logger');

class VehicleService {
  constructor() {
    this.isReady = false;
  }

  /**
   * Initialize service (check database connection)
   */
  async initialize() {
    try {
      const vehicleCount = await Vehicle.countDocuments();
      const vinCount = await VinLookup.countDocuments();
      
      if (vehicleCount > 0 && vinCount > 0) {
        this.isReady = true;
        logger.info(`Vehicle service initialized: ${vehicleCount} vehicles, ${vinCount} VIN records`);
      } else {
        logger.warn('Vehicle data not found in database. Run migration script first.');
        this.isReady = false;
      }
    } catch (error) {
      logger.error('Failed to initialize vehicle service:', error);
      this.isReady = false;
    }
    
    return this.isReady;
  }

  /**
   * Get service status
   */
  async getStatus() {
    try {
      const vehicleCount = await Vehicle.countDocuments();
      const vinCount = await VinLookup.countDocuments();
      
      return {
        isLoaded: vehicleCount > 0 && vinCount > 0,
        vehicleDetailsCount: vehicleCount,
        vinDataCount: vinCount,
        source: 'database'
      };
    } catch (error) {
      logger.error('Failed to get status:', error);
      return {
        isLoaded: false,
        vehicleDetailsCount: 0,
        vinDataCount: 0,
        error: error.message
      };
    }
  }

  /**
   * Get all unique years from vehicle data
   * @returns {Promise<Array<number>>} Sorted array of years (descending)
   */
  async getYears() {
    try {
      return await Vehicle.getYears();
    } catch (error) {
      logger.error('Failed to get years:', error);
      throw error;
    }
  }

  /**
   * Get all unique makes, optionally filtered by year
   * @param {number} year - Optional year filter
   * @returns {Promise<Array<Object>>} Array of make objects with value and label
   */
  async getMakes(year = null) {
    try {
      if (!year) {
        // Get all unique makes
        const makes = await Vehicle.aggregate([
          { $group: { 
            _id: '$make', 
            makeFr: { $first: '$makeFr' } 
          }},
          { $sort: { _id: 1 } }
        ]);
        
        return makes.map(m => ({
          value: m._id,
          label: m.makeFr || m._id
        }));
      }
      
      return await Vehicle.getMakesByYear(year);
    } catch (error) {
      logger.error('Failed to get makes:', error);
      throw error;
    }
  }

  /**
   * Get all models for a specific year and make
   * @param {number} year - Model year
   * @param {string} make - Manufacturer name
   * @returns {Promise<Array<Object>>} Array of model objects
   */
  async getModels(year, make) {
    try {
      return await Vehicle.getModelsByYearAndMake(year, make);
    } catch (error) {
      logger.error('Failed to get models:', error);
      throw error;
    }
  }

  /**
   * Look up vehicle by VIN
   * @param {string} vin - VIN number (partial or full)
   * @returns {Promise<Array<Object>>} Array of matching vehicles with details
   */
  async lookupVIN(vin) {
    if (!vin || vin.length < 5) {
      return [];
    }

    try {
      return await VinLookup.lookupByVin(vin, 10);
    } catch (error) {
      logger.error('Failed to lookup VIN:', error);
      throw error;
    }
  }

  /**
   * Get full vehicle details by VICC codes
   * @param {number} year - Model year
   * @param {number} viccCode - VICC code (optional)
   * @param {number} extVicc - Extended VICC
   * @returns {Promise<Object|null>} Vehicle details
   */
  async getVehicleDetails(year, viccCode, extVicc) {
    try {
      const vehicle = await Vehicle.getVehicleDetails(year, extVicc);
      
      if (!vehicle) {
        return null;
      }

      return {
        year: vehicle.modelYear,
        viccCode: vehicle.viccCode,
        extVicc: vehicle.extVicc,
        make: vehicle.make,
        makeFr: vehicle.makeFr,
        model: vehicle.model,
        modelFr: vehicle.modelFr,
        bodyStyle: vehicle.bodyStyle,
        bodyType: vehicle.bodyType,
        fuelType: vehicle.fuelType,
        cylinder: vehicle.cylinder,
        driveType: vehicle.drivetrain,
        vehicleType: vehicle.vehicleType,
      };
    } catch (error) {
      logger.error('Failed to get vehicle details:', error);
      throw error;
    }
  }

  /**
   * Search vehicles by multiple criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Array<Object>>} Array of matching vehicles
   */
  async searchVehicles(criteria) {
    try {
      const query = {};
      
      if (criteria.year) {
        query.modelYear = parseInt(criteria.year);
      }
      
      if (criteria.make) {
        query.make = { $regex: criteria.make, $options: 'i' };
      }
      
      if (criteria.model) {
        query.$or = [
          { model: { $regex: criteria.model, $options: 'i' } },
          { modelFr: { $regex: criteria.model, $options: 'i' } }
        ];
      }
      
      const results = await Vehicle.find(query)
        .limit(50)
        .select('modelYear viccCode extVicc make makeFr model modelFr bodyStyle bodyType')
        .lean();
      
      return results.map(v => ({
        year: v.modelYear,
        viccCode: v.viccCode,
        extVicc: v.extVicc,
        make: v.make,
        makeFr: v.makeFr,
        model: v.model,
        modelFr: v.modelFr,
        bodyStyle: v.bodyStyle,
        bodyType: v.bodyType,
      }));
    } catch (error) {
      logger.error('Failed to search vehicles:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new VehicleService();
