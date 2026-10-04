import '../../config/env.js';
import mongoose from 'mongoose';
import Property from '../../models/Property.js';
import User from '../../models/User.js';
import connectDB from '../../config/db.js';
import { initializeAllKeys } from '../../crypto/keyManager.js';

async function test() {
  await connectDB();
  await initializeAllKeys();
  const prop = await Property.findOne({ propertyId: '4K4U2XV2' }).populate('owner', 'nameEncrypted emailEncrypted isEncrypted');
  if (!prop) {
    console.log('Property not found');
    process.exit(1);
  }
  const json = prop.toJSON();
  console.log('Owner in JSON:', json.owner);
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
