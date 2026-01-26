/**
 * Fortus Leads Service for Consumer App
 * 
 * Handles communication with LMS for Fortus Leads integration.
 * Consumer triggers lead push when clicking "Demander un appel" button.
 * 
 * Flow:
 * 1. Consumer clicks "Demander un appel" in Consumer App
 * 2. Consumer App calls this service
 * 3. This service calls LMS /api/crossapp/fortus/request-call
 * 4. LMS validates lead, checks quote, sends to Fortus if valid
 * 5. Returns result to Consumer App
 */

const { lmsGet, lmsPost } = require('./lmsApiService');
const logger = require('../utils/logger');

/**
 * Request a call - sends lead to Fortus Leads platform
 * 
 * Called when consumer clicks "Demander un appel" button.
 * LMS will validate:
 * - Lead exists and has advisor assigned
 * - Quote is available for the lead
 * - Fortus integration is active for the advisor
 * 
 * @param {string} leadId - The lead ID from all_leads collection
 * @returns {Promise<Object>} { success, message, data }
 */
const requestCall = async (leadId) => {
  try {
    if (!leadId) {
      throw new Error('leadId is required');
    }

    logger.info('FortusService.requestCall', { leadId });

    const result = await lmsPost('/fortus/request-call', {
      appLeadId: leadId
    }, {
      leadId
    });

    logger.info('FortusService.requestCall success', { 
      leadId, 
      fortusLeadId: result.data?.fortusLeadId 
    });

    return {
      success: true,
      message: result.message || 'Call request sent successfully',
      data: result.data || {}
    };

  } catch (error) {
    logger.error('FortusService.requestCall error', {
      leadId,
      message: error.message,
      response: error.response?.data
    });

    // Extract error details from LMS response
    const errorData = error.response?.data || {};
    
    return {
      success: false,
      message: errorData.message || error.message || 'Failed to request call',
      error: errorData.error || 'REQUEST_FAILED',
      details: errorData.details || null
    };
  }
};

/**
 * Get office hours for an advisor
 * 
 * Used to display office hours info to consumer.
 * This is for DISPLAY purposes only - not for blocking requests.
 * 
 * @param {string} advisorId - The advisor ID
 * @returns {Promise<Object>} { success, officeHours, isCurrentlyOpen, timezone }
 */
const getOfficeHours = async (advisorId) => {
  try {
    if (!advisorId) {
      throw new Error('advisorId is required');
    }

    logger.info('FortusService.getOfficeHours', { advisorId });

    const result = await lmsGet(`/fortus/office-hours/${advisorId}`, {
      advisorId
    });

    return {
      success: true,
      officeHours: result.data?.officeHours || null,
      isCurrentlyOpen: result.data?.isCurrentlyOpen || false,
      timezone: result.data?.timezone || 'America/Toronto',
      message: result.message
    };

  } catch (error) {
    logger.error('FortusService.getOfficeHours error', {
      advisorId,
      message: error.message,
      response: error.response?.data
    });

    return {
      success: false,
      officeHours: null,
      isCurrentlyOpen: false,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Get office hours for a lead's assigned advisor
 * 
 * Convenience method - automatically looks up the advisor from the lead.
 * 
 * @param {string} leadId - The lead ID
 * @returns {Promise<Object>} { success, officeHours, isCurrentlyOpen, timezone }
 */
const getOfficeHoursByLead = async (leadId) => {
  try {
    if (!leadId) {
      throw new Error('leadId is required');
    }

    logger.info('FortusService.getOfficeHoursByLead', { leadId });

    const result = await lmsGet(`/fortus/office-hours-by-lead/${leadId}`, {
      appLeadId: leadId
    });

    return {
      success: true,
      officeHours: result.data?.officeHours || null,
      isCurrentlyOpen: result.data?.isCurrentlyOpen || false,
      timezone: result.data?.timezone || 'America/Toronto',
      advisorId: result.data?.advisorId,
      message: result.message
    };

  } catch (error) {
    logger.error('FortusService.getOfficeHoursByLead error', {
      leadId,
      message: error.message,
      response: error.response?.data
    });

    return {
      success: false,
      officeHours: null,
      isCurrentlyOpen: false,
      error: error.response?.data?.message || error.message
    };
  }
};

module.exports = {
  requestCall,
  getOfficeHours,
  getOfficeHoursByLead
};
