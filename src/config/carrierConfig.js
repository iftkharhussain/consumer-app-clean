/**
 * Carrier Configuration Service
 * 
 * Controls which insurers/carriers are enabled.
 * 
 * Environment Variables:
 *   FORTUS_DEFAULT_ENVIRONMENT - 'test' or 'production' (default: 'test')
 *   ENABLED_CARRIERS - Comma-separated list of enabled carrier codes (default: 'GC,UNI,PAF,WAWA')
 *   FEATURED_CARRIER - Carrier code for the featured card (default: 'GC')
 * 
 * Usage:
 *   const carrierConfig = require('./carrierConfig');
 *   
 *   // Check if a carrier is enabled
 *   if (carrierConfig.isCarrierEnabled('UNI')) {
 *     // Fetch quote
 *   }
 *   
 *   // Get all enabled carriers
 *   const carriers = carrierConfig.getEnabledCarriers();
 */

/**
 * Carrier definitions with metadata
 */
const CARRIER_DEFINITIONS = {
    // Intact
    GC: {
        name: 'Intact',
        displayName: 'Intact Assurance',
        product: 'Offre 1 an',
        group: 'intact',
        requiresCreditScore: true,
        quoteMethod: 'ratebridge',
        logo: '/images/intact-insurance.svg'
    },
    GC0: {
        name: 'Intact',
        displayName: 'Intact Programme Solution',
        product: 'Programme Solution',
        group: 'intact',
        requiresCreditScore: true,
        quoteMethod: 'ratebridge',
        logo: '/images/intact-insurance.svg'
    },
    GC3: {
        name: 'Intact',
        displayName: 'Intact Avantage',
        product: 'Avantage bonne conduite',
        group: 'intact',
        requiresCreditScore: true,
        quoteMethod: 'ratebridge',
        logo: '/images/intact-insurance.svg'
    },

    // L'Unique
    UNI: {
        name: "L'Unique",
        displayName: "L'Unique Assurance",
        product: 'Standard',
        group: 'lunique',
        requiresCreditScore: true,
        quoteMethod: 'ratebridge',
        logo: '/images/lunique-logo.svg'
    },
    UNIS: {
        name: "L'Unique",
        displayName: "L'Unique Gamme Inclusive",
        product: 'Gamme Inclusive',
        group: 'lunique',
        requiresCreditScore: true,
        quoteMethod: 'ratebridge',
        logo: '/images/lunique-logo.svg'
    },
    UN24: {
        name: "L'Unique",
        displayName: "L'Unique 24 mois",
        product: '24 mois',
        group: 'lunique',
        requiresCreditScore: true,
        quoteMethod: 'ratebridge',
        logo: '/images/lunique-logo.svg'
    },

    // Pafco
    PAF: {
        name: 'Pafco',
        displayName: 'Pafco',
        product: 'Standard',
        group: 'pafco',
        requiresCreditScore: false,
        quoteMethod: 'ratingWebService',
        logo: '/images/pafco-logo.svg'
    },

    // Wawanesa
    WAWA: {
        name: 'Wawanesa',
        displayName: 'Wawanesa',
        product: 'Standard',
        group: 'wawanesa',
        requiresCreditScore: false,
        quoteMethod: 'ratebridge',
        logo: '/images/wawanesa-logo.svg'
    },

    // Echelon
    ECGL: {
        name: 'Echelon',
        displayName: 'Echelon',
        product: 'Standard',
        group: 'echelon',
        requiresCreditScore: true,
        quoteMethod: 'ratingWebService',
        logo: '/images/echelon-logo.svg'
    },

    // Promutuel
    PRM2: {
        name: 'Promutuel',
        displayName: 'Groupe Promutuel',
        product: 'Standard',
        group: 'promutuel',
        requiresCreditScore: true,
        quoteMethod: 'ratingWebService',
        logo: '/images/promutuel-logo.svg'
    }
};

// Default insurers if not specified
const DEFAULT_ENABLED_INSURERS = ['pafco', 'lunique'];
const DEFAULT_FEATURED_INSURER = 'pafco';

/**
 * Get default environment
 * @returns {string} 'test' or 'production'
 */
function getDefaultEnvironment() {
    return process.env.FORTUS_DEFAULT_ENVIRONMENT || 'test';
}

/**
 * Get featured insurer group name
 * @returns {string} Insurer group (e.g., 'pafco', 'lunique')
 */
function getFeaturedCarrier() {
    return (process.env.FEATURED_CARRIER || DEFAULT_FEATURED_INSURER).toLowerCase();
}

/**
 * Get list of enabled insurer groups from env
 * @returns {string[]} Array of insurer group names (e.g., ['pafco', 'lunique'])
 */
function getEnabledInsurerGroups() {
    const enabledList = process.env.ENABLED_CARRIERS;

    if (enabledList) {
        return enabledList.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
    }

    return DEFAULT_ENABLED_INSURERS;
}

/**
 * Get list of enabled carrier codes based on enabled insurer groups
 * @returns {string[]} Array of carrier codes
 */
function getEnabledCarrierCodes() {
    const enabledInsurerGroups = getEnabledInsurerGroups();
    const enabledCodes = [];

    // Map insurer groups to carrier codes
    Object.entries(CARRIER_DEFINITIONS).forEach(([code, def]) => {
        if (enabledInsurerGroups.includes(def.group)) {
            enabledCodes.push(code);
        }
    });

    return enabledCodes;
}

/**
 * Check if a specific carrier code is enabled
 * @param {string} code - Carrier code (e.g., 'GC', 'UNI')
 * @returns {boolean}
 */
function isCarrierEnabled(code) {
    const upperCode = code.toUpperCase();
    const enabledCodes = getEnabledCarrierCodes();
    return enabledCodes.includes(upperCode);
}

/**
 * Check if an insurer group is enabled
 * @param {string} group - Insurer group name (e.g., 'pafco', 'lunique')
 * @returns {boolean}
 */
function isInsurerEnabled(group) {
    const lowerGroup = group.toLowerCase();
    const enabledInsurerGroups = getEnabledInsurerGroups();
    return enabledInsurerGroups.includes(lowerGroup);
}

/**
 * Get carrier info with enabled status
 * @param {string} code - Carrier code
 * @returns {object|null} Carrier info or null if not found
 */
function getCarrierInfo(code) {
    const upperCode = code.toUpperCase();
    const definition = CARRIER_DEFINITIONS[upperCode];

    if (!definition) return null;

    return {
        code: upperCode,
        ...definition,
        enabled: isCarrierEnabled(upperCode),
        environment: getDefaultEnvironment()
    };
}

/**
 * Get all enabled carriers
 * @returns {object[]} Array of enabled carrier info objects
 */
function getEnabledCarriers() {
    const enabledCodes = getEnabledCarrierCodes();

    return enabledCodes
        .map(code => getCarrierInfo(code))
        .filter(Boolean);
}

/**
 * Get all carriers with their status (for frontend display)
 * @returns {object[]} Array of all carrier info objects with enabled/disabled status
 */
function getAllCarriersWithStatus() {
    return Object.keys(CARRIER_DEFINITIONS).map(code => getCarrierInfo(code));
}

/**
 * Filter requested carriers to only enabled ones
 * Returns disabled carriers marked as unavailable
 * @param {string[]} requestedCodes - Carrier codes requested
 * @returns {object} { enabled: [], disabled: [] }
 */
function filterCarriers(requestedCodes) {
    const result = {
        enabled: [],
        disabled: []
    };

    requestedCodes.forEach(code => {
        const info = getCarrierInfo(code.toUpperCase());
        if (info) {
            if (info.enabled) {
                result.enabled.push(info);
            } else {
                result.disabled.push({
                    ...info,
                    unavailableReason: 'Carrier is currently disabled'
                });
            }
        } else {
            result.disabled.push({
                code: code.toUpperCase(),
                name: code,
                displayName: code,
                enabled: false,
                unavailableReason: 'Unknown carrier'
            });
        }
    });

    return result;
}

/**
 * Get configuration summary (for debugging/admin)
 * @returns {object} Configuration summary
 */
function getConfigSummary() {
    return {
        defaultEnvironment: getDefaultEnvironment(),
        featuredInsurer: getFeaturedCarrier(),
        enabledInsurerGroups: getEnabledInsurerGroups(),
        enabledCarrierCodes: getEnabledCarrierCodes(),
        enabledCarriers: getEnabledCarriers()
    };
}

/**
 * Get ALL carrier codes defined in CARRIER_DEFINITIONS
 * Used for validation (checking if a carrier code is valid)
 * @returns {string[]} Array of all valid carrier codes
 */
function getAllCarrierCodes() {
    return Object.keys(CARRIER_DEFINITIONS);
}

/**
 * Get all unique insurer groups
 * @returns {string[]} Array of insurer group names
 */
function getAllInsurerGroups() {
    const groups = new Set();
    Object.values(CARRIER_DEFINITIONS).forEach(def => groups.add(def.group));
    return Array.from(groups);
}

module.exports = {
    // Constants
    CARRIER_DEFINITIONS,

    // Configuration getters
    getDefaultEnvironment,
    getFeaturedCarrier,

    // Insurer-level operations
    getEnabledInsurerGroups,
    isInsurerEnabled,
    getAllInsurerGroups,

    // Carrier-level checks
    isCarrierEnabled,
    getCarrierInfo,

    // Bulk operations
    getEnabledCarriers,
    getEnabledCarrierCodes,
    getAllCarrierCodes,
    getAllCarriersWithStatus,
    filterCarriers,

    // Admin/debug
    getConfigSummary
};

