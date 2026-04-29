import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Otp from '../models/Otp.js';
import { initializeAllKeys, getPublicKey } from '../crypto/keyManager.js';
import { fingerprint } from '../crypto/rsa.js';

dotenv.config();

async function migrate() {
  try {
    await connectDB();
    console.log('[migratePlaintext] Connected to DB');

    // Ensure RSA keys are available
    await initializeAllKeys();
    const pubKey = getPublicKey('user-data');

    const userColl = mongoose.connection.collection('users');
    // Drop any index that references the plaintext `email` field
    const userIndexes = await userColl.indexes();
    for (const idx of userIndexes) {
      if (idx.key && (idx.key.email === 1 || idx.key.email === -1)) {
        try {
          console.log('[migratePlaintext] Dropping index on `email`:', idx.name);
          await userColl.dropIndex(idx.name);
        } catch (e) {
          console.error('[migratePlaintext] Failed to drop index', idx.name, e.message || e);
        }
      }
    }

    // Ensure unique index on emailFingerprint exists
    try {
      await userColl.createIndex({ emailFingerprint: 1 }, { unique: true, sparse: true });
      console.log('[migratePlaintext] Ensured unique index on emailFingerprint');
    } catch (e) {
      console.error('[migratePlaintext] Could not create emailFingerprint index:', e.message || e);
    }

    // Find users that still have plaintext name/email/phone stored
    const cursor = User.find({
      $or: [
        { name: { $exists: true, $ne: '' } },
        { email: { $exists: true, $ne: '' } },
        { phone: { $exists: true, $ne: '' } }
      ]
    }).cursor();

    let count = 0;
    for await (const user of cursor) {
      try {
        // If already encrypted, just ensure fingerprint exists and wipe plaintext
        if (user.isEncrypted) {
          if ((!user.emailFingerprint || user.emailFingerprint === '') && user.email) {
            const fp = fingerprint(user.email.toLowerCase(), pubKey);
            await user.constructor.collection.updateOne({ _id: user._id }, { $set: { emailFingerprint: fp } });
            console.log('[migratePlaintext] Set missing fingerprint for', String(user._id));
          }
          await user.constructor.collection.updateOne({ _id: user._id }, { $unset: { name: '', email: '', phone: '' } });
          count++;
          continue;
        }

        // Not encrypted yet — save via Mongoose so pre/post hooks run
        if (user.email) user.email = user.email.toLowerCase();
        await user.save();
        console.log('[migratePlaintext] Encrypted & wiped plaintext for', String(user._id));
        count++;
      } catch (err) {
        console.error('[migratePlaintext] Failed processing user', String(user._id), err.message || err);
      }
    }

    console.log('[migratePlaintext] Processed users:', count);

    // Migrate OTP documents: convert `email` -> `emailFingerprint`
    const otpColl = mongoose.connection.collection('otps');
    const otpsWithEmail = await otpColl.find({ email: { $exists: true } }).toArray();
    let otpCount = 0;
    for (const doc of otpsWithEmail) {
      try {
        if (!doc.email) continue;
        const fp = fingerprint(doc.email.toLowerCase(), pubKey);
        await otpColl.updateOne({ _id: doc._id }, { $set: { emailFingerprint: fp }, $unset: { email: '' } });
        otpCount++;
      } catch (err) {
        console.error('[migratePlaintext] Failed OTP doc', String(doc._id), err.message || err);
      }
    }
    console.log('[migratePlaintext] Migrated OTP docs:', otpCount);

    // Ensure OTP index
    try {
      await otpColl.createIndex({ emailFingerprint: 1, purpose: 1 });
      console.log('[migratePlaintext] Ensured OTP index on emailFingerprint+purpose');
    } catch (e) {
      console.error('[migratePlaintext] Could not create OTP index:', e.message || e);
    }

    console.log('[migratePlaintext] Migration complete. Verify data in MongoDB.');
  } catch (err) {
    console.error('[migratePlaintext] Migration failed:', err.message || err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrate();
