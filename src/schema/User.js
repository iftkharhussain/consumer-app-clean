const mongoose = require('mongoose');

/**
 * User Schema - Stores consumer app users
 * 
 * Users can be created in two ways:
 * 1. Traditional registration (email/password)
 * 2. Lead-based authentication (from lead management system)
 */
const userSchema = new mongoose.Schema({
  // Basic Information
  firstName: {
    type: String,
    trim: true,
  },
  lastName: {
    type: String,
    trim: true,
  },
  fullName: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  
  // Password (optional - not required for lead-based login)
  password: {
    type: String,
    select: false, // Don't include in queries by default
  },
  
  // Lead Management System Reference
  leadSystemInfo: {
    // Whether this user was created from a lead submission
    isLeadUser: {
      type: Boolean,
      default: false,
    },
    // Lead ID in the lead management system
    leadId: {
      type: String,
      index: true,
    },
    // Product/category from the lead
    product: {
      type: String,
    },
    // When the lead was submitted
    leadSubmittedAt: {
      type: Date,
    },
  },
  
  // Authentication
  authMethod: {
    type: String,
    enum: ['password', 'lead-token', 'both'],
    default: 'password',
  },
  
  // Email/Phone verification
  emailVerified: {
    type: Boolean,
    default: false,
  },
  phoneVerified: {
    type: Boolean,
    default: false,
  },
  
  // Profile
  avatar: {
    type: String,
  },
  language: {
    type: String,
    default: 'fr',
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active',
  },
  
  // Admin and role fields
  isAdmin: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'super_admin'],
    default: 'user',
  },
  
  // Session tracking
  lastLoginAt: {
    type: Date,
  },
  lastLoginMethod: {
    type: String,
    enum: ['password', 'lead-token'],
  },
  
  // Two-factor authentication
  twoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  twoFactorSecret: {
    type: String,
    select: false,
  },
  
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.twoFactorSecret;
      return ret;
    }
  }
});

// Indexes
userSchema.index({ email: 1, phone: 1 });
userSchema.index({ 'leadSystemInfo.leadId': 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name if not set
userSchema.virtual('displayName').get(function() {
  if (this.fullName) return this.fullName;
  if (this.firstName && this.lastName) return `${this.firstName} ${this.lastName}`;
  if (this.firstName) return this.firstName;
  return this.email;
});

// Static method to find or create user from lead data
userSchema.statics.findOrCreateFromLead = async function(leadData) {
  const { phone, email, fullName, leadId, product } = leadData;
  
  // Try to find existing user by phone or email
  let user = await this.findOne({
    $or: [
      { phone: phone },
      { email: email }
    ]
  });
  
  if (user) {
    // Update existing user with lead info if not already set
    if (!user.leadSystemInfo?.isLeadUser) {
      user.leadSystemInfo = {
        isLeadUser: true,
        leadId,
        product,
        leadSubmittedAt: new Date(),
      };
      
      // Update auth method to allow lead-token
      if (user.authMethod === 'password') {
        user.authMethod = 'both';
      }
      
      await user.save();
    }
    
    return { user, isNew: false };
  }
  
  // Create new user from lead data
  const [firstName, ...lastNameParts] = (fullName || '').split(' ');
  const lastName = lastNameParts.join(' ');
  
  user = await this.create({
    email,
    phone,
    fullName,
    firstName: firstName || '',
    lastName: lastName || '',
    phoneVerified: true, // Phone was verified in lead submission
    authMethod: 'lead-token',
    leadSystemInfo: {
      isLeadUser: true,
      leadId,
      product,
      leadSubmittedAt: new Date(),
    },
  });
  
  return { user, isNew: true };
};

// Instance method to update last login
userSchema.methods.recordLogin = async function(method = 'password') {
  this.lastLoginAt = new Date();
  this.lastLoginMethod = method;
  await this.save();
};

const User = mongoose.model('User', userSchema);

module.exports = User;
