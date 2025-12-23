#!/usr/bin/env node
/**
 * Create Super Admin User Script
 * 
 * This script creates the first super admin user for the consumer app.
 * Run this script once to set up the initial admin account.
 * 
 * Usage: 
 *   Local:      node scripts/createSuperAdmin.js
 *   Production: NODE_ENV=production node scripts/createSuperAdmin.js
 */

const path = require('path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/schema/User');

// Super admin user details
const SUPER_ADMIN = {
  email: 'admin@norga.io',
  password: 'Admin123!', // Change this to a secure password
  phone: '+1-555-0123', // Change this to actual admin phone
  firstName: 'Super',
  lastName: 'Admin',
  fullName: 'Super Admin'
};

async function createSuperAdmin() {
  let connection = null;
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    console.log('   URI:', process.env.MONGODB_URI);
    connection = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ 
      $or: [
        { email: SUPER_ADMIN.email },
        { phone: SUPER_ADMIN.phone }
      ]
    });

    if (existingAdmin) {
      console.log('⚠️  Super admin user already exists:');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Phone: ${existingAdmin.phone}`);
      console.log(`   Created: ${existingAdmin.createdAt}`);
      await mongoose.disconnect();
      process.exit(0);
    }

    // Hash password
    console.log('🔐 Hashing password...');
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(SUPER_ADMIN.password, saltRounds);

    // Create super admin user
    console.log('👤 Creating super admin user...');
    const adminUser = await User.create({
      email: SUPER_ADMIN.email,
      password: hashedPassword,
      phone: SUPER_ADMIN.phone,
      firstName: SUPER_ADMIN.firstName,
      lastName: SUPER_ADMIN.lastName,
      fullName: SUPER_ADMIN.fullName,
      authMethod: 'password',
      emailVerified: true,
      phoneVerified: true,
      status: 'active',
      role: 'super_admin',
      isAdmin: true
    });

    console.log('✅ Super admin user created successfully!');
    console.log('✅ User ID:', adminUser._id.toString());
    console.log('');
    console.log('📋 Login Credentials:');
    console.log('========================');
    console.log(`Email:    ${SUPER_ADMIN.email}`);
    console.log(`Password: ${SUPER_ADMIN.password}`);
    console.log(`Phone:    ${SUPER_ADMIN.phone}`);
    console.log('========================');
    console.log('');
    console.log('🚨 IMPORTANT: Change the default password after first login!');
    console.log('');
    console.log('🌐 You can now login at: http://localhost:3025/login');

    // Wait a bit to ensure write is committed
    await new Promise(resolve => setTimeout(resolve, 1000));

  } catch (error) {
    console.error('❌ Error creating super admin:', error.message);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  } finally {
    // Close MongoDB connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('🔌 Disconnected from MongoDB');
    }
  }
}

// Run the script
if (require.main === module) {
  console.log('🚀 Consumer App - Super Admin Setup');
  console.log('====================================');
  
  createSuperAdmin();
}

module.exports = { createSuperAdmin };