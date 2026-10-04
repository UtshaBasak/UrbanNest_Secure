import '../config/env.js';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import { fingerprint } from '../crypto/rsa.js';
import { initializeAllKeys, getPublicKey } from '../crypto/keyManager.js';

/**
 * Creates (or promotes) the administrator account.
 *
 * Credentials are read from ADMIN_EMAIL / ADMIN_PASSWORD in the root `.env`
 * and fall back to development defaults. Always set your own values before
 * running this against a shared or production database.
 *
 * Usage: npm run create-admin   (from backend/)
 */
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@gmail.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin User';

const createAdminUser = async () => {
  try {
    await connectDB();
    // Keys must be loaded before fingerprinting or encrypting any PII
    await initializeAllKeys();

    // Lookup by fingerprint to avoid relying on plaintext email storage
    const pubKey = getPublicKey('user-data');
    const fpAdmin = fingerprint(ADMIN_EMAIL, pubKey);
    const existingAdmin = await User.findOne({ emailFingerprint: fpAdmin });

    if (existingAdmin) {
      console.log('Admin user already exists:', ADMIN_EMAIL);
      if (existingAdmin.role !== 'admin') {
        existingAdmin.role = 'admin';
        await existingAdmin.save();
        console.log('Updated existing user to admin role');
      }
    } else {
      const adminUser = new User({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD, // hashed by the pre-save middleware
        phone: process.env.ADMIN_PHONE || '+1234567890',
        role: 'admin',
        isEmailVerified: true,
        profileImage: ''
      });

      await adminUser.save();
      console.log('Admin user created successfully:', ADMIN_EMAIL);
      if (!process.env.ADMIN_PASSWORD) {
        console.warn('Using the default development password. Change it after first login.');
      }
    }

    console.log('Admin setup completed');
  } catch (error) {
    console.error('Error setting up admin user:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

createAdminUser();
