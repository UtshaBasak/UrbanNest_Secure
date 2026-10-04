import '../../config/env.js';
import mongoose from 'mongoose';
import connectDB from '../../config/db.js';

async function run() {
  try {
    await connectDB();
    const coll = mongoose.connection.collection('users');
    const indexes = await coll.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Check for duplicate non-null emailFingerprint values
    console.log('Checking for duplicate emailFingerprint values...');
    const dupes = await coll.aggregate([
      { $match: { emailFingerprint: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$emailFingerprint', count: { $sum: 1 }, docs: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (dupes.length > 0) {
      console.error('Duplicate emailFingerprint values found — aborting index change.');
      for (const d of dupes) {
        console.error('Fingerprint:', d._id, 'count:', d.count, 'docs:', d.docs);
      }
      process.exit(2);
    }

    // Recreate the emailFingerprint index as unique+sparse. If an index with
    // the same name already exists we drop it first then recreate with the
    // desired options.
    const existingEmailFpIndex = indexes.find(i => JSON.stringify(i.key) === JSON.stringify({ emailFingerprint: 1 }));
    if (existingEmailFpIndex) {
      console.log('Dropping existing emailFingerprint index:', existingEmailFpIndex.name);
      await coll.dropIndex(existingEmailFpIndex.name);
      console.log('Dropped', existingEmailFpIndex.name);
    }
    console.log('Creating unique sparse index on emailFingerprint...');
    await coll.createIndex({ emailFingerprint: 1 }, { unique: true, sparse: true });
    console.log('Created index emailFingerprint_1 (unique, sparse)');

    // If email_1 exists and is unique, drop it because we rely on emailFingerprint for uniqueness
    const emailIndex = indexes.find(i => JSON.stringify(i.key) === JSON.stringify({ email: 1 }));
    if (emailIndex) {
      console.log('Dropping legacy email index:', emailIndex.name);
      await coll.dropIndex(emailIndex.name);
      console.log('Dropped index', emailIndex.name);
    } else {
      console.log('No legacy email index found to drop.');
    }

    console.log('Index migration complete.');
  } catch (e) {
    console.error('Error during index migration:', e);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
