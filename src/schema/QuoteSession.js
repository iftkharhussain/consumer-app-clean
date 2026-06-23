const mongoose = require('mongoose');

/**
 * QuoteSession Schema
 * 
 * Manages multiple quote requests per user.
 * Each session represents a separate quote with potentially different data.
 * Allows users to have up to 3 active quote sessions.
 * 
 * When user requests a new quote:
 * - Check if data differs from existing sessions
 * - If different AND count < 3: create new session
 * - If count >= 3: block with error message
 * - Link session to user_products for that specific quote
 */
const quoteSessionSchema = new mongoose.Schema({
  // Consumer app user reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  // LMS lead reference (original lead that triggered this quote)
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
    comment: 'Internal leads._id from LMS'
  },
  
  appLeadId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false,
    index: true,
    comment: 'all_leads._id from LMS - used for quote queries'
  },

  // Product this session belongs to (e.g. 'car-insurance', 'life-insurance').
  // Used to scope sessions per product in the UI (e.g. the car sub-menu only shows car sessions).
  productSlug: {
    type: String,
    index: true,
  },

  // Session identification
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  
  // Display label for UI (e.g., "Honda Civic")
  label: {
    vehicleName: {
      type: String,
      required: false,
    },
    createdDate: {
      type: Date,
      default: Date.now,
    }
  },
  
  // Quote form data snapshot (for comparison)
  quoteData: {
    // Vehicles
    vehicles: [{
      year: Number,
      make: String,
      model: String,
      vin: String,
      usage: String,
      // ... other vehicle fields
    }],
    
    // Drivers
    drivers: [{
      firstName: String,
      lastName: String,
      birthDate: Date,
      licenseDate: Date,
      // ... other driver fields
    }],
    
    // Coverage details
    coverage: {
      effectiveDate: Date,
      liabilityLimit: String,
      deductible: Number,
      // ... other coverage fields
    },
    
    // Store complete form data as Mixed for flexibility
    fullFormData: mongoose.Schema.Types.Mixed,
  },
  
  // Session status
  status: {
    type: String,
    enum: ['active', 'expired', 'completed', 'cancelled'],
    default: 'active',
    index: true,
  },
  
  // Is this the currently active session for the user?
  isActive: {
    type: Boolean,
    default: false,
    index: true,
  },
  
  // Quote processing status
  quoteStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  
  // Related user_products for this session
  userProductIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserProduct',
  }],
  
  // Metadata
  expiresAt: {
    type: Date,
    default: () => {
      // Sessions expire after 30 days
      const date = new Date();
      date.setDate(date.getDate() + 30);
      return date;
    },
  },
  
  completedAt: {
    type: Date,
  },
  
  notes: {
    type: String,
  },
  
}, {
  timestamps: true,
});

// Indexes for efficient queries
quoteSessionSchema.index({ userId: 1, status: 1 });
quoteSessionSchema.index({ userId: 1, isActive: 1 });
quoteSessionSchema.index({ leadId: 1 });
quoteSessionSchema.index({ sessionId: 1 }, { unique: true });

// Virtual for formatted date (e.g., "May 4")
quoteSessionSchema.virtual('formattedDate').get(function() {
  if (!this.label.createdDate) return '';
  
  const date = new Date(this.label.createdDate);
  const options = { month: 'short', day: 'numeric' };
  return date.toLocaleDateString('fr-CA', options);
});

// Method to get display label for sidebar
quoteSessionSchema.methods.getDisplayLabel = function() {
  return {
    primary: this.label.vehicleName || 'Assurance Auto',
    secondary: this.formattedDate
  };
};

// Static method to count active sessions for a user
quoteSessionSchema.statics.countActiveSessions = async function(userId) {
  return await this.countDocuments({ 
    userId, 
    status: 'active' 
  });
};

// Static method to check if user can create new session
quoteSessionSchema.statics.canCreateNewSession = async function(userId) {
  const count = await this.countActiveSessions(userId);
  return count < 3;
};

// Static method to get active session for user
quoteSessionSchema.statics.getActiveSession = async function(userId) {
  return await this.findOne({ 
    userId, 
    status: 'active',
    isActive: true 
  });
};

// Static method to set active session
quoteSessionSchema.statics.setActiveSession = async function(userId, sessionId) {
  // Deactivate all other sessions for this user
  await this.updateMany(
    { userId, isActive: true },
    { isActive: false }
  );
  
  // Activate the specified session
  const session = await this.findOneAndUpdate(
    { userId, sessionId, status: 'active' },
    { isActive: true },
    { new: true }
  );
  
  return session;
};

// Method to compare quote data with another session
quoteSessionSchema.methods.hasSameDataAs = function(otherQuoteData) {
  // Compare vehicles
  const vehiclesMatch = this.compareVehicles(otherQuoteData.vehicles);
  
  // Compare drivers
  const driversMatch = this.compareDrivers(otherQuoteData.drivers);
  
  // Compare coverage
  const coverageMatch = this.compareCoverage(otherQuoteData.coverage);
  
  // All must match for data to be considered the same
  return vehiclesMatch && driversMatch && coverageMatch;
};

quoteSessionSchema.methods.compareVehicles = function(otherVehicles) {
  if (!this.quoteData?.vehicles || !otherVehicles) return false;
  if (this.quoteData.vehicles.length !== otherVehicles.length) return false;
  
  // Simple comparison - can be enhanced
  for (let i = 0; i < this.quoteData.vehicles.length; i++) {
    const v1 = this.quoteData.vehicles[i];
    const v2 = otherVehicles[i];
    
    if (v1.year !== v2.year || 
        v1.make !== v2.make || 
        v1.model !== v2.model ||
        v1.vin !== v2.vin) {
      return false;
    }
  }
  
  return true;
};

quoteSessionSchema.methods.compareDrivers = function(otherDrivers) {
  if (!this.quoteData?.drivers || !otherDrivers) return false;
  if (this.quoteData.drivers.length !== otherDrivers.length) return false;
  
  for (let i = 0; i < this.quoteData.drivers.length; i++) {
    const d1 = this.quoteData.drivers[i];
    const d2 = otherDrivers[i];
    
    if (d1.firstName !== d2.firstName || 
        d1.lastName !== d2.lastName ||
        d1.birthDate?.toString() !== d2.birthDate?.toString()) {
      return false;
    }
  }
  
  return true;
};

quoteSessionSchema.methods.compareCoverage = function(otherCoverage) {
  if (!this.quoteData?.coverage || !otherCoverage) return false;
  
  return this.quoteData.coverage.effectiveDate?.toString() === otherCoverage.effectiveDate?.toString() &&
         this.quoteData.coverage.liabilityLimit === otherCoverage.liabilityLimit &&
         this.quoteData.coverage.deductible === otherCoverage.deductible;
};

// Ensure virtuals are included in JSON output
quoteSessionSchema.set('toJSON', { virtuals: true });
quoteSessionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('QuoteSession', quoteSessionSchema);
