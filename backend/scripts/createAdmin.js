import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';
import { fingerprint } from '../crypto/rsa.js';
import { getPublicKey } from '../crypto/keyManager.js';

dotenv.config();

const createAdminUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Check if admin user already exists
    // Lookup by fingerprint to avoid relying on plaintext email storage
    const pubKey = getPublicKey('user-data');
    const fpAdmin = fingerprint('admin@gmail.com', pubKey);
    const existingAdmin = await User.findOne({ emailFingerprint: fpAdmin });
    
    if (existingAdmin) {
      const adminObj = typeof existingAdmin.getDecryptedData === 'function' ? existingAdmin.getDecryptedData() : existingAdmin.toJSON();
      console.log('Admin user already exists:', adminObj.email);
      if (existingAdmin.role !== 'admin') {
        existingAdmin.role = 'admin';
        await existingAdmin.save();
        console.log('Updated existing user to admin role');
      }
    } else {
      // Create admin user
      const adminUser = new User({
        name: 'Admin User',
        email: 'admin@gmail.com',
        password: 'admin123', // This will be hashed by the pre-save middleware
        phone: '+1234567890',
        role: 'admin',
        profileImage: ''
      });

      await adminUser.save();
      const createdObj = typeof adminUser.getDecryptedData === 'function' ? adminUser.getDecryptedData() : adminUser.toJSON();
      console.log('Admin user created successfully:', createdObj.email);
    }

    console.log('Admin setup completed');
    
  } catch (error) {
    console.error('Error setting up admin user:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

createAdminUser();
