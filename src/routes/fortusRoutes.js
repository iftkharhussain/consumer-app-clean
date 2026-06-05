/**
 * Fortus Leads Routes for Consumer App
 * 
 * Endpoints for Fortus Leads integration:
 * - Request a call (send lead to Fortus)
 * - Get office hours (for display)
 * 
 * All routes require authentication.
 */

const express = require('express');
const router = express.Router();

const fortusController = require('../controllers/fortusController');
const { authMiddleware } = require('../middlewares/auth');

// All Fortus routes require authentication
router.use(authMiddleware);

/**
 * POST /api/fortus/request-call
 * 
 * Send lead to Fortus Leads platform when consumer clicks "Demander un appel".
 * 
 * Body:
 * - userProductId: string (optional) - ID of the user product
 * - productSlug: string (optional) - Slug of the product
 * 
 * One of userProductId or productSlug is required.
 * 
 * Flow:
 * 1. Find user product and associated leadId
 * 2. Call LMS to send lead to Fortus
 * 3. LMS validates quote availability and sends to Fortus
 * 4. Return success/failure to consumer
 * 
 * Response:
 * - success: boolean
 * - message: string
 * - data: { fortusLeadId, status } on success
 */
router.post('/request-call', fortusController.requestCall);

/**
 * POST /api/fortus/test-request-call
 * 
 * 🔍 DEBUG ENDPOINT - Test which insurer will be sent WITHOUT actually sending to ezLeads
 * 
 * This endpoint does everything except calling the actual LMS Fortus API.
 * It shows you exactly what data would be sent.
 * 
 * Body: Same as /request-call
 * - userProductId: string (optional)
 * - productSlug: string (optional)
 * - carrierCode: string (optional) - Which insurer to send
 * 
 * Response:
 * - success: boolean
 * - message: "TEST MODE - No actual request sent"
 * - debug: {
 *     userProduct: { leadId, userId, productSlug },
 *     carrierCode: string,
 *     whatWouldBeSent: { leadId, carrierCode, hasQuote }
 *   }
 */
router.post('/test-request-call', fortusController.testRequestCall);

/**
 * GET /api/fortus/office-hours
 * 
 * Get office hours configuration for the lead's assigned advisor.
 * Used to display office hours info to consumer before they request a call.
 * 
 * Query params:
 * - userProductId: string (optional) - ID of the user product
 * - productSlug: string (optional) - Slug of the product
 * 
 * One of userProductId or productSlug is required.
 * 
 * Response:
 * - success: boolean
 * - data: {
 *     officeHours: { schedule config },
 *     isCurrentlyOpen: boolean,
 *     timezone: string,
 *     configured: boolean
 *   }
 */
router.get('/office-hours', fortusController.getOfficeHours);

/**
 * POST /api/fortus/track-event
 *
 * Track a call or meeting event for advisor analytics ("Calls & Meetings").
 * Called by the consumer app after the ezLead + email are sent:
 *  - 'call'    → call confirmation page ("Appeler maintenant")
 *  - 'meeting' → after a successful Calendly booking ("Planifier un appel plus tard")
 *
 * Body:
 * - userProductId: string (required)
 * - eventType: 'call' | 'meeting' (required)
 *
 * Response:
 * - success: boolean
 * - alreadyExists: boolean (true if deduped on page reload)
 */
router.post('/track-event', fortusController.trackEvent);

module.exports = router;
