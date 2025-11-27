/**
 * Lead Service - Handles lead creation and management
 */

const Lead = require('../schema/Lead');
const logger = require('../utils/logger');

/**
 * Create a new lead
 * @param {object} leadData - Lead data
 * @returns {Promise<object>} - Created lead
 */
const createLead = async (leadData) => {
  try {
    logger.info('Creating new lead');

    // Create new lead
    const lead = new Lead(leadData);
    await lead.save();

    logger.info('Lead created successfully', { leadId: lead._id });

    return lead;
  } catch (error) {
    logger.error('Failed to create lead', {
      error: error.message,
    });
    throw error;
  }
};


/**
 * Get lead by ID
 * @param {string} leadId - Lead ID
 * @returns {Promise<object>} - Lead document
 */
const getLeadById = async (leadId) => {
  const lead = await Lead.findById(leadId);
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
  createLead,
  getLeadById,
  updateLeadStatus,
};
