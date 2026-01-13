/**
 * PostalCode Schema
 * Represents Canadian postal codes with location index (gcpcid)
 */
const mongoose = require('mongoose');

const postalCodeSchema = new mongoose.Schema({
  fsa: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  lcr: {
    type: String,
    uppercase: true,
    trim: true,
  },
  city: {
    type: String,
    uppercase: true,
    trim: true,
  },
  gcnid: {
    type: String,
  },
  gcpcid: {
    type: String,
    required: true,
  },
  isSummary: {
    type: Boolean,
    default: false,
  },
  postalCode: {
    type: String,
    uppercase: true,
    sparse: true, // Allow null values with unique index
  },
}, {
  collection: 'postalCodes',
  timestamps: false,
});

// Index for faster lookups
postalCodeSchema.index({ postalCode: 1 });
postalCodeSchema.index({ fsa: 1 });
postalCodeSchema.index({ gcpcid: 1 });

module.exports = mongoose.model('PostalCode', postalCodeSchema);
