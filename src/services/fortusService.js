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
 * @param {Object} recalculatedQuote - Optional temporary quote to save when user accepts
 * @param {string} carrierCode - Optional carrier code to filter the correct quote (e.g., 'UNI', 'GC', 'PAFM')
 * @returns {Promise<Object>} { success, message, data }
 */
const requestCall = async (leadId, recalculatedQuote = null, carrierCode = null, position = null, buttonName = null, emailType = null) => {
  try {
    if (!leadId) {
      throw new Error('leadId is required');
    }

    logger.info('FortusService.requestCall', { 
      leadId,
      hasRecalculatedQuote: !!recalculatedQuote,
      carrierCode: carrierCode || 'not specified',
      position: position || 'not specified',
      buttonName: buttonName || 'not specified'
    });

    // Build request body - include recalculatedQuote if provided
    const requestBody = {
      appLeadId: leadId
    };
    
    // If recalculatedQuote is provided, include it so LMS can save it
    if (recalculatedQuote) {
      requestBody.recalculatedQuote = recalculatedQuote;
    }
    
    // If carrierCode is provided, include it so LMS can filter the correct quote
    if (carrierCode) {
      requestBody.carrierCode = carrierCode;
    }

    if (position) {
      requestBody.position = position;
    }

    if (buttonName) {
      requestBody.buttonName = buttonName;
    }

    // lmsPost(endpoint, tokenPayload, body): requestBody is the token payload,
    // the third argument is the HTTP body the LMS reads via req.body.
    // 'meeting' (Calendly booking) vs 'call' — LMS skips the confirmation SMS for meetings
    const result = await lmsPost('/fortus/request-call', requestBody, {
      leadId,
      carrierCode,
      recalculatedQuote,
      position,
      buttonName,
      emailType
    });

    logger.info('FortusService.requestCall success', { 
      leadId, 
      fortusLeadId: result.data?.fortusLeadId,
      quoteSaved: result.data?.quoteSaved || false
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

    // LMS returns officeHours/currentStatus at the top level - there is no `data` wrapper
    return {
      success: true,
      officeHours: result.officeHours || null,
      isCurrentlyOpen: result.currentStatus?.isOpen ?? false,
      timezone: result.officeHours?.timezone || 'America/Toronto',
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

    // LMS returns officeHours/currentStatus at the top level - there is no `data` wrapper
    return {
      success: true,
      officeHours: result.officeHours || null,
      isCurrentlyOpen: result.currentStatus?.isOpen ?? false,
      timezone: result.officeHours?.timezone || 'America/Toronto',
      advisorId: result.advisorId,
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

/**
 * Track a call or meeting event for analytics
 *
 * Called after the ezLead + email are sent, when the consumer either:
 *  - lands on the call confirmation page ('call' — "Appeler maintenant"), or
 *  - completes a Calendly booking ('meeting' — "Planifier un appel plus tard").
 *
 * The LMS creates an integration_record (call.scheduled / meeting.scheduled)
 * that feeds the advisor's "Calls & Meetings" analytics. The LMS dedupes on
 * page reload, so calling this more than once is safe.
 *
 * @param {string} userProductId - consumer_app user_products._id
 * @param {string} eventType - 'call' | 'meeting'
 * @returns {Promise<Object>} { success, message, alreadyExists, data }
 */
const trackEvent = async (userProductId, eventType, additionalData = {}, appLeadId = null) => {
  try {
    if (!userProductId || !eventType) {
      throw new Error('userProductId and eventType are required');
    }

    logger.info('FortusService.trackEvent', { userProductId, eventType, appLeadId });

    const result = await lmsPost('/fortus/track-event', {
      userProductId,
      appLeadId // Include in JWT token for cross-app auth
    }, {
      userProductId,
      eventType,
      additionalData,
      appLeadId // Include in body so LMS can use it directly
    });

    return {
      success: true,
      message: result.message || 'Event tracked successfully',
      alreadyExists: result.alreadyExists || false,
      data: { recordId: result.recordId || null }
    };

  } catch (error) {
    logger.error('FortusService.trackEvent error', {
      userProductId,
      eventType,
      message: error.message,
      response: error.response?.data
    });

    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to track event',
      error: error.response?.data?.error || 'TRACK_EVENT_FAILED'
    };
  }
};

module.exports = {
  requestCall,
  getOfficeHours,
  getOfficeHoursByLead,
  trackEvent
};
