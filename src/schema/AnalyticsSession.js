const mongoose = require('mongoose');

const AnalyticsSessionSchema = new mongoose.Schema({
  // Legacy norga_sid identifier (functional flow). Kept fully isolated from the
  // analytics tracing layer below. Now optional + sparse-unique (index defined further
  // down) so analytics-only documents can exist without a norga_sid. Legacy callers
  // always send a sessionId, so uniqueness is still enforced for them.
  sessionId: {
    type: String
  },
  // ---- Independent analytics tracing layer (decoupled from norga_sid) ----
  visitor_id_analytics: {
    type: String,
    index: true
  },
  session_id_analytics: {
    type: String,
    index: true
  },
  // LMS lead id attached when an analytics visitor becomes a lead (decoupled from
  // the legacy `leadId` ObjectId field, which is left untouched).
  lead_id_analytics: {
    type: String,
    index: true
  },
  // Resolved product + funnel position for the analytics tracing layer
  insurance_type: {
    type: String, // e.g. 'auto', 'home', 'life', 'mortgage'
    index: true
  },
  current_funnel_step: {
    type: Number // 1=landing, 2=questionnaire, 3=result, 4=confirmation
  },
  userId: {
    type: String, // Can store user ID or leadId from LMS if authenticated
    index: true
  },
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    index: true
  },
  // Traffic Source & UTMs
  trafficSource: {
    referrer: String,
    landingPage: String,
    utmSource: String,
    utmMedium: String,
    utmCampaign: String,
    utmTerm: String,
    utmContent: String
  },
  // Device & Browser Details
  device: {
    userAgent: String,
    ipAddress: String
  },
  // Parsed device information for the analytics tracing layer (from ua-parser-js)
  device_information: {
    device_type: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'unknown'
    },
    os: String,
    browser: String
  },
  // Funnel Event Stream
  events: [{
    eventName: {
      type: String,
      enum: ['page_view', 'form_start', 'step_completed', 'lead_conversion', 'custom_click'],
      required: true
    },
    url: String,
    path: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Indexes for analytical queries
AnalyticsSessionSchema.index({ createdAt: 1 });
AnalyticsSessionSchema.index({ 'events.eventName': 1 });
AnalyticsSessionSchema.index({ 'events.path': 1 });

// Legacy norga_sid uniqueness — sparse so analytics-only docs (no sessionId) are allowed
AnalyticsSessionSchema.index({ sessionId: 1 }, { unique: true, sparse: true });

// Analytics tracing layer: upsert lookup keys on BOTH ids
AnalyticsSessionSchema.index({ visitor_id_analytics: 1, session_id_analytics: 1 });

// Dashboard funnel aggregations: per-product step counts + time-ordered listings
AnalyticsSessionSchema.index({ insurance_type: 1, current_funnel_step: 1 });
AnalyticsSessionSchema.index({ insurance_type: 1, createdAt: -1 });

module.exports = mongoose.model('AnalyticsSession', AnalyticsSessionSchema);
