import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt, fingerprint } from '../crypto/rsa.js';
import { getPublicKey, getPrivateKey } from '../crypto/keyManager.js';

const userSchema = new mongoose.Schema({
  // ── Plaintext PII fields ──────────────────────────────────────────────────
  // These are NEVER returned in DB queries (select:false) and are immediately
  // $unset from MongoDB by the post('save') hook. They exist in Mongoose only
  // long enough for the pre('save') encryption hook to run.
  name: {
    type: String,
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    select: false   // never returned from DB queries
  },
  email: {
    type: String,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    select: false   // never returned from DB queries; lookup via emailFingerprint
  },
  phone: {
    type: String,
    select: false   // never returned from DB queries
  },

  // ── Encrypted PII fields (the only PII persisted in MongoDB) ─────────────
  nameEncrypted:     { type: String, default: '' },
  emailEncrypted:    { type: String, default: '' },
  // emailFingerprint is a deterministic RSA token used for safe equality-lookup
  emailFingerprint:  { type: String, default: '', index: true, unique: true, sparse: true },
  phoneEncrypted:    { type: String, default: '' },

  // ── Auth fields ───────────────────────────────────────────────────────────
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false
  },
  passwordSalt: { type: String, default: '', select: false },

  // ── Profile & role ────────────────────────────────────────────────────────
  role: {
    type: String,
    enum: ['admin', 'owner', 'tenant'],
    default: 'tenant'
  },
  profileImage: { type: String, default: '' },
  favourites: [
    {
      itemId:   { type: mongoose.Schema.Types.ObjectId, required: true },
      itemType: { type: String, enum: ['owner', 'property'], required: true },
      addedAt:  { type: Date, default: Date.now }
    }
  ],

  // ── Status flags ──────────────────────────────────────────────────────────
  isActive:          { type: Boolean, default: true },
  isEmailVerified:   { type: Boolean, default: false },
  twoFactorEnabled:  { type: Boolean, default: false },
  passwordChangedAt: { type: Date,    default: null },
  failedLoginAttempts: { type: Number, default: 0, select: false },
  lockUntil:         { type: Date,    default: null, select: false },
  isEncrypted:       { type: Boolean, default: false },
}, { timestamps: true });

// ─── Pre-save: Password hashing ───────────────────────────────────────────────
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const userSalt = bcrypt.genSaltSync(4);
  this.passwordSalt = userSalt;
  const combined = this.password + userSalt;
  const bcryptSalt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(combined, bcryptSalt);
  this.passwordChangedAt = new Date();
});

// ─── Pre-save: RSA encryption of PII ─────────────────────────────────────────
userSchema.pre('save', async function () {
  const piiChanged = this.isModified('name') || this.isModified('email') || this.isModified('phone');
  if (!piiChanged) return;

  let pubKey;
  try {
    pubKey = getPublicKey('user-data');
  } catch {
    console.warn('[User] RSA keys not ready — saving without PII encryption');
    return;
  }

  try {
    if (this.isModified('name') && this.name) {
      this.nameEncrypted = encrypt(this.name, pubKey);
    }
    if (this.isModified('email') && this.email) {
      this.emailEncrypted = encrypt(this.email, pubKey);
      this.emailFingerprint = fingerprint(this.email.toLowerCase(), pubKey);
    }
    if (this.isModified('phone') && this.phone) {
      this.phoneEncrypted = encrypt(this.phone, pubKey);
    }
    this.isEncrypted = true;
  } catch (err) {
    console.error('[User] RSA encryption error during save:', err.message);
  }
});

// ─── Post-save: Wipe plaintext PII from MongoDB immediately ──────────────────
// After every save the plaintext name/email/phone are removed from the
// database document so that only the encrypted ciphertext remains on disk.
userSchema.post('save', async function () {
  try {
    await this.constructor.collection.updateOne(
      { _id: this._id },
      { $unset: { name: '', email: '', phone: '' } }
    );
  } catch (err) {
    console.error('[User] Failed to wipe plaintext PII after save:', err.message);
  }
});

// ─── Instance methods ─────────────────────────────────────────────────────────

userSchema.methods.comparePassword = async function (candidatePassword) {
  const salt = this.passwordSalt || '';
  const combined = salt ? candidatePassword + salt : candidatePassword;
  return bcrypt.compare(combined, this.password);
};

userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > new Date();
};

userSchema.methods.incrementLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil <= new Date()) {
    this.failedLoginAttempts = 1;
    this.lockUntil = null;
  } else {
    this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
    if (this.failedLoginAttempts >= 5) {
      this.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
    }
  }
  await this.save();
};

userSchema.methods.resetLoginAttempts = async function () {
  if (this.failedLoginAttempts !== 0 || this.lockUntil) {
    this.failedLoginAttempts = 0;
    this.lockUntil = null;
    await this.save();
  }
};

userSchema.methods.isPasswordExpired = function () {
  if (!this.passwordChangedAt) return false;
  return (Date.now() - this.passwordChangedAt.getTime()) > 90 * 24 * 60 * 60 * 1000;
};

/**
 * Decrypt PII from the encrypted fields and return a sanitised plain object.
 * Sensitive auth fields and raw encrypted blobs are stripped from the result.
 */
userSchema.methods.getDecryptedData = function () {
  const obj = this.toObject();
  if (this.isEncrypted) {
    try {
      const privKey = getPrivateKey('user-data');
      if (this.nameEncrypted)  obj.name  = decrypt(this.nameEncrypted,  privKey);
      if (this.emailEncrypted) obj.email = decrypt(this.emailEncrypted, privKey);
      if (this.phoneEncrypted) obj.phone = decrypt(this.phoneEncrypted, privKey);
    } catch (e) {
      console.error('[User] Decryption error:', e.message);
    }
  }
  // Strip fields that must never leave the server
  delete obj.password;
  delete obj.passwordSalt;
  delete obj.nameEncrypted;
  delete obj.emailEncrypted;
  delete obj.emailFingerprint;
  delete obj.phoneEncrypted;
  delete obj.lockUntil;
  delete obj.failedLoginAttempts;
  return obj;
};

/**
 * toJSON — automatically decrypts PII so that every JSON response (including
 * nested populate results) returns readable name / email / phone.
 */
userSchema.methods.toJSON = function () {
  return this.getDecryptedData();
};

export default mongoose.model('User', userSchema);