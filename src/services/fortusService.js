/**
 * Fortus Service - Main service for interacting with Fortus API
 * Handles quote requests and response processing
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');
const { buildQuoteSoapEnvelope, buildAutoFortusTransaction } = require('./fortusXmlBuilder');
const { parseFortusResponse, extractCarrierQuotes } = require('./fortusXmlParser');

/**
 * Get auto insurance quote from Fortus API
 * @param {object} quoteData - Quote request data
 * @returns {Promise<object>} - Quote response with carrier quotes
 */
const getAutoQuote = async (quoteData) => {
  try {
    // Generate GUIDs
    const quoteGuid = uuidv4().replace(/-/g, '').toUpperCase();
    const quoteIterationGuid = uuidv4().replace(/-/g, '').toUpperCase();

    logger.info('Requesting Fortus quote', { quoteGuid, quoteIterationGuid });

    // Build Fortus transaction XML
    const fortusXml = buildAutoFortusTransaction(quoteData);
    
    // Build SOAP envelope
    const soapEnvelope = buildQuoteSoapEnvelope(
      quoteGuid,
      quoteIterationGuid,
      fortusXml,
      {
        province: quoteData.province,
        lineOfBusiness: 'AUTO',
      }
    );

    // Make SOAP request
    const response = await makeSoapRequest(soapEnvelope);

    // Parse response
    const parsedResponse = parseFortusResponse(response.data);

    // Extract carrier quotes
    const carrierQuotes = extractCarrierQuotes(parsedResponse.receiverResponse);

    logger.info('Fortus quote received successfully', {
      quoteGuid,
      trackingNumber: parsedResponse.trackingNumber,
      carriersCount: carrierQuotes.length,
    });

    return {
      success: true,
      quoteGuid,
      quoteIterationGuid,
      trackingNumber: parsedResponse.trackingNumber,
      statusCode: parsedResponse.statusCode,
      message: parsedResponse.message,
      carriers: carrierQuotes,
      rawRequest: fortusXml,
      rawResponse: parsedResponse,
    };

  } catch (error) {
    logger.error('Fortus quote request failed', {
      error: error.message,
      stack: error.stack,
    });

    throw {
      success: false,
      message: 'Failed to get quote from Fortus',
      error: error.message,
      details: error.response?.data || null,
    };
  }
};

/**
 * Make SOAP request to Fortus API
 * @param {string} soapEnvelope - SOAP XML envelope
 * @returns {Promise<object>} - Axios response
 */
const makeSoapRequest = async (soapEnvelope) => {
  try {
    const response = await axios({
      method: 'POST',
      url: config.fortus.apiUrl,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.compu-quote.com/RatingWebService/Version1/Quote',
      },
      data: soapEnvelope,
      timeout: 60000, // 60 seconds timeout
    });

    return response;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      logger.error('Fortus API error response', {
        status: error.response.status,
        data: error.response.data,
      });
      throw new Error(`Fortus API error: ${error.response.status}`);
    } else if (error.request) {
      // Request made but no response
      logger.error('No response from Fortus API', { error: error.message });
      throw new Error('No response from Fortus API');
    } else {
      // Error in request setup
      logger.error('Failed to setup Fortus request', { error: error.message });
      throw error;
    }
  }
};

/**
 * Get default coverages for Ontario Auto
 * @returns {array} - Default coverage array
 */
const getDefaultOntarioCoverages = () => {
  return [
    { id: 'TPBI', csioCode: 'TPBI', limit1: 1000000 },
    { id: 'TPPD', csioCode: 'TPPD', limit1: 1000000 },
    { id: 'TPDC', csioCode: 'TPDC', deductible: 0 },
    { id: 'AB', csioCode: 'AB' },
    { id: 'UA', csioCode: 'UA' },
    { id: 'COL', csioCode: 'COL', deductible: 500 },
    { id: 'CMP', csioCode: 'CMP', deductible: 300 },
    { id: '44', csioCode: '44', limit1: 1000000 },
  ];
};

/**
 * Get default carriers for testing
 * @returns {array} - Carrier codes
 */
const getDefaultCarriers = () => {
  // These are demo carriers - replace with actual carrier codes
  return ['DEMA', 'DEMB'];
};

/**
 * Validate quote data before sending to Fortus
 * @param {object} quoteData - Quote data to validate
 * @throws {Error} - Validation error
 */
const validateQuoteData = (quoteData) => {
  if (!quoteData.province) {
    throw new Error('Province is required');
  }

  if (!quoteData.effectiveDate) {
    throw new Error('Effective date is required');
  }

  if (!quoteData.drivers || quoteData.drivers.length === 0) {
    throw new Error('At least one driver is required');
  }

  if (!quoteData.vehicles || quoteData.vehicles.length === 0) {
    throw new Error('At least one vehicle is required');
  }

  // Validate driver data
  quoteData.drivers.forEach((driver, index) => {
    if (!driver.birthdate) {
      throw new Error(`Driver ${index + 1}: Birthdate is required`);
    }
    if (!driver.gender) {
      throw new Error(`Driver ${index + 1}: Gender is required`);
    }
    if (!driver.licenseDate) {
      throw new Error(`Driver ${index + 1}: License date is required`);
    }
  });

  // Validate vehicle data
  quoteData.vehicles.forEach((vehicle, index) => {
    if (!vehicle.year) {
      throw new Error(`Vehicle ${index + 1}: Year is required`);
    }
    if (!vehicle.viccCode) {
      throw new Error(`Vehicle ${index + 1}: VICC code is required`);
    }
  });
};

module.exports = {
  getAutoQuote,
  getDefaultOntarioCoverages,
  getDefaultCarriers,
  validateQuoteData,
};
