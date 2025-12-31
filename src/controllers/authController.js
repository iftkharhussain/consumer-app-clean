/**
 * Authentication Controller
 * 
 * Handles authentication endpoints including:
 * - Lead-based token authentication (cross-app auth from lead management system)
 * - Traditional email/password authentication
 * - Phone-based authentication
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../schema/User');
const UserProduct = require('../schema/UserProduct');
const logger = require('../utils/logger');
const lmsDB = require('../config/lmsCollections');

// Use the same secret as the lead system for cross-app tokens
const CROSS_APP_SECRET = process.env.CROSS_APP_JWT_SECRET || process.env.JWT_SECRET || 'cross-app-secret-key-change-in-production';

// Session JWT secret (for consumer app sessions)
const SESSION_SECRET = process.env.JWT_SECRET || 'session-secret-change-in-production';

// Session expiry (7 days)
const SESSION_EXPIRY = '7d';

/**
 * Verify lead login token from the lead management system
 * @param {string} token - JWT token from lead system
 * @returns {Object} Verification result
 */
function verifyLeadToken(token) {
  try {
    const decoded = jwt.verify(token, CROSS_APP_SECRET, {
      algorithms: ['HS256']
    });

    // Ensure it's a consumer app login token
    if (decoded.type !== 'consumer_app_login') {
      return { valid: false, error: 'Invalid token type' };
    }

    return {
      valid: true,
      data: decoded
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { valid: false, error: 'Token expired' };
    }
    if (error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid token' };
    }
    return { valid: false, error: error.message };
  }
}

/**
 * Generate session JWT for the consumer app
 * @param {Object} user - User document
 * @returns {string} Session JWT
 */
function generateSessionToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      phone: user.phone,
      type: 'session'
    },
    SESSION_SECRET,
    { expiresIn: SESSION_EXPIRY }
  );
}

/**
 * Sync lead products from LMS to consumer app
 * Fetches lead_products from LMS by leadId and creates/updates user_products
 * 
 * @param {ObjectId} userId - Consumer app user ID
 * @param {string} leadId - LMS lead ID (from token)
 * @returns {Promise<Array>} Created/updated user products
 */
async function syncLeadProducts(userId, leadId) {
  try {
    const mongoose = require('mongoose');
    const leadObjectId = new mongoose.Types.ObjectId(leadId);
    
    logger.info('Syncing lead products', { userId, leadId });
    
    // Fetch lead_products from LMS database
    // Note: lmsDB.leadProducts.find() is now async and returns a cursor
    const cursor = await lmsDB.leadProducts.find({ leadId: leadObjectId });
    const leadProducts = await cursor.toArray();
    
    if (!leadProducts || leadProducts.length === 0) {
      logger.info('No lead products found for leadId', { leadId });
      return [];
    }
    
    logger.info('Found lead products from LMS', { leadId, count: leadProducts.length });
    
    // Fetch product details for slugs/names
    const productIds = leadProducts.map(lp => lp.product);
    const productsCursor = await lmsDB.products.find({ _id: { $in: productIds } });
    const products = await productsCursor.toArray();
    const productMap = new Map(products.map(p => [p._id.toString(), p]));
    
    const syncedProducts = [];
    
    for (const lp of leadProducts) {
      const product = productMap.get(lp.product?.toString());
      
      // Check if user_product already exists
      const existingProduct = await UserProduct.findOne({
        leadId: leadObjectId,
        leadProductId: lp._id,
      });
      
      if (existingProduct) {
        // Update if exists
        existingProduct.userId = userId;
        existingProduct.lmsMetadata = {
          content: lp.content,
          isVisited: lp.isVisited,
          lmsStatus: lp.status,
        };
        await existingProduct.save();
        syncedProducts.push(existingProduct);
      } else {
        // Create new user_product
        const userProduct = new UserProduct({
          userId,
          leadId: leadObjectId,
          leadProductId: lp._id,
          productId: lp.product,
          productSlug: product?.slug || null,
          productName: product?.title || product?.name || null,
          status: 'active',
          quoteStatus: 'not_requested',
          lmsMetadata: {
            content: lp.content,
            isVisited: lp.isVisited,
            lmsStatus: lp.status,
          },
        });
        await userProduct.save();
        syncedProducts.push(userProduct);
      }
    }
    
    logger.info('Synced lead products to user_products', { 
      userId, 
      leadId, 
      syncedCount: syncedProducts.length 
    });
    
    return syncedProducts;
  } catch (error) {
    logger.error('Error syncing lead products', { 
      userId, 
      leadId, 
      error: error.message 
    });
    // Don't throw - we don't want to fail login if product sync fails
    return [];
  }
}

/**
 * Lead Login Handler
 * 
 * Validates the login token from lead management system,
 * creates user if needed, and establishes a session.
 * 
 * POST /api/auth/lead-login
 * Body: { token: string }
 * 
 * Response:
 * - success: boolean
 * - user: User object
 * - sessionToken: JWT for session
 * - isNewUser: boolean
 * - redirectTo: string (where to redirect in the app)
 */
async function leadLogin(req, res) {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    // Verify the token from lead system
    const verification = verifyLeadToken(token);

    if (!verification.valid) {
      logger.warn('Lead login failed - invalid token', { error: verification.error });
      return res.status(401).json({
        success: false,
        message: verification.error || 'Invalid or expired token'
      });
    }

    const tokenData = verification.data;

    // Find or create user from lead data
    const { user, isNew, credentialsMismatch, requiresManualLogin } = await User.findOrCreateFromLead({
      phone: tokenData.phone,
      email: tokenData.email,
      fullName: tokenData.fullName,
      leadId: tokenData.leadId,
      product: tokenData.product,
      leadType: tokenData.leadType
    });

    // If credentials don't match for duplicate lead, return error with mismatch info
    if (requiresManualLogin && credentialsMismatch) {
      logger.warn('Lead login failed - credentials mismatch', {
        phone: tokenData.phone,
        email: tokenData.email,
        phoneMismatch: credentialsMismatch.phoneMismatch,
        emailMismatch: credentialsMismatch.emailMismatch
      });
      
      return res.status(403).json({
        success: false,
        requiresManualLogin: true,
        credentialsMismatch,
        message: 'Credentials mismatch. Please login manually.',
        submittedCredentials: {
          phone: tokenData.phone,
          email: tokenData.email
        }
      });
    }

    // Record the login
    await user.recordLogin('lead-token');

    // Sync lead products from LMS to user_products for both new and duplicate leads
    // This ensures products are always available even if previously deleted
    let userProducts = [];
    if (tokenData.leadId) {
      userProducts = await syncLeadProducts(user._id, tokenData.leadId);
    } else if (user.leadSystemInfo?.leadId) {
      // For duplicate leads, use existing leadId from user profile
      userProducts = await syncLeadProducts(user._id, user.leadSystemInfo.leadId);
    }

    // Generate session token
    const sessionToken = generateSessionToken(user);

    logger.info('Lead login successful', {
      userId: user._id,
      isNewUser: isNew,
      leadId: tokenData.leadId,
      productsCount: userProducts.length
    });

    // Set session cookie
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Prepare products list for response
    const products = userProducts.map(up => ({
      id: up._id,
      productId: up.productId,
      productSlug: up.productSlug,
      productName: up.productName,
      leadId: up.leadId,
      quoteStatus: up.quoteStatus,
    }));

    return res.status(200).json({
      success: true,
      message: isNew ? 'Account created and logged in' : 'Logged in successfully',
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName || user.displayName,
        language: user.language || 'fr',
        isLeadUser: user.leadSystemInfo?.isLeadUser,
        product: user.leadSystemInfo?.product
      },
      sessionToken,
      isNewUser: isNew,
      userAlreadyExists: !isNew, // Flag for frontend to show appropriate message
      products, // Include synced products
      redirectTo: '/dashboard' // Default redirect after login
    });

  } catch (error) {
    logger.error('Lead login error', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: 'An error occurred during login'
    });
  }
}

/**
 * Check Token Handler
 * 
 * Validates a lead login token without creating a session.
 * Useful for the frontend to check if a token is valid before redirecting.
 * 
 * POST /api/auth/check-token
 * Body: { token: string }
 */
async function checkToken(req, res) {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Token is required'
      });
    }

    const verification = verifyLeadToken(token);

    if (!verification.valid) {
      return res.status(200).json({
        success: true,
        valid: false,
        error: verification.error
      });
    }

    return res.status(200).json({
      success: true,
      valid: true,
      data: {
        phone: verification.data.phone,
        email: verification.data.email,
        fullName: verification.data.fullName,
        expiresAt: new Date(verification.data.exp * 1000).toISOString()
      }
    });

  } catch (error) {
    logger.error('Check token error', { error: error.message });
    return res.status(500).json({
      success: false,
      valid: false,
      message: 'An error occurred'
    });
  }
}

/**
 * Get Current User Handler
 * 
 * Returns the currently authenticated user based on session token.
 * 
 * GET /api/auth/me
 * Headers: Authorization: Bearer <sessionToken>
 */
async function getCurrentUser(req, res) {
  try {
    // User should be attached by auth middleware
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        _id: user._id,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName || user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        language: user.language,
        isLeadUser: user.leadSystemInfo?.isLeadUser,
        product: user.leadSystemInfo?.product,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        profession: user.profession,
        profilePhone: user.phone,
        profilePic: user.avatar,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    logger.error('Get current user error', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'An error occurred'
    });
  }
}

/**
 * Logout Handler
 * 
 * Clears the session cookie.
 * 
 * POST /api/auth/logout
 */
async function logout(req, res) {
  res.clearCookie('session');
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
}

/**
 * Traditional Email/Password Login
 * 
 * POST /api/auth/login
 * Body: { email: string, password: string }
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email and include password for verification
   
    try {
      const collections = await User.db.db.listCollections().toArray();
      
      const userCount = await User.countDocuments();
      
      if (userCount > 0) {
        const sampleUsers = await User.find({}, 'email role isAdmin').limit(3);
      }
    } catch (dbError) {
      console.error('   Database Debug Error:', dbError.message);
    }
    
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user has a password set (some users might be lead-only)
    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: 'Please login using your phone number or contact support'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      console.log('Invalid password for user:', user.email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check user status
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Account is suspended. Please contact support.'
      });
    }

    // Record login
    await user.recordLogin('password');

    // Generate session token
    const sessionToken = generateSessionToken(user);

    logger.info('Email login successful', {
      userId: user._id,
      email: user.email
    });

    // Set session cookie
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName || user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        language: user.language
      },
      sessionToken
    });

  } catch (error) {
    logger.error('Email login error', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: 'An error occurred during login'
    });
  }
}

/**
 * Phone Login
 * 
 * POST /api/auth/phone-login
 * Body: { phone: string }
 */
async function phoneLogin(req, res) {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Find user by phone
    const user = await User.findOne({ phone: phone.trim() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this phone number. Please register first.'
      });
    }

    // Check user status
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Account is suspended. Please contact support.'
      });
    }

    // For now, we'll allow direct phone login for lead-based users
    // In production, you might want to implement phone OTP verification
    if (user.leadSystemInfo?.isLeadUser && user.phoneVerified) {
      // Record login
      await user.recordLogin('lead-token');

      // Generate session token
      const sessionToken = generateSessionToken(user);

      logger.info('Phone login successful', {
        userId: user._id,
        phone: user.phone
      });

      // Set session cookie
      res.cookie('session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      return res.status(200).json({
        success: true,
        message: 'Logged in successfully',
        user: {
          id: user._id,
          email: user.email,
          phone: user.phone,
          fullName: user.fullName || user.displayName,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          language: user.language
        },
        sessionToken
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Phone login is only available for verified lead-based accounts. Please use email/password login.'
      });
    }

  } catch (error) {
    logger.error('Phone login error', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: 'An error occurred during login'
    });
  }
}

/**
 * Register
 * 
 * POST /api/auth/register
 * Body: { email: string, password: string, phone: string, firstName?: string, lastName?: string }
 */
async function register(req, res) {
  try {
    const { email, password, phone, firstName, lastName } = req.body;

    if (!email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and phone number are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { phone: phone.trim() }
      ]
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email or phone number already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone.trim(),
      firstName: firstName?.trim() || '',
      lastName: lastName?.trim() || '',
      fullName: firstName && lastName ? `${firstName.trim()} ${lastName.trim()}` : '',
      authMethod: 'password'
    });

    // Record login
    await user.recordLogin('password');

    // Generate session token
    const sessionToken = generateSessionToken(user);

    logger.info('User registration successful', {
      userId: user._id,
      email: user.email
    });

    // Set session cookie
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName || user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        language: user.language
      },
      sessionToken
    });

  } catch (error) {
    logger.error('Registration error', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: 'An error occurred during registration'
    });
  }
}

/**
 * Verify Authentication Token
 * 
 * GET /api/auth/verify
 */
async function verifyAuth(req, res) {
  try {
    // User should be attached by auth middleware
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Token verified',
      data: {
        id: user._id,
        _id: user._id,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName || user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        language: user.language,
        isLeadUser: user.leadSystemInfo?.isLeadUser,
        product: user.leadSystemInfo?.product,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        profession: user.profession,
        profilePhone: user.profilePhone || user.phone,
        profilePic: user.avatar
      }
    });

  } catch (error) {
    logger.error('Verify auth error', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'An error occurred'
    });
  }
}

/**
 * Update Profile
 * 
 * PUT /api/auth/profile
 * Body: { firstName?: string, lastName?: string, profilePhone?: string, profession?: string }
 */
async function updateProfile(req, res) {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    const { firstName, lastName, profilePhone, profession } = req.body;

    // Find user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update fields if provided
    if (firstName !== undefined) user.firstName = firstName.trim();
    if (lastName !== undefined) user.lastName = lastName.trim();
    if (profilePhone !== undefined) user.phone = profilePhone.trim();
    if (profession !== undefined) user.profession = profession.trim();

    // Update fullName
    if (firstName || lastName) {
      user.fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }

    await user.save();

    logger.info('Profile updated successfully', { userId: user._id });

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user._id,
        _id: user._id,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        language: user.language,
        profession: user.profession,
        profilePhone: user.phone,
        profilePic: user.avatar
      }
    });

  } catch (error) {
    logger.error('Update profile error', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
}

/**
 * Upload Profile Picture
 * 
 * POST /app/profile-pic
 * Query: userId
 * File: file (multipart/form-data)
 */
async function uploadProfilePicture(req, res) {
  try {
    const userId = req.query.userId || req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Find user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete old profile picture if exists
    if (user.avatar) {
      const oldFilePath = require('path').join(__dirname, '../..', user.avatar);
      const fs = require('fs');
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    // Update user avatar path
    const avatarPath = `/uploads/profiles/${req.file.filename}`;
    user.avatar = avatarPath;
    await user.save();

    logger.info('Profile picture updated successfully', { userId: user._id });

    return res.status(200).json({
      success: true,
      message: 'Profile picture uploaded successfully',
      data: {
        profilePic: avatarPath,
        avatar: avatarPath
      }
    });

  } catch (error) {
    logger.error('Upload profile picture error', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to upload profile picture'
    });
  }
}

module.exports = {
  // Lead-based authentication
  leadLogin,
  checkToken,
  
  // Traditional authentication
  login,
  phoneLogin,
  register,
  
  // Shared
  getCurrentUser,
  verifyAuth,
  logout,
  verifyLeadToken,
  generateSessionToken,
  syncLeadProducts,
  
  // Profile management
  updateProfile,
  uploadProfilePicture
};
