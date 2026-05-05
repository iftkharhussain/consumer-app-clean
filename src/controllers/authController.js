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
const QuoteSession = require('../schema/QuoteSession');
const logger = require('../utils/logger');
const lmsApiService = require('../services/lmsApiService');

// Lock to prevent concurrent syncs for same user+lead
const syncLocks = new Map();
// Legacy: Direct DB access - to be deprecated
// const lmsDB = require('../config/lmsCollections');

// Use the same secret as the lead system for cross-app tokens
const CROSS_APP_SECRET = process.env.CROSS_APP_JWT_SECRET || process.env.JWT_SECRET || 'cross-app-secret-key-change-in-production';

// Session JWT secret (for consumer app sessions)
const SESSION_SECRET = process.env.JWT_SECRET || 'session-secret-change-in-production';

// Session expiry (7 days)
const SESSION_EXPIRY = '7d';

/**
 * Map product name/slug to frontend route
 * @param {string} product - Product name or slug from token
 * @returns {string} Frontend route to redirect to
 */
function getProductRedirectUrl(product) {
  if (!product) return '/dashboard';

  // Normalize product to lowercase for comparison
  const normalizedProduct = product.toLowerCase().replace(/\s+/g, '-');

  // Product slug to route mapping
  const productRoutes = {
    'car-insurance': '/result',
    'auto-insurance': '/result',
    'automobile': '/result',
    'home-insurance': '/home-insurance',
    'habitation': '/home-insurance',
    'life-insurance': '/life-insurance',
    'assurance-vie': '/life-insurance',
    'travel-insurance': '/travel-insurance',
    'assurance-voyage': '/travel-insurance',
  };

  // Check for exact match first
  if (productRoutes[normalizedProduct]) {
    return productRoutes[normalizedProduct];
  }

  // Check for partial match (e.g., "Assurance Auto" contains "auto")
  for (const [key, route] of Object.entries(productRoutes)) {
    if (normalizedProduct.includes(key) || key.includes(normalizedProduct)) {
      return route;
    }
  }

  // Default to dashboard if no matching product route
  return '/dashboard';
}

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
 * @param {string} leadId - Optional lead ID from LMS
 * @returns {string} Session JWT
 */
function generateSessionToken(user, leadId = null) {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      phone: user.phone,
      leadId: leadId || user.leadSystemInfo?.leadId || null,
      type: 'session'
    },
    SESSION_SECRET,
    { expiresIn: SESSION_EXPIRY }
  );
}

/**
 * Sync lead products from LMS to consumer app
 * Fetches lead_products from LMS API and creates/updates user_products
 * 
 * Migration Note (Jan 2026):
 * Now uses lmsApiService.getLeadProducts() instead of direct DB access.
 * 
 * @param {ObjectId} userId - Consumer app user ID
 * @param {string} leadId - LMS lead ID (from token)
 * @returns {Promise<Array>} Created/updated user products
 */
async function syncLeadProducts(userId, leadId, quoteData = null, appLeadId = null) {
  try {
    const mongoose = require('mongoose');
    const { v4: uuidv4 } = require('uuid');
    const leadObjectId = new mongoose.Types.ObjectId(leadId);
    
    // Create lock key for this user+lead combination
    const lockKey = `${userId.toString()}_${leadId}`;
    
    // Check if sync already in progress for this user+lead
    if (syncLocks.has(lockKey)) {
      logger.info('Sync already in progress, waiting...', { userId, leadId, lockKey });
      // Wait for the existing sync to complete
      return await syncLocks.get(lockKey);
    }
    
    // Create a promise for this sync operation
    const syncPromise = (async () => {
      try {
        logger.info('Syncing lead products via API', { userId, leadId });

        // Fetch lead_products from LMS API (replaces direct DB access)
        const result = await lmsApiService.getLeadProducts(leadId);

    if (!result.success || !result.products || result.products.length === 0) {
      logger.info('No lead products found for leadId', { leadId, error: result.error });
      return [];
    }

    const leadProducts = result.products;
    logger.info('Found lead products from LMS API', { leadId, count: leadProducts.length });

    // Get appLeadId from the first product or use leadId as fallback
    let appLeadId = null;
    if (leadProducts.length > 0 && leadProducts[0].leadId) {
      appLeadId = leadProducts[0].leadId.toString();
    }
    
    // Filter to only products for THIS lead
    // Note: lead_products.leadId might point to all_leads._id OR all_leads.appLeadId
    const filteredProducts = leadProducts.filter(lp => {
      if (!lp.leadId) return false;
      const lpLeadId = lp.leadId.toString();
      return lpLeadId === leadId.toString() || (appLeadId && lpLeadId === appLeadId);
    });
    
    if (filteredProducts.length === 0) {
      logger.warn('No products found for this specific leadId after filtering', { 
        leadId, 
        appLeadId,
        totalProducts: leadProducts.length 
      });
      return [];
    }
    
    logger.info('Filtered products for current lead', { 
      leadId, 
      appLeadId,
      filtered: filteredProducts.length,
      total: leadProducts.length 
    });

    const syncedProducts = [];

    for (const lp of filteredProducts) {
      // Product info is already included in the API response
      const product = lp.product;

      // Extract vehicle name from this product's content for session label
      let vehicleName = 'Assurance Auto';
      if (lp.content) {
        try {
          const content = typeof lp.content === 'string' 
            ? JSON.parse(lp.content) 
            : lp.content;
          
          // Check for cars array (actual field name in form data)
          if (content?.cars && content.cars.length > 0) {
            const firstCar = content.cars[0];
            if (firstCar.vehicleDetails) {
              const make = firstCar.vehicleDetails.make || '';
              const model = firstCar.vehicleDetails.modelFr || firstCar.vehicleDetails.model || '';
              vehicleName = `${make} ${model}`.trim();
            } else {
              vehicleName = `${firstCar.manufacturer || ''} ${firstCar.model || ''}`.trim();
            }
          }
          // Fallback to vehicles array if it exists
          else if (content?.vehicles && content.vehicles.length > 0) {
            const firstVehicle = content.vehicles[0];
            vehicleName = `${firstVehicle.make || ''} ${firstVehicle.model || ''}`.trim();
          }
        } catch (e) {
          logger.warn('Could not parse vehicle name from content', { error: e.message });
        }
      }
      
      // Find or create quote session for this specific product data
      // Check if a session with the same vehicle name already exists for this user
      let quoteSession = await QuoteSession.findOne({ 
        userId,
        'label.vehicleName': vehicleName,
        status: 'active'
      });
      
      if (!quoteSession) {
        // Create new quote session for this product
        const sessionId = uuidv4();
        
        logger.info('🔵 [DEBUG] Creating new QuoteSession object', {
          userId: userId.toString(),
          leadId: (lp.leadId ? lp.leadId.toString() : leadObjectId.toString()),
          appLeadId: (lp.appLeadId ? lp.appLeadId.toString() : (appLeadId || leadObjectId.toString())),
          sessionId,
          vehicleName
        });
        
        // NEW SESSION IS ALWAYS ACTIVE - deactivate old sessions
        // Mark all existing sessions as inactive (new submission takes priority)
        await QuoteSession.updateMany(
          { userId, status: 'active', isActive: true },
          { $set: { isActive: false } }
        );
        
        logger.info('🔄 Deactivated old sessions for user', { userId: userId.toString() });
        
        quoteSession = new QuoteSession({
          userId,
          leadId: lp.leadId ? new mongoose.Types.ObjectId(lp.leadId) : leadObjectId,
          appLeadId: lp.appLeadId ? new mongoose.Types.ObjectId(lp.appLeadId) : (appLeadId ? new mongoose.Types.ObjectId(appLeadId) : leadObjectId),
          sessionId,
          label: {
            vehicleName,
            createdDate: new Date()
          },
          quoteData: lp.content || {},
          status: 'active',
          isActive: true, // NEW SESSION IS ALWAYS ACTIVE
          quoteStatus: 'pending',
          userProductIds: []
        });
        
        logger.info('🔵 [DEBUG] QuoteSession object created, about to save', {
          _id: quoteSession._id?.toString(),
          sessionId: quoteSession.sessionId,
          userId: quoteSession.userId?.toString(),
          isNew: quoteSession.isNew
        });
        
        try {
          const savedSession = await quoteSession.save();
          
          logger.info('🟢 [DEBUG] QuoteSession.save() completed', {
            savedId: savedSession._id?.toString(),
            sessionId: savedSession.sessionId,
            userId: savedSession.userId?.toString()
          });
          
          // Verify it's actually in the database
          const verifySession = await QuoteSession.findOne({ sessionId: savedSession.sessionId });
          if (verifySession) {
            logger.info('✅ [DEBUG] QuoteSession verified in database', {
              foundId: verifySession._id.toString(),
              sessionId: verifySession.sessionId
            });
          } else {
            logger.error('❌ [DEBUG] QuoteSession NOT FOUND in database after save!', {
              sessionId: savedSession.sessionId,
              userId: userId.toString()
            });
          }
          
          logger.info('Created quote session during sync', { 
            userId, 
            sessionId, 
            vehicleName,
            isActive: quoteSession.isActive,
            leadProductId: lp._id
          });
        } catch (saveError) {
          logger.error('❌ Failed to save quote session', {
            userId,
            sessionId,
            error: saveError.message,
            stack: saveError.stack,
            name: saveError.name,
            code: saveError.code
          });
          // Continue without session - don't fail the whole sync
        }
      } else {
        logger.info('Using existing quote session for vehicle', {
          userId,
          sessionId: quoteSession.sessionId,
          vehicleName
        });
      }

      // Check if user_product already exists for THIS specific lead + product
      // Each lead should have its own user_product (for multiple quote sessions)
      const existingProduct = await UserProduct.findOne({
        leadProductId: lp._id,
      });

      if (existingProduct) {
        // Update if exists - also update slug/name if they were missing
        existingProduct.userId = userId;
        existingProduct.leadId = lp.leadId ? new mongoose.Types.ObjectId(lp.leadId) : leadObjectId;
        
        // Update appLeadId if provided (new field)
        if (lp.appLeadId) {
          existingProduct.appLeadId = new mongoose.Types.ObjectId(lp.appLeadId);
        }
        
        // Update leadProductId to the current one
        existingProduct.leadProductId = lp._id;
        
        // Link to quote session
        existingProduct.quoteSessionId = quoteSession.sessionId;
        
        // Fix missing slug/name from previous buggy syncs
        if (!existingProduct.productSlug && product?.slug) {
          existingProduct.productSlug = product.slug;
        }
        if (!existingProduct.productName && (product?.name || product?.title)) {
          existingProduct.productName = product?.name || product?.title;
        }
        
        existingProduct.lmsMetadata = {
          ...existingProduct.lmsMetadata, // Preserve existing data like quoteData
          content: lp.content,
          isVisited: lp.isVisited,
          lmsStatus: lp.status
        };
        await existingProduct.save();
        syncedProducts.push(existingProduct);
      } else {
        // Create new user_product
        // Use slug from API if available, otherwise try to generate from title/name
        const productSlug = product?.slug || product?.key || null;
        const productName = product?.name || product?.title || null;
        
        const userProduct = new UserProduct({
          userId,
          leadId: lp.leadId ? new mongoose.Types.ObjectId(lp.leadId) : leadObjectId,
          appLeadId: lp.appLeadId ? new mongoose.Types.ObjectId(lp.appLeadId) : leadObjectId,
          leadProductId: lp._id,
          productId: product?._id || lp.productId,
          productSlug,
          productName,
          quoteSessionId: quoteSession.sessionId, // Link to session
          status: 'active',
          quoteStatus: 'not_requested',
          lmsMetadata: {
            content: lp.content,
            isVisited: lp.isVisited,
            lmsStatus: lp.status
            // quoteData will be added later by pollQuoteStatus when quote completes
          },
        });
        
        logger.info('Creating user_product', {
          userId,
          leadId: lp.leadId ? lp.leadId.toString() : leadId,
          productSlug,
          productName,
          productId: product?._id,
          sessionId: quoteSession.sessionId
        });
        
        await userProduct.save();
        syncedProducts.push(userProduct);
      }
      
      // Add product ID to session's userProductIds if not already there
      const lastProduct = syncedProducts[syncedProducts.length - 1];
      if (!quoteSession.userProductIds.some(id => id.toString() === lastProduct._id.toString())) {
        quoteSession.userProductIds.push(lastProduct._id);
        await quoteSession.save();
      }
    }

    logger.info('Synced lead products to user_products', {
      userId,
      leadId,
      syncedCount: syncedProducts.length,
      sessionsCreated: syncedProducts.map(p => p.quoteSessionId).filter((v, i, a) => a.indexOf(v) === i).length
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
      } finally {
        // Remove lock
        syncLocks.delete(lockKey);
      }
    })();
    
    // Store the promise in the lock map
    syncLocks.set(lockKey, syncPromise);
    
    // Wait for sync to complete
    return await syncPromise;
    
  } catch (error) {
    logger.error('Error in syncLeadProducts wrapper', {
      userId,
      leadId,
      error: error.message
    });
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
    const { user, isNew, credentialsMismatch, requiresManualLogin, showResubmitAlert } = await User.findOrCreateFromLead({
      phone: tokenData.phone,
      email: tokenData.email,
      fullName: tokenData.fullName,
      firstName: tokenData.firstName,
      lastName: tokenData.lastName,
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

       if (isNew) {
      console.log(' NEW USER CREATED:', user.email, user.fullName);
      
      // Send Welcome Email via Norga-App (LMS)
      // Note: No 'await' used to keep login fast (fire-and-forget)
     lmsApiService.lmsPost('/send-welcome-email', { type: 'welcome_email' }, {
  email: user.email,
  firstName: user.firstName || user.fullName?.split(' ')[0] || 'User',
  loginLink: 'https://app.norga.io'
}).catch(err => {
        logger.error(' Failed to trigger welcome email', { error: err.message });
      });

    } else {
      console.log('  EXISTING USER:', user.email, user.fullName);
    }



    // Sync lead products from LMS to user_products for both new and duplicate leads
    // This ensures products are always available even if previously deleted
    let userProducts = [];
    if (tokenData.leadId) {
      userProducts = await syncLeadProducts(user._id, tokenData.leadId);
    } else if (user.leadSystemInfo?.leadId) {
      // For duplicate leads, use existing leadId from user profile
      userProducts = await syncLeadProducts(user._id, user.leadSystemInfo.leadId);
    }

    // Generate session token with leadId for faster quote operations
    const leadId = tokenData.leadId || user.leadSystemInfo?.leadId;
    const sessionToken = generateSessionToken(user, leadId);

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
      showResubmitAlert: showResubmitAlert || false, // Show alert if user resubmitted with different info
      products, // Include synced products
      redirectTo: getProductRedirectUrl(tokenData.product) // Redirect based on product
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
 * Phone Login - Step 1: Verify Phone Exists
 * 
 * POST /api/auth/phone-login
 * Body: { phone: string }
 * 
 * This endpoint only verifies if a phone number is registered.
 * User must complete OTP verification to actually log in.
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

    // Clean phone number
    const cleanedPhone = phone.trim().replace(/[^\d+]/g, '');

    // Find user by phone
    const user = await User.findOne({ phone: cleanedPhone });

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

    // Verify this is a lead-based user with verified phone
    if (!user.leadSystemInfo?.isLeadUser || !user.phoneVerified) {
      return res.status(401).json({
        success: false,
        message: 'Phone login is only available for verified lead-based accounts. Please use email/password login.'
      });
    }

    logger.info('Phone verification successful - OTP will be sent', {
      userId: user._id,
      phone: cleanedPhone
    });

    // Return success - frontend will now send OTP
    return res.status(200).json({
      success: true,
      message: 'Phone verified. OTP will be sent.',
      requiresOTP: true,
      phone: cleanedPhone
    });
  } catch (error) {
    logger.error('Phone verification error', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during phone verification'
    });
  }
}

/**
 * Phone Login - Step 2: Complete Login After OTP Verification
 * 
 * POST /api/auth/phone-login-complete
 * Body: { phone: string }
 * 
 * This endpoint is called AFTER successful OTP verification to complete the login.
 */
async function phoneLoginComplete(req, res) {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Clean phone number
    const cleanedPhone = phone.trim().replace(/[^\d+]/g, '');

    // Find user by phone
    const user = await User.findOne({ phone: cleanedPhone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
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
    await user.recordLogin('phone-otp');

    // Generate session token
    const sessionToken = generateSessionToken(user);

    logger.info('Phone login completed successfully', {
      userId: user._id,
      phone: cleanedPhone
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
  phoneLoginComplete,
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
