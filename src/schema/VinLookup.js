/**
 * VIN Lookup Model
 * VIN to vehicle mapping with embedded vehicle details
 * Optimized for fast VIN searches
 */

const mongoose = require('mongoose');

const vinLookupSchema = new mongoose.Schema({
  // VIN information
  vin: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  
  // Reference to vehicle
  modelYear: {
    type: Number,
    required: true,
    index: true
  },
  extVicc: {
    type: Number,
    required: true,
    index: true
  },
  viccCode: {
    type: Number,
    required: true
  },
  
  // Embedded vehicle details for fast lookups (denormalized)
  vehicleDetails: {
    make: String,
    makeFr: String,
    model: String,
    modelFr: String,
    bodyStyle: String,
    bodyType: String,
    fuelType: String,
    cylinder: Number,
    drivetrain: Number,
    vehicleType: String
  },
  
  // Original data
  recNo: Number,
  multVin: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  collection: 'vin_lookups'
});

// Index for VIN prefix search (for partial VIN lookups)
vinLookupSchema.index({ vin: 'text' });

// Compound index
vinLookupSchema.index({ vin: 1, modelYear: 1 });

// Static method to lookup by VIN (partial match)
vinLookupSchema.statics.lookupByVin = async function(vinQuery, limit = 10) {
  const searchVin = vinQuery.toUpperCase();
  
  // Try exact prefix match first, then contains
  let results = await this.find({
    vin: { $regex: `^${searchVin}`, $options: 'i' }
  })
  .limit(limit)
  .lean();
  
  // If no prefix matches, try contains
  if (results.length === 0) {
    results = await this.find({
      vin: { $regex: searchVin, $options: 'i' }
    })
    .limit(limit)
    .lean();
  }
  
  return results.map(r => ({
    vin: r.vin,
    year: r.modelYear,
    viccCode: r.viccCode,
    extVicc: r.extVicc,
    make: r.vehicleDetails?.make || null,
    makeFr: r.vehicleDetails?.makeFr || null,
    model: r.vehicleDetails?.model || null,
    modelFr: r.vehicleDetails?.modelFr || null,
    bodyStyle: r.vehicleDetails?.bodyStyle || null,
    bodyType: r.vehicleDetails?.bodyType || null,
    fuelType: r.vehicleDetails?.fuelType || null,
    cylinder: r.vehicleDetails?.cylinder || null
  }));
};

module.exports = mongoose.model('VinLookup', vinLookupSchema);
