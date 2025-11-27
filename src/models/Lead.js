const mongoose = require('mongoose');

/**
 * Lead Schema - Stores lead information
 */
const leadSchema = new mongoose.Schema({
  // Personal Information
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  
  // Address Information
  address: {
    street: String,
    city: String,
    province: String,
    postalCode: String,
  },
  
  // Driver Information
  dateOfBirth: {
    type: Date,
    required: true,
  },
  gender: {
    type: String,
    enum: ['M', 'F'],
  },
  maritalStatus: {
    type: String,
    enum: ['S', 'M', 'D', 'W', 'C'], // Single, Married, Divorced, Widowed, Common-law
  },
  licenseDate: {
    type: Date,
  },
  licenseClass: {
    type: String,
  },
  
  // Vehicle Information
  vehicles: [{
    year: Number,
    make: String,
    model: String,
    vin: String,
    viccCode: String,
    vehicleType: String,
    vehicleUse: String,
    distanceYearly: Number,
  }],
  
  // Insurance Information
  currentInsuranceCarrier: String,
  dateContinuousInsurance: Date,
  claims: [{
    date: Date,
    type: String,
    amount: Number,
    description: String,
  }],
  convictions: [{
    date: Date,
    type: String,
    description: String,
  }],
  
  // Coverage Preferences
  coveragePreferences: {
    type: mongoose.Schema.Types.Mixed,
  },
  
  // Lead Status
  status: {
    type: String,
    enum: ['new', 'contacted', 'converted', 'closed'],
    default: 'new',
  },
  
  // Source tracking
  source: {
    type: String,
    default: 'web',
  },
}, {
  timestamps: true,
});

// Indexes
leadSchema.index({ email: 1 });
leadSchema.index({ phone: 1 });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ 'address.postalCode': 1 });

module.exports = mongoose.model('Lead', leadSchema);
