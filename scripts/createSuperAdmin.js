#!/usr/bin/env node
/**
 * Create Super Admin User Script
 * 
 * This script creates the first super admin user for the consumer app.
 * Run this script once to set up the initial admin account.
 * 
 * Usage: node scripts/createSuperAdmin.js
 */

require('dotenv').config({ path: '.env.local' });
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
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/consumer-app');
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
      role: 'super_admin', // Add this field if you plan to use roles
      isAdmin: true // Add this field for admin identification
    });

    console.log('✅ Super admin user created successfully!');
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

  } catch (error) {
    console.error('❌ Error creating super admin:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Add role and admin fields to User schema if they don't exist
async function updateSchema() {
  try {
    // This will add indexes if they don't exist
    await User.collection.createIndex({ role: 1 });
    await User.collection.createIndex({ isAdmin: 1 });
  } catch (error) {
    // Ignore index creation errors (they might already exist)
  }
}

// Run the script
if (require.main === module) {
  console.log('🚀 Consumer App - Super Admin Setup');
  console.log('====================================');
  
  updateSchema().then(() => {
    createSuperAdmin();
  });
}

module.exports = { createSuperAdmin };