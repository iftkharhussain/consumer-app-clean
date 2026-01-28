/**
 * Vehicle Routes
 * API endpoints for vehicle data
 */

const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { optionalAuthMiddleware, authMiddleware } = require('../middlewares/auth');

// Vehicle routes use optional auth (work for both authenticated and guest users)
router.use(optionalAuthMiddleware);

// GET /api/vehicles/user - Get user's vehicles from their products
router.get('/user', authMiddleware, vehicleController.getUserVehicles);

// GET /api/vehicles/status - Get data loading status
router.get('/status', vehicleController.getStatus);

// GET /api/vehicles/years - Get all available years
router.get('/years', vehicleController.getYears);

// GET /api/vehicles/makes - Get all makes (optional year filter)
router.get('/makes', vehicleController.getMakes);

// GET /api/vehicles/models - Get models for year and make
router.get('/models', vehicleController.getModels);

// GET /api/vehicles/vin/:vin - Look up vehicle by VIN
router.get('/vin/:vin', vehicleController.lookupVIN);

// GET /api/vehicles/details - Get vehicle details by VICC codes
router.get('/details', vehicleController.getVehicleDetails);

// GET /api/vehicles/search - Search vehicles by multiple criteria
router.get('/search', vehicleController.searchVehicles);

module.exports = router;
