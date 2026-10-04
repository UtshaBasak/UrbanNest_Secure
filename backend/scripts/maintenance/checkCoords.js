import '../../config/env.js';
import mongoose from 'mongoose';
import connectDB from '../../config/db.js';

connectDB().then(async () => {
  const props = await mongoose.connection.db.collection('properties').find({ coordinates: { $exists: true } }).toArray();
  console.log('Properties with coordinates:', props.length);
  if(props.length > 0) {
    console.log(props[0]);
  }
  process.exit(0);
});
