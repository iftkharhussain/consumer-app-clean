/**
 * Lead Controller - Handles lead-related requests
 */

const leadService = require('../services/leadService');
const logger = require('../utils/logger');
const { successResponse, errorResponse, notFoundResponse } = require('../utils/response');

/**
 * Get lead by ID
 * @route GET /api/leads/:leadId
 */
const getLead = async (req, res, next) => {
  try {
    const { leadId } = req.params;

    logger.info('Fetching lead', { leadId });

    const lead = await leadService.getLeadById(leadId);

    return successResponse(res, { lead });

  } catch (error) {
    logger.error('Failed to fetch lead', {
      leadId: req.params.leadId,
      error: error.message,
    });

    if (error.message === 'Lead not found') {
      return notFoundResponse(res, 'Lead not found');
    }

    return next(error);
  }
};

/**
 * Update lead status
 * @route PATCH /api/leads/:leadId/status
 */
const updateLeadStatus = async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const { status } = req.body;

    if (!status) {
      return errorResponse(res, 'Status is required', 400);
    }

    logger.info('Updating lead status', { leadId, status });

    const lead = await leadService.updateLeadStatus(leadId, status);

    return successResponse(res, { lead });

  } catch (error) {
    logger.error('Failed to update lead status', {
      leadId: req.params.leadId,
      error: error.message,
    });

    if (error.message === 'Lead not found') {
      return notFoundResponse(res, 'Lead not found');
    }

    return next(error);
  }
};

module.exports = {
  getLead,
  updateLeadStatus,
};
