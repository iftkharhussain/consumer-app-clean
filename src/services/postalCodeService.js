/**
 * Postal Code Service
 * Handles postal code lookups and location index retrieval
 */
const PostalCode = require('../schema/PostalCode');
const logger = require('../utils/logger');

class PostalCodeService {
  /**
   * Extract and normalize postal code from full address string or postal code
   * @param {string} input - Full address or postal code (e.g., "123 Main St, Montreal, QC H3C 0S5" or "H3C 0S5")
   * @returns {string|null} - Normalized postal code (e.g., "H3C0S5") or null if not found
   */
  extractPostalCode(input) {
    if (!input || typeof input !== 'string') {
      return null;
    }

    // Canadian postal code pattern: A1A 1A1 or A1A1A1
    const postalCodeRegex = /([A-Z]\d[A-Z]\s?\d[A-Z]\d)/gi;
    const match = input.match(postalCodeRegex);
    
    if (match && match.length > 0) {
      // Remove spaces and convert to uppercase
      return match[0].replace(/\s/g, '').toUpperCase();
    }

    return null;
  }

  /**
   * Get location index (gcpcid) by postal code
   * @param {string} postalCodeInput - Postal code (with or without space)
   * @returns {Promise<Object|null>} - { gcpcid, fsa, city } or null if not found
   */
  async getLocationIndexByPostalCode(postalCodeInput) {
    try {
      const postalCode = this.extractPostalCode(postalCodeInput);
      
      if (!postalCode) {
        logger.warn('Invalid postal code format:', postalCodeInput);
        return null;
      }

      const fsa = postalCode.substring(0, 1).toUpperCase();
      // Check if postal code is in Quebec (G, H, J, K prefixes)
      if (!['G', 'H', 'J', 'K'].includes(fsa)) {
        return { error: 'out_of_coverage', message: 'This postal code is outside our service area. We currently only support Quebec postal codes.' };
      }

      // Try exact match first
      let result = await PostalCode.findOne(
        { postalCode: postalCode },
        { gcpcid: 1, fsa: 1, city: 1, _id: 0 }
      ).lean();

      // If no exact match, try FSA (first 3 characters) summary
      if (!result) {
        const fsa = postalCode.substring(0, 3);
        result = await PostalCode.findOne(
          { fsa: fsa, isSummary: true },
          { gcpcid: 1, fsa: 1, city: 1, _id: 0 }
        ).lean();
        
        if (result) {
          logger.info(`Location index found using FSA summary: ${fsa} -> ${result.gcpcid}`);
        } else {
          console.log('[POSTAL CODE] ❌ No result found for FSA:', fsa);
        }
      } else {
        logger.info(`Location index found: ${postalCode} -> ${result.gcpcid}`);
      }

      return result;
    } catch (error) {
      logger.error('Error fetching location index:', error);
      throw error;
    }
  }

  /**
   * Get location index from full address string
   * @param {string} address - Full address string
   * @returns {Promise<Object|null>} - { gcpcid, fsa, city, postalCode } or null
   */
  async getLocationIndexFromAddress(address) {
    try {
      const postalCode = this.extractPostalCode(address);
      
      if (!postalCode) {
        logger.warn('No postal code found in address:', address);
        return null;
      }

      const result = await this.getLocationIndexByPostalCode(postalCode);
      
      if (result) {
        return {
          ...result,
          postalCode: postalCode,
        };
      }

      return null;
    } catch (error) {
      logger.error('Error getting location index from address:', error);
      throw error;
    }
  }
}

module.exports = new PostalCodeService();
