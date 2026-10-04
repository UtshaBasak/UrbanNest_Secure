import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  // Store deterministic fingerprint of email instead of plaintext
  emailFingerprint: {
    type: String,
    required: true,
    index: true,
  },
  otp: {
    type: String,
    required: true,
  },
  purpose: {
    type: String,
    required: true,
    enum: ['signup', 'forgot-password', 'email-change', '2fa-login'],
  },
  // Account the code belongs to (email changes), so it cannot be used by another session
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // Wrong guesses so far; the code is deleted after too many
  attempts: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// TTL index: MongoDB will auto-delete documents after expiresAt
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Index for fast lookups (fingerprint + purpose)
otpSchema.index({ emailFingerprint: 1, purpose: 1 });

export default mongoose.model('Otp', otpSchema);
