import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';

dotenv.config({ path: '../.env' });

async function run() {
  try {
    await connectDB();
    const adminDb = mongoose.connection.db;
    console.log('Running validate on users collection (full)...');
    const res = await adminDb.command({ validate: 'users', full: true });
    console.log('Validate result:', JSON.stringify(res, null, 2));
  } catch (e) {
    console.error('Error during validate:', e);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
