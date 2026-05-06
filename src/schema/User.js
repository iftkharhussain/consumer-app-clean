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
    required: false,
    validate: {
      validator: function (value) {
        // Use a regular expression to check password requirements
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[@#$%^&+=]).{8,}$/;
        return passwordRegex.test(value);
      },
      message: 'passwordRequirements'
    }
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
  reset: Boolean,
  type: { 
    type: String, 
    enum: ['advisor', 'admin', 'lead'], 
    required: true,
    default: 'lead'
  },
  active: { type: Boolean, default: false },
  twoStepAuthCodeTries: { type: Number, default: 0 },
  profilePic: { type: String, default: '/images/avatar-default.png' },
  profession: {
    type: String,
    trim: true,
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
    enum: ['password', 'lead-token', 'phone-otp'],
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
  const { phone, email, fullName, firstName, lastName, leadId, product, leadType } = leadData;
  
  // Try to find existing user by phone or email
  let user = await this.findOne({
    $or: [
      { phone: phone },
      { email: email?.toLowerCase() }
    ]
  });
  
  if (user) {
    // For duplicate leads, check if credentials match
    const credentialsMismatch = {
      phoneMismatch: false,
      emailMismatch: false
    };
    
    if (leadType === 'duplicate') {
      // Check if phone matches
      if (user.phone !== phone) {
        credentialsMismatch.phoneMismatch = true;
      }
      // Check if email matches
      if (email && user.email !== email.toLowerCase()) {
        credentialsMismatch.emailMismatch = true;
      }
      
      // If there's a mismatch, return without updating
      if (credentialsMismatch.phoneMismatch || credentialsMismatch.emailMismatch) {
        return { 
          user, 
          isNew: false, 
          alreadyExists: true,
          credentialsMismatch,
          requiresManualLogin: true
        };
      }
    }
    
    // Check if user data has changed (name or email different)
    const dataHasChanged = (fullName && fullName !== user.fullName) || 
                          (email && email.toLowerCase() !== user.email);
    
    // Update existing user with lead info if needed
    let needsUpdate = false;
    
    // Add new leadId to existing user if different
    if (leadId && user.leadSystemInfo?.leadId !== leadId) {
      user.leadSystemInfo = {
        ...user.leadSystemInfo,
        isLeadUser: true,
        leadId,
        product: product || user.leadSystemInfo?.product,
        leadSubmittedAt: new Date(),
      };
      needsUpdate = true;
    }
    
    // Update auth method to allow lead-token
    if (user.authMethod === 'password') {
      user.authMethod = 'both';
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      await user.save();
    }
    
    return { 
      user, 
      isNew: false, 
      alreadyExists: true, 
      credentialsMismatch,
      showResubmitAlert: dataHasChanged // Flag to show alert in consumer app
    };
  }
  
  // Create new user from lead data
  // Use firstName/lastName from token if provided, otherwise split fullName
  let userFirstName = firstName || '';
  let userLastName = lastName || '';
  
  if (!userFirstName && !userLastName && fullName) {
    const nameParts = fullName.split(' ');
    userFirstName = nameParts[0] || '';
    userLastName = nameParts.slice(1).join(' ') || '';
  }
  
  try {
    user = await this.create({
      email: email?.toLowerCase(),
      phone,
      fullName: fullName || `${userFirstName} ${userLastName}`.trim(),
      firstName: userFirstName,
      lastName: userLastName,
      phoneVerified: true, // Phone was verified in lead submission
      authMethod: 'lead-token',
      leadSystemInfo: {
        isLeadUser: true,
        leadId,
        product,
        leadSubmittedAt: new Date(),
      },
    });
    
    return { user, isNew: true, alreadyExists: false };
  } catch (error) {
    // Handle duplicate key error (race condition)
    if (error.code === 11000) {
      // Another request created the user, find and return it
      user = await this.findOne({
        $or: [
          { phone: phone },
          { email: email?.toLowerCase() }
        ]
      });
      
      if (user) {
        return { user, isNew: false, alreadyExists: true };
      }
    }
    throw error;
  }
};

// Instance method to update last login
userSchema.methods.recordLogin = async function(method = 'password') {
  this.lastLoginAt = new Date();
  this.lastLoginMethod = method;
  await this.save();
};

const User = mongoose.model('User', userSchema);

module.exports = User;
