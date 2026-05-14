const QuoteSession = require('../schema/QuoteSession');
const UserProduct = require('../schema/UserProduct');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Create a new quote session
 * 
 * Validates that user doesn't exceed 3 active sessions.
 * Checks if quote data is different from existing sessions.
 * Creates session with vehicle label for display.
 * 
 * POST /api/quote-sessions
 * Body: {
 *   leadId: string,
 *   appLeadId: string,
 *   quoteData: { vehicles, drivers, coverage, fullFormData }
 * }
 */
async function createQuoteSession(req, res) {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }
    
    const { leadId, appLeadId, quoteData } = req.body;
    
    if (!leadId || !quoteData) {
      return res.status(400).json({
        success: false,
        message: 'leadId et quoteData sont requis'
      });
    }
    
    // Check if user already has 3 active sessions
    const canCreate = await QuoteSession.canCreateNewSession(userId);
    
    if (!canCreate) {
      console.log(' [DEBUG] Quote limit exceeded for user:', userId);
      logger.warn('User attempted to create 4th quote session', { userId });
      return res.status(400).json({
        success: false,
        message: 'Vous avez atteint la limite maximale de 3 soumissions. Veuillez contacter le support pour obtenir de l\'aide.',
        code: 'MAX_SESSIONS_REACHED'
      });
    }
    
    // Check if identical quote data already exists
    const existingSessions = await QuoteSession.find({ 
      userId, 
      status: 'active' 
    });
    
    for (const session of existingSessions) {
      if (session.hasSameDataAs(quoteData)) {
        logger.info('Duplicate quote data detected', { 
          userId, 
          existingSessionId: session.sessionId 
        });
        
        return res.status(400).json({
          success: false,
          message: 'Une soumission identique existe déjà.',
          code: 'DUPLICATE_QUOTE_DATA',
          existingSession: {
            sessionId: session.sessionId,
            label: session.getDisplayLabel()
          }
        });
      }
    }
    
    // Generate session ID
    const sessionId = uuidv4();
    
    // Extract vehicle name for label (use first vehicle)
    let vehicleName = 'Assurance Auto';
    if (quoteData.vehicles && quoteData.vehicles.length > 0) {
      const firstVehicle = quoteData.vehicles[0];
      vehicleName = `${firstVehicle.make || ''} ${firstVehicle.model || ''}`.trim();
    }
    
    // Create quote session
    const session = new QuoteSession({
      userId,
      leadId,
      appLeadId,
      sessionId,
      label: {
        vehicleName,
        createdDate: new Date()
      },
      quoteData,
      status: 'active',
      isActive: existingSessions.length === 0, // First session is active by default
      quoteStatus: 'pending'
    });
    
    await session.save();
    
    logger.info('Quote session created', { 
      userId, 
      sessionId, 
      vehicleName,
      sessionCount: existingSessions.length + 1
    });
    
    return res.status(201).json({
      success: true,
      message: 'Session de soumission créée avec succès',
      session: {
        sessionId: session.sessionId,
        label: session.getDisplayLabel(),
        isActive: session.isActive,
        createdAt: session.createdAt
      }
    });
    
  } catch (error) {
    logger.error('Error creating quote session', { 
      error: error.message, 
      stack: error.stack 
    });
    
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la session'
    });
  }
}

/**
 * Get all quote sessions for current user
 * 
 * GET /api/quote-sessions
 * Query: ?status=active (optional)
 */
async function getQuoteSessions(req, res) {
  try {
    const userId = req.userId;
    
    if (!userId) {
      logger.error('[getQuoteSessions] No userId in request');
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }
    
    const { status } = req.query;
    
    const query = { userId };
    if (status) {
      query.status = status;
    }
    
    logger.info('[getQuoteSessions] Query params', { userId, status, query });
    
    const sessions = await QuoteSession.find(query)
      .sort({ createdAt: -1 })
      .lean();
    
    logger.info('[getQuoteSessions] Found sessions', { count: sessions.length, sessions });
    
    // Format sessions for frontend
    const formattedSessions = sessions.map(session => ({
      sessionId: session.sessionId,
      label: {
        primary: formatDateWithTime(session.label?.createdDate || session.createdAt),
        secondary: session.label?.vehicleName || 'Assurance Auto'
      },
      isActive: session.isActive,
      status: session.status,
      quoteStatus: session.quoteStatus,
      leadId: session.leadId,
      appLeadId: session.appLeadId,
      userProductIds: session.userProductIds || [],
      createdAt: session.createdAt
    }));
    
    logger.info('[getQuoteSessions] Formatted sessions', { 
      count: formattedSessions.length, 
      formattedSessions: formattedSessions.map(s => ({
        sessionId: s.sessionId,
        labelPrimary: s.label.primary,
        labelSecondary: s.label.secondary,
        isActive: s.isActive
      }))
    });
    
    return res.json({
      success: true,
      sessions: formattedSessions,
      count: formattedSessions.length
    });
    
  } catch (error) {
    logger.error('Error fetching quote sessions', { 
      error: error.message 
    });
    
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des sessions'
    });
  }
}

/**
 * Switch to a different quote session (make it active)
 * 
 * PUT /api/quote-sessions/:sessionId/activate
 */
async function activateQuoteSession(req, res) {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }
    
    const { sessionId } = req.params;
    
    // Verify session belongs to user
    const session = await QuoteSession.findOne({ 
      sessionId, 
      userId,
      status: 'active'
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session non trouvée'
      });
    }
    
    // Set as active session
    const updatedSession = await QuoteSession.setActiveSession(userId, sessionId);
    
    logger.info('Quote session activated', { 
      userId, 
      sessionId 
    });
    
    return res.json({
      success: true,
      message: 'Session activée avec succès',
      session: {
        sessionId: updatedSession.sessionId,
        label: updatedSession.getDisplayLabel(),
        isActive: updatedSession.isActive
      }
    });
    
  } catch (error) {
    logger.error('Error activating quote session', { 
      error: error.message 
    });
    
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'activation de la session'
    });
  }
}

/**
 * Get active quote session for current user
 * 
 * GET /api/quote-sessions/active
 */
async function getActiveQuoteSession(req, res) {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }
    
    const session = await QuoteSession.getActiveSession(userId);
    
    if (!session) {
      return res.json({
        success: true,
        session: null,
        message: 'Aucune session active'
      });
    }
    
    return res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        label: session.getDisplayLabel(),
        isActive: session.isActive,
        leadId: session.leadId,
        appLeadId: session.appLeadId,
        userProductIds: session.userProductIds || [],
        quoteData: session.quoteData,
        quoteStatus: session.quoteStatus,
        createdAt: session.createdAt
      }
    });
    
  } catch (error) {
    logger.error('Error fetching active quote session', { 
      error: error.message 
    });
    
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la session active'
    });
  }
}

/**
 * Update quote session status
 * 
 * PUT /api/quote-sessions/:sessionId/status
 * Body: { status: 'active'|'expired'|'completed'|'cancelled' }
 */
async function updateQuoteSessionStatus(req, res) {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }
    
    const { sessionId } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['active', 'expired', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide'
      });
    }
    
    const session = await QuoteSession.findOneAndUpdate(
      { sessionId, userId },
      { 
        status,
        ...(status === 'completed' && { completedAt: new Date() })
      },
      { new: true }
    );
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session non trouvée'
      });
    }
    
    logger.info('Quote session status updated', { 
      userId, 
      sessionId, 
      status 
    });
    
    return res.json({
      success: true,
      message: 'Statut de la session mis à jour',
      session: {
        sessionId: session.sessionId,
        status: session.status
      }
    });
    
  } catch (error) {
    logger.error('Error updating quote session status', { 
      error: error.message 
    });
    
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour de la session'
    });
  }
}

/**
 * Link user products to a quote session
 * 
 * POST /api/quote-sessions/:sessionId/products
 * Body: { userProductIds: [id1, id2, ...] }
 */
async function linkUserProductsToSession(req, res) {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }
    
    const { sessionId } = req.params;
    const { userProductIds } = req.body;
    
    if (!Array.isArray(userProductIds)) {
      return res.status(400).json({
        success: false,
        message: 'userProductIds doit être un tableau'
      });
    }
    
    const session = await QuoteSession.findOne({ sessionId, userId });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session non trouvée'
      });
    }
    
    // Add new product IDs (avoid duplicates)
    const existingIds = session.userProductIds.map(id => id.toString());
    const newIds = userProductIds.filter(id => !existingIds.includes(id.toString()));
    
    session.userProductIds.push(...newIds);
    await session.save();
    
    logger.info('User products linked to session', { 
      userId, 
      sessionId, 
      productCount: newIds.length 
    });
    
    return res.json({
      success: true,
      message: 'Produits liés à la session',
      userProductIds: session.userProductIds
    });
    
  } catch (error) {
    logger.error('Error linking products to session', { 
      error: error.message 
    });
    
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la liaison des produits'
    });
  }
}

// Helper function to format date in French
function formatDate(date) {
  if (!date) return '';
  
  const d = new Date(date);
  const options = { month: 'short', day: 'numeric' };
  
  // French locale (e.g., "4 mai")
  return d.toLocaleDateString('fr-FR', options);
}

function formatDateWithTime(date) {
  if (!date) return '';
  
  const d = new Date(date);
  const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  
  // Format: "1 juin 2026" and "16h30"
  const dateStr = d.toLocaleDateString('fr-FR', dateOptions);
  const timeStr = d.toLocaleTimeString('fr-FR', timeOptions).replace(':', 'h');
  
  return dateStr;
}

module.exports = {
  createQuoteSession,
  getQuoteSessions,
  activateQuoteSession,
  getActiveQuoteSession,
  updateQuoteSessionStatus,
  linkUserProductsToSession
};
