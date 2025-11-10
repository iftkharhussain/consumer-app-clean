const mongoose = require('mongoose');

/**
 * Quote Schema - Stores quote information from Fortus API
 */
const quoteSchema = new mongoose.Schema({
  quoteGuid: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  quoteIterationGuid: {
    type: String,
    required: true,
  },
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'error', 'processing'],
    default: 'pending',
  },
  fortusRequest: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  fortusResponse: {
    type: mongoose.Schema.Types.Mixed,
  },
  trackingNumber: {
    type: String,
  },
  carriers: [{
    name: String,
    premium: Number,
    available: Boolean,
    errorMessage: String,
    coverages: [{
      code: String,
      description: String,
      limit: String,
      deductible: Number,
      premium: Number,
    }],
  }],
  province: {
    type: String,
    required: true,
  },
  lineOfBusiness: {
    type: String,
    enum: ['AUTO', 'HAB'],
    default: 'AUTO',
  },
  error: {
    message: String,
    code: String,
    details: mongoose.Schema.Types.Mixed,
  },
}, {
  timestamps: true,
});

// Indexes for common queries
quoteSchema.index({ createdAt: -1 });
quoteSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Quote', quoteSchema);
