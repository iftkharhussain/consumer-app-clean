const mongoose = require('mongoose');

/**
 * UserProduct Schema
 * 
 * Links consumer app users to their LMS lead products.
 * When a user logs in via lead token, we fetch their lead_products from LMS
 * and create entries here to track their products in the consumer app.
 * 
 * This allows us to:
 * - Know which leadId belongs to which user
 * - Track quote status per product
 * - Later extend with meeting dates, reviews, etc.
 */
const userProductSchema = new mongoose.Schema({
  // Consumer app user reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  // LMS References
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  leadProductId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  
  // Product info (cached from LMS for quick access)
  productSlug: {
    type: String,
    index: true,
  },
  productName: {
    type: String,
  },
  
  // Quote status tracking
  quoteStatus: {
    type: String,
    enum: ['pending', 'fetching', 'success', 'failed', 'not_requested'],
    default: 'not_requested',
    index: true,
  },
  quoteRequestedAt: {
    type: Date,
  },
  quoteCompletedAt: {
    type: Date,
  },
  quoteError: {
    type: String,
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['active', 'inactive', 'completed'],
    default: 'active',
    index: true,
  },
  
  // Future extensions
  meetingDate: {
    type: Date,
  },
  meetingNotes: {
    type: String,
  },
  reviewStatus: {
    type: String,
    enum: ['pending', 'in_review', 'approved', 'rejected'],
  },
  
  // Metadata from LMS lead_products
  lmsMetadata: {
    content: mongoose.Schema.Types.Mixed, // Can be string or object (JSON)
    isVisited: Boolean,
    lmsStatus: String,
    quoteData: mongoose.Schema.Types.Mixed, // Quote data cached from LMS
  },
}, {
  timestamps: true,
  collection: 'user_products',
});

// Compound indexes for efficient querying
userProductSchema.index({ userId: 1, productId: 1 });
userProductSchema.index({ userId: 1, leadId: 1 });
userProductSchema.index({ leadId: 1, productId: 1 }, { unique: true });

/**
 * Find all products for a user
 */
userProductSchema.statics.findByUserId = function(userId) {
  return this.find({ userId, status: 'active' }).sort({ createdAt: -1 });
};

/**
 * Find ALL products matching a user and product slug
 * Returns array - supports multiple products of same type (e.g., 2 car-insurance)
 * 
 * @param {string} userId - User ID
 * @param {string} productSlug - Product slug (e.g., 'car-insurance')
 * @returns {Promise<Array>} Array of matching products
 */
userProductSchema.statics.findAllByUserAndSlug = async function(userId, productSlug) {
  // First try exact slug match
  let products = await this.find({ userId, productSlug, status: 'active' }).sort({ createdAt: -1 });
  
  if (products.length === 0) {
    // If slug is not found, try matching by productName
    // Convert slug to name pattern: 'car-insurance' -> 'car insurance'
    const namePattern = productSlug.replace(/-/g, ' ');
    products = await this.find({
      userId,
      status: 'active',
      productName: { $regex: new RegExp(namePattern, 'i') }
    }).sort({ createdAt: -1 });
  }
  
  return products;
};

/**
 * Find ONE product by user and product slug (returns most recent)
 * For backwards compatibility - use findAllByUserAndSlug for multiple products
 * 
 * @param {string} userId - User ID
 * @param {string} productSlug - Product slug (e.g., 'car-insurance')
 * @param {string} leadId - Optional: specific lead ID to filter by
 * @returns {Promise<Object|null>} Single product or null
 */
userProductSchema.statics.findByUserAndSlug = async function(userId, productSlug, leadId = null) {
  // If leadId provided, find exact match
  if (leadId) {
    const mongoose = require('mongoose');
    const leadObjectId = typeof leadId === 'string' ? new mongoose.Types.ObjectId(leadId) : leadId;
    return this.findOne({ userId, leadId: leadObjectId, productSlug, status: 'active' });
  }
  
  // Otherwise return most recent matching product
  const products = await this.findAllByUserAndSlug(userId, productSlug);
  return products.length > 0 ? products[0] : null;
};

/**
 * Find ONE product by leadId (returns first active)
 * Use findAllByLeadId if lead can have multiple products
 */
userProductSchema.statics.findByLeadId = function(leadId) {
  return this.findOne({ leadId, status: 'active' });
};

/**
 * Find ALL products for a leadId
 * @param {ObjectId|string} leadId - Lead ID
 * @returns {Promise<Array>} Array of products for this lead
 */
userProductSchema.statics.findAllByLeadId = function(leadId) {
  return this.find({ leadId, status: 'active' }).sort({ createdAt: -1 });
};

/**
 * Update quote status
 */
userProductSchema.methods.updateQuoteStatus = async function(status, error = null) {
  this.quoteStatus = status;
  
  if (status === 'fetching') {
    this.quoteRequestedAt = new Date();
  } else if (status === 'success' || status === 'failed') {
    this.quoteCompletedAt = new Date();
  }
  
  if (error) {
    this.quoteError = error;
  }
  
  return this.save();
};

const UserProduct = mongoose.model('UserProduct', userProductSchema);

module.exports = UserProduct;
