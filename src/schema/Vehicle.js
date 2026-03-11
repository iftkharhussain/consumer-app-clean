/**
 * Vehicle Model
 * Combined vehicle details from PPVDETL data
 * This is the main vehicle reference data
 */

const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  // Primary identifiers
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
    required: true,
    index: true
  },
  
  // Make information
  make: {
    type: String,
    required: true,
    index: true
  },
  makeFr: {
    type: String,
    default: ''
  },
  
  // Model information
  model: {
    type: String,
    required: true
  },
  modelFr: {
    type: String,
    default: ''
  },
  makeMod: {
    type: String,
    default: ''
  },
  makeModFr: {
    type: String,
    default: ''
  },
  
  // Vehicle specifications
  wheelbase: String,
  weight: String,
  horsepower: String,
  price: String,
  
  // Safety features
  airbags: String,
  abs: String,
  tractionControl: String,
  stabilityControl: String,
  
  // Security features
  alarmAudio: String,
  alarmCutoff: String,
  alarmSecKey: String,
  
  // Engine specifications
  cylinder: Number,
  fuelType: {
    type: String,
    enum: ['G', 'D', 'E', 'H', 'N', 'V', 'X', ''], // G=Gas, D=Diesel, E=Electric, H=Hybrid, N=Natural Gas, V=Electric Vehicle, X=Other
    default: 'G'
  },
  induction: String,
  hybrid: String,
  
  // Body specifications
  bodyStyle: String,
  bodyType: String,
  drivetrain: Number,
  vehicleType: String,
  convertible: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: 'vehicles'
});

// Compound index for efficient lookups
vehicleSchema.index({ modelYear: 1, extVicc: 1 }, { unique: true });
vehicleSchema.index({ modelYear: 1, make: 1 });
vehicleSchema.index({ make: 1, model: 1 });

// Static method to get all unique years
vehicleSchema.statics.getYears = async function() {
  const years = await this.distinct('modelYear');
  return years.sort((a, b) => b - a); // Descending order
};

// Static method to get makes by year
vehicleSchema.statics.getMakesByYear = async function(year) {
  const makes = await this.aggregate([
    { $match: { modelYear: parseInt(year) } },
    { $group: { 
      _id: '$make', 
      makeFr: { $first: '$makeFr' } 
    }},
    { $sort: { _id: 1 } }
  ]);
  
  return makes.map(m => ({
    value: m._id,
    label: m.makeFr || m._id
  }));
};

// Static method to get models by year and make
vehicleSchema.statics.getModelsByYearAndMake = async function(year, make) {
  const models = await this.find({
    modelYear: parseInt(year),
    make: { $regex: new RegExp(`^${make}$`, 'i') }
  }).select('extVicc viccCode model modelFr bodyStyle bodyType fuelType cylinder').lean();
  
  return models.map(m => ({
    value: m.extVicc.toString(),
    label: m.modelFr || m.model,
    model: m.model,
    modelFr: m.modelFr,
    viccCode: m.viccCode,
    extVicc: m.extVicc,
    bodyStyle: m.bodyStyle,
    bodyType: m.bodyType,
    fuelType: m.fuelType,
    cylinder: m.cylinder
  }));
};

// Static method to get vehicle details
vehicleSchema.statics.getVehicleDetails = async function(year, extVicc) {
  return await this.findOne({
    modelYear: parseInt(year),
    extVicc: parseInt(extVicc)
  }).lean();
};

module.exports = mongoose.model('Vehicle', vehicleSchema);
