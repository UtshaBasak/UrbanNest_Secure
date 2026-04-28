import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt, fingerprint } from '../crypto/rsa.js';
import { getPublicKey, getPrivateKey } from '../crypto/keyManager.js';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long']
  },
  nameEncrypted: { type: String, default: '' },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  emailEncrypted: { type: String, default: '' },
  emailFingerprint: { type: String, default: '', index: true },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false
  },
  passwordSalt: { type: String, default: '', select: false },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    validate: {
      validator: function(v) {
        // At least 5 digits total, allows +, spaces, -, (, )
        return v && /\d{5,}/.test(v.replace(/[\s\-().+]/g, ''));
      },
      message: 'Please enter a valid phone number (at least 5 digits)'
    }
  },
  phoneEncrypted: { type: String, default: '' },
  role: {
    type: String,
    enum: ['admin', 'owner', 'tenant'],
    default: 'tenant'
  },
  profileImage: { type: String, default: '' },
  favourites: [
    {
      itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
      itemType: { type: String, enum: ['owner', 'property'], required: true },
      addedAt: { type: Date, default: Date.now }
    }
  ],
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  twoFactorEnabled: { type: Boolean, default: false },
  passwordChangedAt: { type: Date, default: null },
  failedLoginAttempts: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, default: null, select: false },
  isEncrypted: { type: Boolean, default: false },
}, { timestamps: true });

// ─── Mongoose 8: async pre-save hooks must NOT call next() ────────────────────

// 1. Password hashing
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const userSalt = bcrypt.genSaltSync(4);
  this.passwordSalt = userSalt;
  const combined = this.password + userSalt;
  const bcryptSalt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(combined, bcryptSalt);
  this.passwordChangedAt = new Date();
});

// 2. RSA encryption of PII
userSchema.pre('save', async function () {
  const piiChanged = this.isModified('name') || this.isModified('email') || this.isModified('phone');
  if (!piiChanged) return;

  let pubKey;
  try {
    pubKey = getPublicKey('user-data');
  } catch {
    // Keys not ready — save plaintext, encrypt on next update
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
    // Never block save due to encryption failure — log and continue
    console.error('[User] RSA encryption error during save:', err.message);
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

userSchema.methods.getDecryptedData = function () {
  const obj = this.toObject();
  if (!this.isEncrypted) return obj;
  try {
    const privKey = getPrivateKey('user-data');
    if (this.nameEncrypted) obj.name = decrypt(this.nameEncrypted, privKey);
    if (this.emailEncrypted) obj.email = decrypt(this.emailEncrypted, privKey);
    if (this.phoneEncrypted) obj.phone = decrypt(this.phoneEncrypted, privKey);
  } catch (e) {
    console.error('[User] Decryption error:', e.message);
  }
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

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordSalt;
  delete obj.nameEncrypted;
  delete obj.emailEncrypted;
  delete obj.emailFingerprint;
  delete obj.phoneEncrypted;
  return obj;
};

export default mongoose.model('User', userSchema);