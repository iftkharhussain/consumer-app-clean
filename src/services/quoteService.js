/**
 * Quote Service - Handles quote creation and management
 */

const Quote = require('../models/Quote');
const Lead = require('../models/Lead');
const fortusService = require('./fortusService');
const logger = require('../utils/logger');
const { formatDateForFortus } = require('../utils/dateHelpers');

/**
 * Create and process a quote for a lead
 * @param {string} leadId - Lead ID
 * @param {object} quoteOptions - Additional quote options
 * @returns {Promise<object>} - Created quote with results
 */
const createQuoteForLead = async (leadId, quoteOptions = {}) => {
  try {
    // Fetch lead
    const lead = await Lead.findById(leadId);
    if (!lead) {
      throw new Error('Lead not found');
    }

    logger.info('Creating quote for lead', { leadId: lead._id });

    // Transform lead data to Fortus format
    const quoteData = transformLeadToFortusData(lead, quoteOptions);

    // Validate quote data
    fortusService.validateQuoteData(quoteData);

    // Create quote record
    const quote = new Quote({
      quoteGuid: 'pending',
      quoteIterationGuid: 'pending',
      leadId: lead._id,
      status: 'processing',
      province: quoteData.province,
      lineOfBusiness: 'AUTO',
      fortusRequest: quoteData,
    });

    await quote.save();

    try {
      // Get quote from Fortus
      const fortusResult = await fortusService.getAutoQuote(quoteData);

      // Update quote with results
      quote.quoteGuid = fortusResult.quoteGuid;
      quote.quoteIterationGuid = fortusResult.quoteIterationGuid;
      quote.trackingNumber = fortusResult.trackingNumber;
      quote.carriers = fortusResult.carriers;
      quote.fortusResponse = fortusResult.rawResponse;
      quote.status = fortusResult.success ? 'success' : 'error';

      await quote.save();

      // Update lead with quote reference
      lead.quotes.push(quote._id);
      lead.status = 'quoted';
      await lead.save();

      logger.info('Quote created successfully', {
        quoteId: quote._id,
        leadId: lead._id,
        trackingNumber: fortusResult.trackingNumber,
      });

      return {
        success: true,
        quote,
        fortusResult,
      };

    } catch (fortusError) {
      // Update quote with error
      quote.status = 'error';
      quote.error = {
        message: fortusError.message || 'Fortus API error',
        details: fortusError.details || fortusError,
      };
      await quote.save();

      throw fortusError;
    }

  } catch (error) {
    logger.error('Failed to create quote', {
      leadId,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Transform lead data to Fortus quote data format
 * @param {object} lead - Lead document
 * @param {object} options - Additional options
 * @returns {object} - Fortus quote data
 */
const transformLeadToFortusData = (lead, options = {}) => {
  const {
    carriers = fortusService.getDefaultCarriers(),
    effectiveDate = formatDateForFortus(new Date()),
  } = options;

  // Transform drivers
  const drivers = transformDrivers(lead);

  // Transform vehicles
  const vehicles = transformVehicles(lead);

  return {
    province: lead.address?.province || 'ON',
    effectiveDate,
    carriers,
    renewal: 'NO',
    drivers,
    vehicles,
  };
};

/**
 * Transform lead drivers to Fortus format
 * @param {object} lead - Lead document
 * @returns {array} - Fortus driver array
 */
const transformDrivers = (lead) => {
  const drivers = [];

  // Primary driver from lead
  const primaryDriver = {
    id: 'Driver1',
    birthdate: formatDateForFortus(lead.dateOfBirth),
    gender: lead.gender || 'M',
    maritalStatus: lead.maritalStatus || 'S',
    licenseDate: lead.licenseDate ? formatDateForFortus(lead.licenseDate) : formatDateForFortus(new Date()),
    licenseClass: lead.licenseClass || 'G',
    relationshipToApplicant: 'Applicant',
  };

  if (lead.dateContinuousInsurance) {
    primaryDriver.dateContinuousInsurance = formatDateForFortus(lead.dateContinuousInsurance);
  }

  // Transform claims
  if (lead.claims && lead.claims.length > 0) {
    primaryDriver.claims = lead.claims.map((claim, index) => ({
      id: `Claim${index + 1}`,
      date: formatDateForFortus(claim.date),
      type: claim.type || 'At Fault',
      amount: claim.amount,
    }));
  }

  // Transform convictions
  if (lead.convictions && lead.convictions.length > 0) {
    primaryDriver.convictions = lead.convictions.map((conviction, index) => ({
      id: `Conviction${index + 1}`,
      date: formatDateForFortus(conviction.date),
      type: conviction.type || 'Speeding',
    }));
  }

  drivers.push(primaryDriver);

  return drivers;
};

/**
 * Transform lead vehicles to Fortus format
 * @param {object} lead - Lead document
 * @returns {array} - Fortus vehicle array
 */
const transformVehicles = (lead) => {
  const vehicles = [];

  if (!lead.vehicles || lead.vehicles.length === 0) {
    // If no vehicle data, cannot create quote
    throw new Error('No vehicle information available');
  }

  lead.vehicles.forEach((vehicle, index) => {
    const fortusVehicle = {
      id: `Vehicle${index + 1}`,
      year: vehicle.year,
      viccCode: vehicle.viccCode,
      vehicleType: vehicle.vehicleType || 'Private Passenger',
      vehicleUse: vehicle.vehicleUse || 'Pleasure',
      distanceYearly: vehicle.distanceYearly || 20000,
    };

    // Add location if available
    if (lead.address?.postalCode) {
      fortusVehicle.postalCode = lead.address.postalCode.replace(/\s/g, '');
    }
    if (lead.address?.city) {
      fortusVehicle.location = lead.address.city.toUpperCase();
    }

    // Add default coverages
    fortusVehicle.coverages = fortusService.getDefaultOntarioCoverages().map(cov => ({
      ...cov,
      id: `${fortusVehicle.id}-${cov.csioCode}`,
    }));

    vehicles.push(fortusVehicle);
  });

  return vehicles;
};

/**
 * Get quote by ID
 * @param {string} quoteId - Quote ID
 * @returns {Promise<object>} - Quote document
 */
const getQuoteById = async (quoteId) => {
  const quote = await Quote.findById(quoteId).populate('leadId');
  if (!quote) {
    throw new Error('Quote not found');
  }
  return quote;
};

/**
 * Get quotes for a lead
 * @param {string} leadId - Lead ID
 * @returns {Promise<array>} - Array of quotes
 */
const getQuotesByLeadId = async (leadId) => {
  return await Quote.find({ leadId }).sort({ createdAt: -1 });
};

module.exports = {
  createQuoteForLead,
  transformLeadToFortusData,
  getQuoteById,
  getQuotesByLeadId,
};
