import mongoose from 'mongoose';
import { encrypt, decrypt } from '../crypto/rsa.js';
import { getPublicKey, getPrivateKey } from '../crypto/keyManager.js';

// Function to generate unique 8-character alphanumeric ID
const generateUniquePropertyId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const propertySchema = new mongoose.Schema({
  propertyId: {
    type: String,
    unique: true,
    default: generateUniquePropertyId
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // ── Plaintext fields (transient — wiped after encryption) ──────────────────
  // These exist in Mongoose only long enough for the pre('save') hook to run.
  title: {
    type: String,
    trim: true,
    select: false
  },
  description: {
    type: String,
    select: false
  },
  location: {
    type: String,
    select: false
  },
  latitude: {
    type: Number,
    select: false
  },
  longitude: {
    type: Number,
    select: false
  },

  // ── Encrypted PII fields (the only data persisted in MongoDB) ──────────────
  titleEncrypted:       { type: String, default: '' },
  descriptionEncrypted: { type: String, default: '' },
  locationEncrypted:    { type: String, default: '' },
  latitudeEncrypted:    { type: String, default: '' },
  longitudeEncrypted:   { type: String, default: '' },
  priceEncrypted:       { type: String, default: '' },
  bedroomsEncrypted:    { type: String, default: '' },
  bathroomsEncrypted:   { type: String, default: '' },
  areaEncrypted:        { type: String, default: '' },
  sizeEncrypted:        { type: String, default: '' },
  propertyTypeEncrypted:{ type: String, default: '' },
  typeEncrypted:        { type: String, default: '' },
  amenitiesEncrypted:   { type: String, default: '' }, // JSON stringified array

  // Flag indicating this document has been encrypted
  isEncrypted: { type: Boolean, default: false },

  coordinates: {
    latitude: { type: Number, select: false },
    longitude: { type: Number, select: false }
  },
  price: {
    type: Number,
    min: 0,
    select: false
  },
  bedrooms: {
    type: Number,
    select: false
  },
  bathrooms: {
    type: Number,
    select: false
  },
  area: {
    type: Number,
    min: 0,
    select: false
  },
  // Frontend uses `size` as well; keep both for compatibility
  size: {
    type: Number,
    min: 0,
    select: false
  },
  propertyType: {
    type: String,
    enum: ['apartment', 'house', 'condo', 'villa', 'studio'],
    select: false
  },
  // Frontend uses `type` field; keep a relaxed enum
  type: {
    type: String,
    enum: ['Apartment', 'House', 'Shop', 'Commercial Space', 'Land'],
    select: false
  },
  images: [{
    type: String
  }],
  amenities: [{
    type: String
  }],
  availabilityStatus: {
    type: String,
    enum: ['Available', 'Booked', 'Not Available', 'Under Construction', 'Pre-booking Available'],
    default: 'Available'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// ─── Pre-save: RSA encryption of property data ──────────────────────────────
propertySchema.pre('save', async function () {
  // Detect if any encryptable field was modified
  const encryptableFields = ['title', 'description', 'location', 'latitude', 'longitude',
    'price', 'bedrooms', 'bathrooms', 'area', 'size', 'propertyType', 'type', 'amenities'];

  const anyChanged = encryptableFields.some(f => this.isModified(f));
  if (!anyChanged) return;

  let pubKey;
  try {
    pubKey = getPublicKey('user-data');
  } catch (e) {
    throw new Error('Encryption keys unavailable; cannot save property data at this time');
  }

  try {
    if (this.isModified('title') && this.title != null) {
      this.titleEncrypted = encrypt(String(this.title), pubKey);
      this.title = undefined;
    }
    if (this.isModified('description') && this.description != null) {
      this.descriptionEncrypted = encrypt(String(this.description), pubKey);
      this.description = undefined;
    }
    if (this.isModified('location') && this.location != null) {
      this.locationEncrypted = encrypt(String(this.location), pubKey);
      this.location = undefined;
    }
    if ((this.isModified('latitude') && this.latitude != null) || (this.isModified('coordinates.latitude') && this.coordinates?.latitude != null)) {
      const lat = this.latitude != null ? this.latitude : this.coordinates.latitude;
      this.latitudeEncrypted = encrypt(String(lat), pubKey);
      this.latitude = undefined;
      if (this.coordinates) this.coordinates.latitude = undefined;
    }
    if ((this.isModified('longitude') && this.longitude != null) || (this.isModified('coordinates.longitude') && this.coordinates?.longitude != null)) {
      const lng = this.longitude != null ? this.longitude : this.coordinates.longitude;
      this.longitudeEncrypted = encrypt(String(lng), pubKey);
      this.longitude = undefined;
      if (this.coordinates) this.coordinates.longitude = undefined;
    }
    if (this.isModified('price') && this.price != null) {
      this.priceEncrypted = encrypt(String(this.price), pubKey);
      this.price = undefined;
    }
    if (this.isModified('bedrooms') && this.bedrooms != null) {
      this.bedroomsEncrypted = encrypt(String(this.bedrooms), pubKey);
      this.bedrooms = undefined;
    }
    if (this.isModified('bathrooms') && this.bathrooms != null) {
      this.bathroomsEncrypted = encrypt(String(this.bathrooms), pubKey);
      this.bathrooms = undefined;
    }
    if (this.isModified('area') && this.area != null) {
      this.areaEncrypted = encrypt(String(this.area), pubKey);
      this.area = undefined;
    }
    if (this.isModified('size') && this.size != null) {
      this.sizeEncrypted = encrypt(String(this.size), pubKey);
      this.size = undefined;
    }
    if (this.isModified('propertyType') && this.propertyType != null) {
      this.propertyTypeEncrypted = encrypt(String(this.propertyType), pubKey);
      this.propertyType = undefined;
    }
    if (this.isModified('type') && this.type != null) {
      this.typeEncrypted = encrypt(String(this.type), pubKey);
      this.type = undefined;
    }
    if (this.isModified('amenities') && this.amenities && this.amenities.length > 0) {
      this.amenitiesEncrypted = encrypt(JSON.stringify(this.amenities), pubKey);
      // Keep amenities array empty in DB — the encrypted blob has the real data
      this.amenities = [];
    }

    this.isEncrypted = true;
  } catch (err) {
    console.error('[Property] RSA encryption error during save:', err.message);
    throw err;
  }
});

// ─── Post-save: Wipe plaintext from MongoDB immediately ─────────────────────
propertySchema.post('save', async function () {
  try {
    await this.constructor.collection.updateOne(
      { _id: this._id },
      { $unset: { title: '', description: '', location: '', latitude: '',
                  longitude: '', price: '', bedrooms: '', bathrooms: '',
                  area: '', size: '', propertyType: '', type: '',
                  coordinates: '' } }
    );
  } catch (err) {
    console.error('[Property] Failed to wipe plaintext after save:', err.message);
  }
});

// ─── Instance method: decrypt all encrypted fields ──────────────────────────
propertySchema.methods.getDecryptedData = function () {
  const obj = this.toObject();

  // If owner is populated, ensure it is decrypted by calling its own toJSON/getDecryptedData
  if (this.owner && typeof this.owner.toJSON === 'function') {
    obj.owner = this.owner.toJSON();
  }
  if (this.isEncrypted) {
    try {
      const privKey = getPrivateKey('user-data');
      if (this.titleEncrypted)       obj.title       = decrypt(this.titleEncrypted, privKey);
      if (this.descriptionEncrypted) obj.description = decrypt(this.descriptionEncrypted, privKey);
      if (this.locationEncrypted)    obj.location    = decrypt(this.locationEncrypted, privKey);
      if (this.latitudeEncrypted) {
        const val = decrypt(this.latitudeEncrypted, privKey);
        obj.latitude = parseFloat(val);
        if (!obj.coordinates) obj.coordinates = {};
        obj.coordinates.latitude = obj.latitude;
      }
      if (this.longitudeEncrypted) {
        const val = decrypt(this.longitudeEncrypted, privKey);
        obj.longitude = parseFloat(val);
        if (!obj.coordinates) obj.coordinates = {};
        obj.coordinates.longitude = obj.longitude;
      }
      if (this.priceEncrypted) {
        obj.price = parseFloat(decrypt(this.priceEncrypted, privKey));
      }
      if (this.bedroomsEncrypted) {
        obj.bedrooms = parseInt(decrypt(this.bedroomsEncrypted, privKey), 10);
      }
      if (this.bathroomsEncrypted) {
        obj.bathrooms = parseInt(decrypt(this.bathroomsEncrypted, privKey), 10);
      }
      if (this.areaEncrypted) {
        obj.area = parseFloat(decrypt(this.areaEncrypted, privKey));
      }
      if (this.sizeEncrypted) {
        obj.size = parseFloat(decrypt(this.sizeEncrypted, privKey));
      }
      if (this.propertyTypeEncrypted) {
        obj.propertyType = decrypt(this.propertyTypeEncrypted, privKey);
      }
      if (this.typeEncrypted) {
        obj.type = decrypt(this.typeEncrypted, privKey);
      }
      if (this.amenitiesEncrypted) {
        try {
          obj.amenities = JSON.parse(decrypt(this.amenitiesEncrypted, privKey));
        } catch { obj.amenities = []; }
      }
    } catch (e) {
      console.error('[Property] Decryption error:', e.message);
    }
  }
  // Strip encrypted blobs from response
  delete obj.titleEncrypted;
  delete obj.descriptionEncrypted;
  delete obj.locationEncrypted;
  delete obj.latitudeEncrypted;
  delete obj.longitudeEncrypted;
  delete obj.priceEncrypted;
  delete obj.bedroomsEncrypted;
  delete obj.bathroomsEncrypted;
  delete obj.areaEncrypted;
  delete obj.sizeEncrypted;
  delete obj.propertyTypeEncrypted;
  delete obj.typeEncrypted;
  delete obj.amenitiesEncrypted;
  return obj;
};

/**
 * toJSON — automatically decrypts property data so that every JSON response
 * (including nested populate results) returns readable values.
 */
propertySchema.methods.toJSON = function () {
  return this.getDecryptedData();
};

// Index for geospatial queries
propertySchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });
propertySchema.index({ availabilityStatus: 1 });

export default mongoose.model('Property', propertySchema);