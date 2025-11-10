/**
 * Lead Service - Handles lead creation and management
 */

const Lead = require('../models/Lead');
const logger = require('../utils/logger');

/**
 * Create a new lead from Paperform submission
 * @param {object} paperformData - Paperform submission data
 * @returns {Promise<object>} - Created lead
 */
const createLeadFromPaperform = async (paperformData) => {
  try {
    logger.info('Creating lead from Paperform submission', {
      submissionId: paperformData.submission_id,
    });

    // Transform Paperform data to lead format
    const leadData = transformPaperformData(paperformData);

    // Check if lead already exists with this submission ID
    if (paperformData.submission_id) {
      const existingLead = await Lead.findOne({
        paperformSubmissionId: paperformData.submission_id,
      });

      if (existingLead) {
        logger.warn('Lead already exists for this submission', {
          submissionId: paperformData.submission_id,
          leadId: existingLead._id,
        });
        return existingLead;
      }
    }

    // Create new lead
    const lead = new Lead(leadData);
    await lead.save();

    logger.info('Lead created successfully', { leadId: lead._id });

    return lead;
  } catch (error) {
    logger.error('Failed to create lead', {
      error: error.message,
      paperformData,
    });
    throw error;
  }
};

/**
 * Transform Paperform submission data to lead format
 * @param {object} paperformData - Raw Paperform data
 * @returns {object} - Lead data
 */
const transformPaperformData = (paperformData) => {
  // Extract data from Paperform submission
  // This mapping depends on your Paperform field structure
  const data = paperformData.data || {};
  
  const leadData = {
    // Personal Information
    firstName: data.first_name || data.firstName || '',
    lastName: data.last_name || data.lastName || '',
    email: data.email || '',
    phone: data.phone || data.phone_number || '',
    
    // Address Information
    address: {
      street: data.address || data.street || '',
      city: data.city || '',
      province: data.province || data.state || 'ON',
      postalCode: data.postal_code || data.postalCode || data.zip_code || '',
    },
    
    // Driver Information
    dateOfBirth: data.date_of_birth || data.dob || data.birthdate,
    gender: data.gender || 'M',
    maritalStatus: data.marital_status || data.maritalStatus || 'S',
    licenseDate: data.license_date || data.licenseDate,
    licenseClass: data.license_class || data.licenseClass || 'G',
    
    // Vehicle Information
    vehicles: extractVehicles(data),
    
    // Insurance Information
    currentInsuranceCarrier: data.current_insurer || data.currentInsuranceCarrier || '',
    dateContinuousInsurance: data.insurance_start_date || data.dateContinuousInsurance,
    
    // Claims and Convictions
    claims: extractClaims(data),
    convictions: extractConvictions(data),
    
    // Coverage Preferences
    coveragePreferences: data.coverage_preferences || {},
    
    // Paperform metadata
    paperformSubmissionId: paperformData.submission_id,
    paperformData: paperformData,
    
    // Status
    status: 'new',
    source: 'paperform',
  };

  return leadData;
};

/**
 * Extract vehicle information from Paperform data
 * @param {object} data - Paperform data
 * @returns {array} - Array of vehicles
 */
const extractVehicles = (data) => {
  const vehicles = [];

  // Check if vehicle data exists
  // This depends on your Paperform structure
  if (data.vehicle_year && data.vehicle_make) {
    vehicles.push({
      year: parseInt(data.vehicle_year) || new Date().getFullYear(),
      make: data.vehicle_make || '',
      model: data.vehicle_model || '',
      vin: data.vehicle_vin || data.vin || '',
      viccCode: data.vicc_code || data.viccCode || '',
      vehicleType: data.vehicle_type || 'Private Passenger',
      vehicleUse: data.vehicle_use || 'Pleasure',
      distanceYearly: parseInt(data.distance_yearly) || 20000,
    });
  }

  // Handle multiple vehicles if structure supports it
  if (data.vehicles && Array.isArray(data.vehicles)) {
    data.vehicles.forEach(vehicle => {
      vehicles.push({
        year: parseInt(vehicle.year) || new Date().getFullYear(),
        make: vehicle.make || '',
        model: vehicle.model || '',
        vin: vehicle.vin || '',
        viccCode: vehicle.viccCode || '',
        vehicleType: vehicle.vehicleType || 'Private Passenger',
        vehicleUse: vehicle.vehicleUse || 'Pleasure',
        distanceYearly: parseInt(vehicle.distanceYearly) || 20000,
      });
    });
  }

  return vehicles;
};

/**
 * Extract claims from Paperform data
 * @param {object} data - Paperform data
 * @returns {array} - Array of claims
 */
const extractClaims = (data) => {
  const claims = [];

  if (data.has_claims === true || data.has_claims === 'yes') {
    // Parse claims data
    if (data.claims && Array.isArray(data.claims)) {
      data.claims.forEach(claim => {
        claims.push({
          date: claim.date,
          type: claim.type,
          amount: claim.amount,
          description: claim.description,
        });
      });
    }
  }

  return claims;
};

/**
 * Extract convictions from Paperform data
 * @param {object} data - Paperform data
 * @returns {array} - Array of convictions
 */
const extractConvictions = (data) => {
  const convictions = [];

  if (data.has_convictions === true || data.has_convictions === 'yes') {
    // Parse convictions data
    if (data.convictions && Array.isArray(data.convictions)) {
      data.convictions.forEach(conviction => {
        convictions.push({
          date: conviction.date,
          type: conviction.type,
          description: conviction.description,
        });
      });
    }
  }

  return convictions;
};

/**
 * Get lead by ID
 * @param {string} leadId - Lead ID
 * @returns {Promise<object>} - Lead document
 */
const getLeadById = async (leadId) => {
  const lead = await Lead.findById(leadId).populate('quotes');
  if (!lead) {
    throw new Error('Lead not found');
  }
  return lead;
};

/**
 * Update lead status
 * @param {string} leadId - Lead ID
 * @param {string} status - New status
 * @returns {Promise<object>} - Updated lead
 */
const updateLeadStatus = async (leadId, status) => {
  const lead = await Lead.findByIdAndUpdate(
    leadId,
    { status },
    { new: true }
  );
  
  if (!lead) {
    throw new Error('Lead not found');
  }
  
  return lead;
};

module.exports = {
  createLeadFromPaperform,
  transformPaperformData,
  getLeadById,
  updateLeadStatus,
};
