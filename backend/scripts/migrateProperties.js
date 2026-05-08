import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import Property from '../models/Property.js';
import { initializeAllKeys } from '../crypto/keyManager.js';
import connectDB from '../config/db.js';

const migrateProperties = async () => {
  try {
    await connectDB();
    await initializeAllKeys();

    console.log('Starting property encryption migration...');

    // Find all properties that are not encrypted.
    // Need to select all the plaintext fields explicitly because they are marked select: false
    const properties = await Property.find({ isEncrypted: { $ne: true } })
      .select('+title +description +location +latitude +longitude +price +bedrooms +bathrooms +area +size +propertyType +type +amenities');

    console.log(`Found ${properties.length} properties to migrate.`);

    let successCount = 0;
    let errorCount = 0;

    for (const property of properties) {
      try {
        console.log(`Migrating property ${property._id}...`);
        
        // In order to trigger the pre('save') hook, the fields must be marked as modified.
        // We can do this by assigning the field to itself.
        const encryptableFields = [
          'title', 'description', 'location', 'latitude', 'longitude',
          'price', 'bedrooms', 'bathrooms', 'area', 'size', 'propertyType', 'type', 'amenities'
        ];

        encryptableFields.forEach(field => {
          if (property[field] !== undefined && property[field] !== null) {
            property[field] = property[field];
            // Explicitly mark as modified to ensure mongoose hook runs
            property.markModified(field);
          }
        });

        // Add a flag to bypass any validations if necessary
        await property.save({ validateBeforeSave: false });
        successCount++;
        console.log(`Successfully migrated property ${property._id}`);
      } catch (err) {
        console.error(`Failed to migrate property ${property._id}:`, err);
        errorCount++;
      }
    }

    console.log('--- Migration Summary ---');
    console.log(`Total properties processed: ${properties.length}`);
    console.log(`Successfully encrypted: ${successCount}`);
    console.log(`Failed: ${errorCount}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Migration script failed:', error);
    process.exit(1);
  }
};

migrateProperties();
