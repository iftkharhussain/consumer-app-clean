const AnalyticsSession = require('../schema/AnalyticsSession');
const logger = require('../utils/logger');

// User-Agent parser (compatible with both v1 and v2 export shapes)
const UAParserPkg = require('ua-parser-js');
const UAParser = UAParserPkg.UAParser || UAParserPkg;

/**
 * Extract the client's real IP address.
 * Prefer the X-Forwarded-For header (first hop, when behind a proxy/CDN),
 * and fall back to the raw socket address.
 */
function extractClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    return fwd.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || '';
}

/**
 * Bucket a parsed User-Agent device type into desktop / mobile / tablet.
 * ua-parser-js leaves `device.type` undefined for desktops.
 */
function bucketDeviceType(uaDeviceType) {
  if (uaDeviceType === 'mobile') return 'mobile';
  if (uaDeviceType === 'tablet') return 'tablet';
  if (!uaDeviceType) return 'desktop';
  return 'unknown';
}

/**
 * Funnel step configuration for the analytics tracing layer.
 * Maps request paths -> { product, step }. Steps 1-2 are product-specific
 * (Webflow landing/questionnaire); steps 3-4 (/result, /confirmation-*) are
 * SHARED across every product, so the product for those is inherited from the
 * session's already-stored insurance_type, not derived from the path.
 */
const FUNNEL_STEPS = {
  // Car insurance — 4 steps (only product with confirmation/booking)
  // Steps 1-2 on Webflow (norga.io); steps 3-4 on the consumer React app (app.norga.io).
  auto: [
    { step: 1, name: 'landing',       match: '/assurance/auto',                                 type: 'exact' },
    { step: 2, name: 'questionnaire', match: '/assurance/questionnaire-auto',                   type: 'exact' },
    // Step 3 accepts BOTH '/result' and '/' because the React app renders the Results
    // component on both paths (post-login default is '/'). NOTE: this means any user
    // landing on '/' regardless of product will register an auto step-3, which can
    // pollute the funnel — accepted trade-off for simplicity.
    { step: 3, name: 'result',        match: ['/', '/result'],                                  type: 'exact' },
    { step: 4, name: 'confirmation',  match: ['/confirmation-call', '/confirmation-meeting'],   type: 'prefix' }
  ],
  // All other products — 3 steps (no confirmation/step 4).
  // Steps 1-2 on Webflow; step 3 (quote estimation) on the consumer React app.
  life: [
    { step: 1, name: 'landing',       match: '/vie/assurance',                                  type: 'exact' },
    { step: 2, name: 'questionnaire', match: '/vie/questionnaire',                              type: 'exact' },
    { step: 3, name: 'result',        match: '/life-insurance',                                 type: 'exact' }
  ],
  disability: [
    { step: 1, name: 'landing',       match: '/invalidite/assurance',                           type: 'exact' },
    { step: 2, name: 'questionnaire', match: '/invalidite/questionnaire',                       type: 'exact' },
    { step: 3, name: 'result',        match: '/disability',                                     type: 'exact' }
  ],
  mortgage_insurance: [
    { step: 1, name: 'landing',       match: '/hypothecaire/assurance',                         type: 'exact' },
    { step: 2, name: 'questionnaire', match: '/hypothecaire/questionnaire',                     type: 'exact' },
    { step: 3, name: 'result',        match: '/mortgage-insurance',                             type: 'exact' }
  ],
  critical_illness: [
    { step: 1, name: 'landing',       match: '/maladies-graves/assurance',                      type: 'exact' },
    { step: 2, name: 'questionnaire', match: '/maladies-graves/questionnaire',                  type: 'exact' },
    { step: 3, name: 'result',        match: '/critical-illness',                               type: 'exact' }
  ],
  // Mortgage broker — 2 possible landings, 3 possible questionnaires, 1 React step 3.
  // Landing /pret-hypothecaire/questionnaire is a prefix of the question pages, but
  // we use EXACT matching for both, so /pret-hypothecaire/questionnaire (no suffix)
  // resolves to landing while /pret-hypothecaire/questionnaire/acheter etc. resolve
  // to questionnaire — no collision.
  mortgage_loan: [
    { step: 1, name: 'landing',       match: ['/pret-hypothecaire/questionnaire', '/pret-hypothecaire/pret'], type: 'exact' },
    { step: 2, name: 'questionnaire', match: ['/pret-hypothecaire/questionnaire/acheter', '/pret-hypothecaire/questionnaire/renouveler', '/pret-hypothecaire/questionnaire/refinancer'], type: 'exact' },
    { step: 3, name: 'result',        match: '/mortgage',                                       type: 'exact' }
  ]
};

/** Does a path match a step definition (exact or prefix; single string or array)? */
function pathMatchesStep(path, stepDef) {
  const matchers = Array.isArray(stepDef.match) ? stepDef.match : [stepDef.match];
  if (stepDef.type === 'prefix') {
    return matchers.some((m) => path.startsWith(m));
  }
  return matchers.includes(path);
}

/**
 * Resolve a path to { insurance_type, step, name }.
 *  - product-specific path (steps 1-2) -> insurance_type identified.
 *  - shared path (steps 3-4) matches every product -> insurance_type = null
 *    (caller inherits the product from the stored session value).
 *  - no funnel match -> null.
 */
function resolveFunnelStep(path) {
  if (!path) return null;
  const matches = [];
  for (const [product, steps] of Object.entries(FUNNEL_STEPS)) {
    for (const stepDef of steps) {
      if (pathMatchesStep(path, stepDef)) {
        matches.push({ insurance_type: product, step: stepDef.step, name: stepDef.name });
      }
    }
  }
  if (matches.length === 0) return null;
  const products = [...new Set(matches.map((m) => m.insurance_type))];
  const { step, name } = matches[0];
  return {
    insurance_type: products.length === 1 ? products[0] : null, // null => shared path
    step,
    name
  };
}

/**
 * Track an analytics event
 * POST /api/analytics/track
 * Body: {
 *   sessionId: string,
 *   eventName: 'page_view' | 'form_start' | 'step_completed' | 'lead_conversion' | 'custom_click',
 *   url: string,
 *   path: string,
 *   referrer: string,
 *   utm: { source, medium, campaign, term, content },
 *   metadata: { leadId, userId, ... }
 * }
 */
async function trackEvent(req, res) {
  try {
    const {
      sessionId, eventName, url, path, utm, referrer, metadata,
      visitor_id_analytics, session_id_analytics, lead_id_analytics
    } = req.body;

    if (!eventName) {
      return res.status(400).json({
        success: false,
        message: 'eventName is required'
      });
    }

    // ---- Independent analytics tracing layer (decoupled from norga_sid) ----
    // When the new analytics identifiers are present, route to the dedicated upsert
    // handler and leave the legacy norga_sid flow below completely untouched.
    if (visitor_id_analytics && session_id_analytics) {
      return await trackAnalyticsTrace(req, res, {
        visitor_id_analytics, session_id_analytics, lead_id_analytics, eventName, url, path, utm, referrer, metadata
      });
    }

    // ---- Legacy norga_sid flow (unchanged) ----
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId and eventName are required'
      });
    }

    // Attempt to locate an existing session or start a new tracking session
    let session = await AnalyticsSession.findOne({ sessionId });

    if (!session) {
      const userAgent = req.headers['user-agent'] || '';
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      
      session = new AnalyticsSession({
        sessionId,
        trafficSource: {
          referrer: referrer || req.headers['referer'] || '',
          landingPage: url || '',
          utmSource: utm?.source || '',
          utmMedium: utm?.medium || '',
          utmCampaign: utm?.campaign || '',
          utmTerm: utm?.term || '',
          utmContent: utm?.content || ''
        },
        device: {
          userAgent,
          ipAddress: ip.split(',')[0].trim() // Extract primary IP if routed through proxy
        },
        events: []
      });
      
      logger.info('New analytics session initialized', { sessionId, path });
    }

    // Link User or Lead IDs if supplied in request or metadata
    if (metadata?.leadId) {
      session.leadId = metadata.leadId;
    }
    if (metadata?.userId) {
      session.userId = metadata.userId;
    }
    if (req.userId) {
      session.userId = req.userId; // If session request happens authenticated
    }

    // Register event
    session.events.push({
      eventName,
      url: url || '',
      path: path || '',
      metadata: metadata || {}
    });

    await session.save();

    return res.status(200).json({
      success: true,
      message: 'Event logged successfully',
      sessionId: session.sessionId
    });

  } catch (error) {
    logger.error('Error logging analytics event', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to record analytics event'
    });
  }
}

/**
 * Fetch funnel analytics report
 * GET /api/analytics/funnel
 */
async function getFunnelReport(req, res) {
  try {
    const insuranceType = req.query.type || 'auto';
    
    // Map of insurance product funnels to their respective Webflow page paths
    const funnelConfig = {
      auto: {
        landing: '/assurance/auto',
        form: '/assurance/questionnaire-auto'
      },
      life: {
        landing: '/assurance/vie',
        form: '/assurance/questionnaire-vie'
      },
      home: {
        landing: '/assurance/habitation',
        form: '/assurance/questionnaire-habitation'
      },
      mortgage: {
        landing: '/assurance/hypotheque',
        form: '/assurance/questionnaire-hypotheque'
      }
    };

    // Retrieve active paths based on selected type (fallback to 'auto')
    const activeFunnel = funnelConfig[insuranceType.toLowerCase()] || funnelConfig.auto;

    // Unique landing counts
    const landingSessions = await AnalyticsSession.distinct('sessionId', {
      'events.path': activeFunnel.landing
    });
    
    // Unique questionnaire page view counts
    const formSessions = await AnalyticsSession.distinct('sessionId', {
      'events.path': activeFunnel.form
    });
    
    // Unique conversions (users who hit /result and went through this funnel's form)
    const conversionSessions = await AnalyticsSession.distinct('sessionId', {
      'events.path': activeFunnel.form, // Ensure they visited this funnel's questionnaire
      'sessionId': { 
        $in: await AnalyticsSession.distinct('sessionId', { 'events.eventName': 'lead_conversion' }) 
      }
    });

    const landingCount = landingSessions.length;
    const formCount = formSessions.length;
    const conversionCount = conversionSessions.length;

    return res.json({
      success: true,
      data: {
        insuranceType: insuranceType.toLowerCase(),
        landingPageViews: landingCount,
        questionnaireViews: formCount,
        conversions: conversionCount,
        rates: {
          landingToFormRate: landingCount > 0 ? ((formCount / landingCount) * 100).toFixed(2) + '%' : '0%',
          formToConversionRate: formCount > 0 ? ((conversionCount / formCount) * 100).toFixed(2) + '%' : '0%',
          overallConversionRate: landingCount > 0 ? ((conversionCount / landingCount) * 100).toFixed(2) + '%' : '0%'
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching funnel stats', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve funnel metrics'
    });
  }
}

/**
 * Independent analytics tracing layer handler.
 *
 * Upserts a single AnalyticsSession document keyed on BOTH visitor_id_analytics
 * and session_id_analytics:
 *   - On insert: stores the first-touch UTM tags, parsed device info, IP and UA.
 *   - On existing: atomically pushes only the new page event into the events array.
 *
 * Fully isolated from the legacy norga_sid (sessionId) flow.
 */
async function trackAnalyticsTrace(req, res, payload) {
  const {
    visitor_id_analytics, session_id_analytics, lead_id_analytics,
    eventName, url, path, utm, referrer, metadata
  } = payload;

  const userAgent = req.headers['user-agent'] || '';
  const ip = extractClientIp(req);

  // Parse the User-Agent into clean device/os/browser buckets
  const ua = new UAParser(userAgent).getResult();
  const device_information = {
    device_type: bucketDeviceType(ua.device && ua.device.type),
    os: [ua.os && ua.os.name, ua.os && ua.os.version].filter(Boolean).join(' '),
    browser: [ua.browser && ua.browser.name, ua.browser && ua.browser.version].filter(Boolean).join(' ')
  };

  const eventEntry = {
    eventName,
    url: url || '',
    path: path || '',
    metadata: metadata || {}
  };

  // Classify this hit into a funnel product/step from its path
  const funnel = resolveFunnelStep(path || '');

  const update = {
    // Create-only fields: first-touch attribution + device snapshot
    $setOnInsert: {
      visitor_id_analytics,
      session_id_analytics,
      trafficSource: {
        referrer: referrer || req.headers['referer'] || '',
        landingPage: url || '',
        utmSource: utm?.source || '',
        utmMedium: utm?.medium || '',
        utmCampaign: utm?.campaign || '',
        utmTerm: utm?.term || '',
        utmContent: utm?.content || ''
      },
      device: { userAgent, ipAddress: ip },
      device_information
    },
    // Always append the page transition
    $push: { events: eventEntry }
  };

  // Record the FURTHEST funnel step reached (monotonic via $max) so the dashboard's
  // step-completion and drop-off math stays correct even if the user navigates back.
  if (funnel) {
    update.$max = { current_funnel_step: funnel.step };
  }

  await AnalyticsSession.findOneAndUpdate(
    { visitor_id_analytics, session_id_analytics },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // First-touch product: set insurance_type once, the first time a product-specific
  // path (steps 1-2) is seen. The $or guard means an already-resolved product is
  // never overwritten, and shared paths (insurance_type null) never clear it.
  if (funnel && funnel.insurance_type) {
    await AnalyticsSession.updateOne(
      {
        visitor_id_analytics,
        session_id_analytics,
        $or: [
          { insurance_type: { $exists: false } },
          { insurance_type: null },
          { insurance_type: '' }
        ]
      },
      { $set: { insurance_type: funnel.insurance_type } }
    );
  }

  // When the visitor has become a lead, atomically attach the LMS lead id to the
  // already-open session document (late update -> $set, not $setOnInsert).
  if (lead_id_analytics) {
    await AnalyticsSession.updateOne(
      { visitor_id_analytics, session_id_analytics },
      { $set: { lead_id_analytics } },
      { upsert: false }
    );
  }

  return res.status(200).json({
    success: true,
    message: 'Analytics event logged',
    visitor_id_analytics,
    session_id_analytics,
    insurance_type: funnel ? funnel.insurance_type : null,
    current_funnel_step: funnel ? funnel.step : null
  });
}

module.exports = {
  trackEvent,
  getFunnelReport
};
