const mongoose = require('mongoose');

/**
 * ProductOrder Schema
 * Tracks when users request calls for products (e.g., via "Demander un appel" button)
 * Used to redirect users to order status page if they have pending requests
 */
const productOrderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserProduct',
    required: true,
    index: true
  },
  leadId: {
    type: String,
    required: true,
    index: true
  },
  productSlug: {
    type: String,
    required: true,
    index: true
  },
  quoteId: {
    type: String,
    default: null
  },
  
  // Selected quote information (what user chose)
  // This is saved because it's specific to this order and won't change
  selectedQuote: {
    insurerName: String,           // e.g., "Intact Insurance"
    carrierCode: String,            // e.g., "GC"
    logo: String,                   // e.g., "/images/intact-insurance.svg"
    monthlyPrice: Number,           // e.g., 90
    yearlyPrice: Number,            // e.g., 1080
    oldMonthlyPrice: Number,        // For showing discount
    oldYearlyPrice: Number,
    discount: Number,               // Percentage discount if applicable
    isIntactDiscount: Boolean,      // Special Intact 10% discount flag
    // How the quote was selected. Controls whether the confirmation email shows the quote card:
    // 'explicit'    = user chose a specific carrier ("Choisir")  -> email SHOWS insurer + price + protections
    // 'courtika'    = user clicked "Parler à Courtika"            -> email HIDES the quote card (generic message only)
    // 'personalize' = user clicked "Personnaliser"               -> email HIDES the quote card (generic message only)
    // NOTE: this does NOT affect what is sent to Fortus Leads (still the cheapest carrier for courtika/personalize).
    selectionType: {
      type: String,
      enum: ['explicit', 'courtika', 'personalize'],
      default: 'explicit'
    },
    coverages: [{
      id: String,
      csioCode: String,
      limit1: Number,
      deductible: Number,
      pack: String
    }]
  },
  
  // Note: Advisor info (office hours, phone, etc.) is fetched from LMS when needed
  // via the leadId. This ensures we always have the most up-to-date information.
  
  status: {
    type: String,
    enum: ['call_requested', 'order_placed', 'completed', 'cancelled'],
    default: 'call_requested',
    index: true
  },
  fortusDeliveryId: {
    type: String,
    default: null
  },
  requestedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  completedAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
productOrderSchema.index({ userId: 1, productSlug: 1, status: 1 });
productOrderSchema.index({ userId: 1, status: 1, requestedAt: -1 });

const ProductOrder = mongoose.model('ProductOrder', productOrderSchema, 'product_orders');

module.exports = ProductOrder;
