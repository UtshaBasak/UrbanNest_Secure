import '../../config/env.js';
import mongoose from 'mongoose';
import connectDB from '../../config/db.js';
import { initializeAllKeys, getPublicKey } from '../../crypto/keyManager.js';
import { fingerprint } from '../../crypto/rsa.js';
import User from '../../models/User.js';

async function run() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run script:fingerprint -- <email>');
    process.exit(2);
  }
  try {
    await connectDB();
    await initializeAllKeys();
    const pub = getPublicKey('user-data');
    const fp = fingerprint(email.toLowerCase(), pub);
    console.log('Computed fingerprint:', fp);

    const coll = mongoose.connection.collection('users');
    const indexes = await coll.indexes();
    console.log('Users collection indexes (full):', JSON.stringify(indexes, null, 2));

    const docsByFp = await coll.find({ emailFingerprint: fp }).toArray();
    console.log('Found documents by fingerprint count:', docsByFp.length);
    for (const d of docsByFp) {
      console.log('ByFP -> Document _id:', d._id, 'isActive:', d.isActive, 'emailFingerprint:', d.emailFingerprint, 'email:', d.email);
    }

    const docsByEmail = await coll.find({ email: email.toLowerCase() }).toArray();
    console.log('Found documents by email (lowercase) count:', docsByEmail.length);
    for (const d of docsByEmail) {
      console.log('ByEmail -> Document _id:', d._id, 'isActive:', d.isActive, 'emailFingerprint:', d.emailFingerprint, 'email:', d.email);
    }
    const countEmailField = await coll.countDocuments({ email: { $exists: true, $ne: null, $ne: '' } });
    const countEmailFingerprintField = await coll.countDocuments({ emailFingerprint: { $exists: true, $ne: null, $ne: '' } });
    console.log('\nCounts:');
    console.log('Documents with email field present:', countEmailField);
    console.log('Documents with emailFingerprint present and not empty:', countEmailFingerprintField);

    console.log('\nSample of first 5 user documents:');
    const sample = await coll.find({}).limit(5).toArray();
    for (const s of sample) {
      console.log('SAMPLE -> _id:', s._id, 'email:', s.email, 'emailFingerprint:', s.emailFingerprint, 'isActive:', s.isActive);
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
