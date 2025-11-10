/**
 * XML Parser utility for Fortus API responses
 * Parses SOAP response and extracts quote data
 */

const { XMLParser } = require('fast-xml-parser');

// Configure XML parser
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  trimValues: true,
};

const parser = new XMLParser(parserOptions);

/**
 * Parse Fortus SOAP response
 * @param {string} xmlResponse - SOAP XML response
 * @returns {object} - Parsed quote response
 */
const parseFortusResponse = (xmlResponse) => {
  try {
    const parsed = parser.parse(xmlResponse);
    
    // Navigate through SOAP envelope structure
    const envelope = parsed['soap:Envelope'] || parsed['soapenv:Envelope'];
    if (!envelope) {
      throw new Error('Invalid SOAP envelope');
    }

    const body = envelope['soap:Body'] || envelope['soapenv:Body'];
    if (!body) {
      throw new Error('Invalid SOAP body');
    }

    const quoteResponse = body.QuoteResponse;
    if (!quoteResponse) {
      throw new Error('No QuoteResponse in SOAP body');
    }

    const quoteResult = quoteResponse.QuoteResult;
    if (!quoteResult) {
      throw new Error('No QuoteResult in response');
    }

    // Parse the inner QuoteResponse
    const innerResponse = quoteResult.QuoteResponse;
    
    return {
      statusCode: innerResponse.StatusCode,
      trackingNumber: innerResponse.TrackingNumber,
      message: innerResponse.Message,
      receiverResponse: innerResponse.ReceiverResponse,
    };
  } catch (error) {
    throw new Error(`Failed to parse Fortus response: ${error.message}`);
  }
};

/**
 * Extract carrier quotes from Fortus response
 * @param {object} receiverResponse - Receiver response from Fortus
 * @returns {array} - Array of carrier quotes
 */
const extractCarrierQuotes = (receiverResponse) => {
  try {
    const fortusTransaction = receiverResponse.FortusTransaction;
    if (!fortusTransaction) {
      return [];
    }

    const carriers = fortusTransaction.Carriers;
    if (!carriers) {
      return [];
    }

    const carrierQuotes = [];

    // Iterate through carriers (each carrier is a property)
    for (const [carrierCode, carrierData] of Object.entries(carriers)) {
      if (typeof carrierData !== 'object') continue;

      const quote = extractCarrierQuote(carrierCode, carrierData);
      if (quote) {
        carrierQuotes.push(quote);
      }
    }

    return carrierQuotes;
  } catch (error) {
    throw new Error(`Failed to extract carrier quotes: ${error.message}`);
  }
};

/**
 * Extract individual carrier quote
 * @param {string} carrierCode - Carrier code
 * @param {object} carrierData - Carrier data from response
 * @returns {object} - Carrier quote information
 */
const extractCarrierQuote = (carrierCode, carrierData) => {
  try {
    const codeNames = carrierData.CodeNames;
    if (!codeNames || !codeNames.Auto) {
      return null;
    }

    const auto = codeNames.Auto;
    const quoteInfo = auto.QuoteInfo;
    
    if (!quoteInfo) {
      return null;
    }

    // Check for errors
    const hasError = quoteInfo.Error || carrierData.Error;
    
    if (hasError) {
      return {
        name: carrierCode,
        available: false,
        errorMessage: extractErrorMessage(hasError),
        premium: null,
        coverages: [],
      };
    }

    // Extract premium
    const totalPremium = parseFloat(quoteInfo.TotalPremium || 0);

    // Extract vehicle coverages
    const coverages = extractCoverages(quoteInfo.Vehicle);

    return {
      name: carrierCode,
      available: true,
      premium: totalPremium,
      coverages,
      quoteDetails: {
        policyEffDate: quoteInfo.PolicyEffDate,
        rateBookEffDate: quoteInfo.RateBookEffDate,
        productName: quoteInfo.ProductName,
        transaction: quoteInfo.Transaction,
      },
    };
  } catch (error) {
    return {
      name: carrierCode,
      available: false,
      errorMessage: `Failed to parse carrier data: ${error.message}`,
      premium: null,
      coverages: [],
    };
  }
};

/**
 * Extract coverages from vehicle data
 * @param {object|array} vehicleData - Vehicle data (single or array)
 * @returns {array} - Array of coverage information
 */
const extractCoverages = (vehicleData) => {
  if (!vehicleData) return [];

  // Handle single vehicle or array of vehicles
  const vehicles = Array.isArray(vehicleData) ? vehicleData : [vehicleData];
  const allCoverages = [];

  vehicles.forEach(vehicle => {
    if (!vehicle.Coverage) return;

    const coverages = Array.isArray(vehicle.Coverage) 
      ? vehicle.Coverage 
      : [vehicle.Coverage];

    coverages.forEach(coverage => {
      allCoverages.push({
        code: coverage.CSIOCode,
        description: coverage.Description || '',
        limit: formatLimit(coverage.Limit1, coverage.Limit2),
        deductible: parseFloat(coverage.Deductible || 0),
        premium: parseFloat(coverage.Premium || 0),
      });
    });
  });

  return allCoverages;
};

/**
 * Extract error message from error object
 * @param {object} error - Error object
 * @returns {string} - Error message
 */
const extractErrorMessage = (error) => {
  if (typeof error === 'string') return error;
  if (error.Message) return error.Message;
  if (error.Description) return error.Description;
  return 'Unknown error occurred';
};

/**
 * Format coverage limits
 * @param {number} limit1 - Primary limit
 * @param {number} limit2 - Secondary limit
 * @returns {string} - Formatted limit string
 */
const formatLimit = (limit1, limit2) => {
  if (!limit1 && !limit2) return 'N/A';
  if (limit1 && !limit2) return formatCurrency(limit1);
  if (limit1 && limit2) return `${formatCurrency(limit1)}/${formatCurrency(limit2)}`;
  return formatCurrency(limit2);
};

/**
 * Format currency value
 * @param {number} value - Currency value
 * @returns {string} - Formatted currency
 */
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

module.exports = {
  parseFortusResponse,
  extractCarrierQuotes,
  extractCarrierQuote,
  extractCoverages,
  extractErrorMessage,
  formatLimit,
  formatCurrency,
};
