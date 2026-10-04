import '../../config/env.js';
import connectDB from '../../config/db.js';
import { initializeAllKeys } from '../../crypto/keyManager.js';
import User from '../../models/User.js';

async function run() {
  const email = process.argv[2];
  const password = process.argv[3] || 'Test1234';
  if (!email) {
    console.error('Usage: node scripts/maintenance/tryInsertUser.js <email> [password]');
    process.exit(2);
  }
  try {
    await connectDB();
    await initializeAllKeys();
    const u = new User({ name: 'DebugUser', email: email.toLowerCase(), phone: '0000000000', password });
    try {
      const saved = await u.save();
      console.log('Saved user id:', saved._id);
    } catch (err) {
      console.error('Save error code:', err.code);
      console.error('Save error keyPattern:', err.keyPattern);
      console.error('Save error keyValue:', err.keyValue);
      console.error('Save error message:', err.message);
      console.error(err);
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    process.exit(0);
  }
}

run();
