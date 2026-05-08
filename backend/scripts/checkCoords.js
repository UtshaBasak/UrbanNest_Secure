import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import connectDB from '../config/db.js';

connectDB().then(async () => {
  const props = await mongoose.connection.db.collection('properties').find({ coordinates: { $exists: true } }).toArray();
  console.log('Properties with coordinates:', props.length);
  if(props.length > 0) {
    console.log(props[0]);
  }
  process.exit(0);
});
