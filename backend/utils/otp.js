import Otp from '../models/Otp.js';
import { sha512Hex } from '../crypto/sha512.js';
import { randomDigits } from '../crypto/random.js';

export const MAX_OTP_ATTEMPTS = 5;

export const generateOtp = () => randomDigits(6);

// OTPs are stored only as a salted SHA-512 digest
const hashOtp = (otp, emailFingerprint, purpose) => sha512Hex(`${purpose}|${emailFingerprint}|${String(otp)}`);

/**
 * Replace any pending code for this email + purpose with a new one.
 * `userId` binds the code to an account (used for email changes).
 */
export async function issueOtp({ emailFingerprint, purpose, userId = null }) {
  const otp = generateOtp();
  await Otp.deleteMany({ emailFingerprint: { $eq: emailFingerprint }, purpose: { $eq: purpose } });
  await Otp.create({ emailFingerprint, purpose, userId, otp: hashOtp(otp, emailFingerprint, purpose) });
  return otp;
}

/**
 * Check a submitted code. Returns { ok: true, record } or { ok: false, message }.
 * Wrong guesses are counted and the code is destroyed after MAX_OTP_ATTEMPTS,
 * so a 6-digit code cannot be brute-forced. A successful check consumes it.
 */
export async function consumeOtp({ emailFingerprint, purpose, otp, userId }) {
  const filter = { emailFingerprint: { $eq: emailFingerprint }, purpose: { $eq: purpose } };
  if (userId) filter.userId = { $eq: userId };
  const record = await Otp.findOne(filter);
  if (!record) return { ok: false, message: 'No verification code found. Please request a new one.' };
  if (record.expiresAt < new Date()) {
    await Otp.deleteOne({ _id: record._id });
    return { ok: false, message: 'Code has expired. Please request a new one.' };
  }
  if (typeof otp !== 'string' && typeof otp !== 'number') {
    return { ok: false, message: 'Invalid verification code' };
  }
  if (record.otp !== hashOtp(otp, emailFingerprint, purpose)) {
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      await Otp.deleteOne({ _id: record._id });
      return { ok: false, message: 'Too many incorrect attempts. Please request a new code.' };
    }
    await record.save();
    return { ok: false, message: 'Invalid verification code' };
  }
  await Otp.deleteOne({ _id: record._id });
  return { ok: true, record };
}
