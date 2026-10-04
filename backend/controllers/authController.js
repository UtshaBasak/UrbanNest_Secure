import { generateSessionToken, verifySessionToken } from '../crypto/sessionToken.js';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { invalidatePropertyCache } from '../utils/propertyCache.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Booking from '../models/Booking.js';
import Review from '../models/Review.js';
import Notification from '../models/Notification.js';
import UserRating from '../models/UserRating.js';
import Otp from '../models/Otp.js';
import RefreshToken from '../models/RefreshToken.js';
import BlockedToken from '../models/BlockedToken.js';
import { hashToken } from '../middleware/auth.js';
import { sendOtpEmail } from '../config/emailService.js';
import { fingerprint, encrypt, decrypt } from '../crypto/rsa.js';
import { getPublicKey } from '../crypto/keyManager.js';
import { randomString } from '../crypto/random.js';
import { issueOtp, consumeOtp } from '../utils/otp.js';

// ─── Token helpers ───────────────────────────────────────────────────────────

const generateAccessToken = (userId, ip, userAgent) => {
  return generateSessionToken({ userId: String(userId), ip, userAgent }, 'session', 15 * 60);
};

const generateRefreshTokenString = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return randomString(64, chars) + '_' + Date.now().toString(36);
};

export const setAuthCookies = async (res, userId, ip, userAgent) => {
  const accessToken = generateAccessToken(userId, ip, userAgent);
  const refreshPlain = generateRefreshTokenString();
  // Encrypt refresh token before storing and issuing to client
  const sessPub = getPublicKey('session');
  const refreshEncrypted = encrypt(refreshPlain, sessPub);
  const refreshExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h absolute timeout

  await RefreshToken.create({
    userId, token: refreshEncrypted, ip, userAgent, expiresAt: refreshExpiry,
  });

  const cookieBase = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
  };
  res.cookie('accessToken', accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });
  res.cookie('refreshToken', refreshEncrypted, { ...cookieBase, maxAge: 24 * 60 * 60 * 1000 });
  // Legacy compat
  res.cookie('token', accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });
  return accessToken;
};

const clearAuthCookies = (res) => {
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' };
  res.clearCookie('accessToken', opts);
  res.clearCookie('refreshToken', opts);
  res.clearCookie('token', opts);
};

// ─── Password policy ─────────────────────────────────────────────────────────

export function validatePasswordPolicy(password) {
  const errors = [];
  if (password.length < 12) errors.push('Password must be at least 12 characters');
  if (password.length > 128) errors.push('Password must be at most 128 characters');
  if (!/[a-z]/.test(password)) errors.push('Must contain a lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('Must contain an uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('Must contain a digit');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('Must contain a special character');
  return errors;
}

// ─── User data helper ────────────────────────────────────────────────────────

function safeUserResponse(user) {
  const obj = typeof user.getDecryptedData === 'function' ? user.getDecryptedData() : user.toJSON();
  return {
    id: obj._id,
    name: obj.name,
    email: obj.email,
    phone: obj.phone,
    role: obj.role,
    profileImage: obj.profileImage,
    isEmailVerified: obj.isEmailVerified || false,
    twoFactorEnabled: obj.twoFactorEnabled || false,
    passwordExpired: typeof user.isPasswordExpired === 'function' ? user.isPasswordExpired() : false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Send OTP ────────────────────────────────────────────────────────────────
export const sendOtp = async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!email || !purpose) return res.status(400).json({ message: 'Email and purpose are required' });
    // Other purposes have dedicated flows that verify the account first
    // (forgot-password, change-email, login), so only sign-up codes are issued here
    const validPurposes = ['signup'];
    if (!validPurposes.includes(purpose)) return res.status(400).json({ message: 'Invalid purpose' });

    // Rate limit: max 1 OTP per email+purpose per 60s
    const pubKey = getPublicKey('user-data');
    const fpRecent = fingerprint(email.toLowerCase(), pubKey);
    const recent = await Otp.findOne({ emailFingerprint: { $eq: fpRecent }, purpose: { $eq: purpose }, createdAt: { $gt: new Date(Date.now() - 60000) } });
    if (recent) return res.status(429).json({ message: 'Please wait before requesting another code' });

    const otp = await issueOtp({ emailFingerprint: fpRecent, purpose });
    await sendOtpEmail(email, otp, purpose);

    res.json({ message: 'Verification code sent to your email' });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ message: error.message || 'Failed to send verification code' });
  }
};

// ─── Verify OTP ──────────────────────────────────────────────────────────────
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;
    if (!email || !otp || !purpose) return res.status(400).json({ message: 'Email, OTP, and purpose are required' });

    const pubKeyVerify = getPublicKey('user-data');
    const fpVerify = fingerprint(email.toLowerCase(), pubKeyVerify);
    if (purpose !== 'signup') return res.status(400).json({ message: 'Invalid purpose' });
    const check = await consumeOtp({ emailFingerprint: fpVerify, purpose, otp });
    if (!check.ok) return res.status(400).json({ message: check.message });

    // Return a short-lived verification token
    const verificationToken = generateSessionToken({ email: email.toLowerCase(), purpose, verified: true }, 'otp', 10 * 60);
    res.json({ message: 'Verification successful', verificationToken });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Verification failed' });
  }
};

// Helper: look up user by email using fingerprint (RSA-safe).
// Plaintext email is NEVER stored in the DB, so fingerprint is the only lookup path.
async function findUserByEmail(email) {
  const pubKey = getPublicKey('user-data'); // throws if keys not ready
  const fp = fingerprint(email.toLowerCase(), pubKey);
  const user = await User.findOne({ emailFingerprint: fp });
  // Confirm the decrypted address really matches, not just the fingerprint
  if (user && user.getDecryptedData().email?.toLowerCase() !== email.toLowerCase()) return null;
  return user;
}

// ─── Register ────────────────────────────────────────────────────────────────
export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation failed', errors: errors.array() });

    const { name, email, password, phone, role, profileImage, verificationToken } = req.body;

    if (!verificationToken) return res.status(400).json({ message: 'Email verification is required' });

    // Verify the provided OTP/session token and keep the decoded result
    let verificationDecoded;
    try {
      verificationDecoded = verifySessionToken(verificationToken, 'otp');
      if (!verificationDecoded.verified || verificationDecoded.purpose !== 'signup' || verificationDecoded.email !== email.toLowerCase()) {
        return res.status(400).json({ message: 'Invalid or expired email verification' });
      }
    } catch (e) {
      return res.status(400).json({ message: 'Email verification expired. Please verify again.' });
    }


    const policyErrors = validatePasswordPolicy(password);
    if (policyErrors.length > 0) return res.status(400).json({ message: 'Password does not meet requirements', errors: policyErrors });

    // Compute deterministic fingerprint and check for any existing record
    const pubKeyFp = getPublicKey('user-data');
    const fp = fingerprint(email.toLowerCase(), pubKeyFp);
    const existingUser = await User.findOne({ emailFingerprint: fp });
    if (existingUser && existingUser.isActive) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }
    if (existingUser) {
      // Only a deactivated record may be replaced, and only by someone who just
      // proved control of the email address with a sign-up code
      try {
        await Promise.all([
          User.deleteOne({ _id: existingUser._id }),
          RefreshToken.deleteMany({ userId: existingUser._id }),
          Otp.deleteMany({ emailFingerprint: fp })
        ]);
        console.log('[Auth] Removed existing user record to allow re-registration:', String(existingUser._id));
      } catch (cleanupErr) {
        console.error('[Auth] Failed to remove existing user record during registration:', cleanupErr);
        return res.status(500).json({ message: 'Server error during registration cleanup' });
      }
    }

    // Self-registration can only create tenant or owner accounts
    const safeRole = ['owner', 'tenant'].includes(role) ? role : 'tenant';
    const user = new User({ name, email, password, phone, role: safeRole, profileImage: profileImage || '', isEmailVerified: true });
    try {
      await user.save();
    } catch (err) {
      // Handle duplicate-key errors more robustly by inspecting the duplicate
      // key value (err.keyValue) and attempting to remove a stale/inactive
      // document matching that fingerprint, then retrying once.
      if (err && (err.code === 11000 || String(err).toLowerCase().includes('duplicate'))) {
        try {
          console.error('[Auth] Duplicate-key error during registration:', err.message || err);
          const dupFp = err.keyValue && err.keyValue.emailFingerprint ? err.keyValue.emailFingerprint : null;
          // If keyValue not provided, fall back to computing fingerprint
          const pubKeyFp2 = getPublicKey('user-data');
          const fp2 = dupFp || fingerprint(email.toLowerCase(), pubKeyFp2);

          // Try to find the conflicting document using the duplicate fingerprint
          const existing2 = await User.findOne({ emailFingerprint: fp2 });
          if (existing2) {
            if (!existing2.isActive) {
              await Promise.all([
                User.deleteOne({ _id: existing2._id }),
                RefreshToken.deleteMany({ userId: existing2._id }),
                Otp.deleteMany({ emailFingerprint: fp2 })
              ]);
              console.log('[Auth] Removed stale inactive user (duplicate-key) and retrying:', String(existing2._id));
              await user.save();
            } else {
              console.log('[Auth] Active user blocks registration (duplicate-key):', String(existing2._id));
              return res.status(400).json({ message: 'User already exists with this email' });
            }
          } else {
            // No document found even though duplicate-key triggered. This may
            // indicate an index corruption or race; log full error and fail
            console.error('[Auth] Duplicate-key reported but no document found for fingerprint:', fp2, 'err.keyValue=', err.keyValue);
            return res.status(500).json({ message: 'Registration conflict. Please try again or contact support.' });
          }
        } catch (cleanupErr) {
          console.error('[Auth] Error handling duplicate-key during registration:', cleanupErr);
          return res.status(500).json({ message: 'Server error during registration' });
        }
      } else {
        throw err;
      }
    }

    const ip = req.ip || '';
    const userAgent = req.headers['user-agent'] || '';
    await setAuthCookies(res, user._id, ip, userAgent);

    res.status(201).json({ message: 'User registered successfully', data: { user: safeUserResponse(user) } });
  } catch (error) {
    console.error('Registration error:', error.message, error.code || '');
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ message: messages.join('. ') });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation failed', errors: errors.array() });

    const { email, password } = req.body;
    // Plaintext email is never in the DB — always use fingerprint lookup
    let user;
    const pubKey = getPublicKey('user-data');
    const fp = fingerprint(email.toLowerCase(), pubKey);
    user = await User.findOne({ emailFingerprint: fp }).select('+password +passwordSalt +failedLoginAttempts +lockUntil +twoFactorEnabled +isEmailVerified +passwordChangedAt');
    if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid credentials' });

    // Account lockout check
    if (user.isLocked()) {
      const remaining = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ message: `Account locked due to too many failed attempts. Try again in ${remaining} minute(s).`, locked: true, remainingMinutes: remaining });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incrementLoginAttempts();
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Reset failed attempts on success
    await user.resetLoginAttempts();

    // Promote the configured admin account (only after the password is verified)
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
    if (adminEmail && email.toLowerCase() === adminEmail && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    // Two-factor authentication check
    if (user.twoFactorEnabled) {
      // Send OTP and return requires2FA
      const otp = await issueOtp({ emailFingerprint: fp, purpose: '2fa-login', userId: user._id });
      await sendOtpEmail(email, otp, '2fa-login');

      const tempToken = generateSessionToken({ userId: String(user._id), purpose: '2fa-pending' }, 'session', 10 * 60);
      return res.json({ message: 'Two-factor authentication required', requires2FA: true, tempToken });
    }

    // Password expiry check
    const passwordExpired = user.isPasswordExpired();

    const ip = req.ip || '';
    const userAgent = req.headers['user-agent'] || '';
    await setAuthCookies(res, user._id, ip, userAgent);

    res.json({ message: 'Login successful', data: { user: safeUserResponse(user) }, passwordExpired });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// ─── Verify 2FA (second step of login) ───────────────────────────────────────
export const verify2FA = async (req, res) => {
  try {
    const { tempToken, otp } = req.body;
    if (!tempToken || !otp) return res.status(400).json({ message: 'Token and OTP are required' });

    let decoded;
    try {
      decoded = verifySessionToken(tempToken, 'session');
    } catch { return res.status(400).json({ message: 'Session expired. Please log in again.' }); }

    if (decoded.purpose !== '2fa-pending') return res.status(400).json({ message: 'Invalid token' });

    const user = await User.findOne({ _id: { $eq: String(decoded.userId) } });
    if (!user || !user.isActive) return res.status(404).json({ message: 'User not found' });

    // email is not in plaintext in DB — decrypt it to locate the OTP record
    const decryptedUser = user.getDecryptedData();
    if (!decryptedUser.email) return res.status(500).json({ message: 'Unable to resolve user email' });
    const pubKey2faLookup = getPublicKey('user-data');
    const fp2faLookup = fingerprint(decryptedUser.email.toLowerCase(), pubKey2faLookup);
    const check = await consumeOtp({ emailFingerprint: fp2faLookup, purpose: '2fa-login', otp, userId: user._id });
    if (!check.ok) return res.status(400).json({ message: check.message });

    const ip = req.ip || '';
    const userAgent = req.headers['user-agent'] || '';
    await setAuthCookies(res, user._id, ip, userAgent);

    res.json({ message: 'Login successful', data: { user: safeUserResponse(user) }, passwordExpired: user.isPasswordExpired() });
  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ message: 'Verification failed' });
  }
};

// ─── Refresh token ───────────────────────────────────────────────────────────
export const refreshAccessToken = async (req, res) => {
  try {
    const refreshTokenStr = req.cookies.refreshToken;
    if (!refreshTokenStr) return res.status(401).json({ message: 'No refresh token' });

    // Atomically claim the token so two concurrent refreshes can't both succeed
    const record = await RefreshToken.findOneAndDelete({ token: String(refreshTokenStr) });
    if (!record || record.expiresAt < new Date()) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Refresh token expired. Please log in again.' });
    }

    // IP / User-Agent check
    const clientIp = req.ip || '';
    if (process.env.NODE_ENV === 'production' && record.ip && record.ip !== clientIp) {
      await RefreshToken.deleteMany({ userId: record.userId });
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Session security violation.' });
    }

    const user = await User.findById(record.userId);
    if (!user || !user.isActive) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'User not found' });
    }

    // Rotate refresh token (the old one was removed above)
    const ip = req.ip || '';
    const userAgent = req.headers['user-agent'] || '';
    await setAuthCookies(res, user._id, ip, userAgent);

    res.json({ message: 'Token refreshed', data: { user: safeUserResponse(user) }, passwordExpired: user.isPasswordExpired() });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ message: 'Token refresh failed' });
  }
};

// ─── Forgot Password ─────────────────────────────────────────────────────────
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await findUserByEmail(email);
    if (!user) return res.json({ message: 'If an account exists with this email, a verification code has been sent.' });

    const fpForgot = user.emailFingerprint;
    const recent = await Otp.findOne({ emailFingerprint: fpForgot, purpose: 'forgot-password', createdAt: { $gt: new Date(Date.now() - 60000) } });
    if (!recent) {
      const otp = await issueOtp({ emailFingerprint: fpForgot, purpose: 'forgot-password', userId: user._id });
      await sendOtpEmail(email, otp, 'forgot-password');
    }

    res.json({ message: 'If an account exists with this email, a verification code has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Reset Password ──────────────────────────────────────────────────────────
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ message: 'All fields are required' });

    const policyErrors = validatePasswordPolicy(newPassword);
    if (policyErrors.length > 0) return res.status(400).json({ message: 'Password does not meet requirements', errors: policyErrors });

    const account = await findUserByEmail(email);
    if (!account) return res.status(400).json({ message: 'Invalid or expired verification code' });
    const check = await consumeOtp({ emailFingerprint: account.emailFingerprint, purpose: 'forgot-password', otp, userId: account._id });
    if (!check.ok) return res.status(400).json({ message: check.message });

    const user = await User.findById(account._id).select('+password +passwordSalt');
    if (!user) return res.status(400).json({ message: 'Invalid or expired verification code' });

    user.password = newPassword;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
    // Invalidate all existing sessions (access tokens are rejected via passwordChangedAt)
    await RefreshToken.deleteMany({ userId: user._id });

    res.json({ message: 'Password reset successful. Please log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Logout ──────────────────────────────────────────────────────────────────
export const logout = async (req, res) => {
  try {
    // Block the access token
    const accessToken = req.cookies.accessToken || req.cookies.token;
    if (accessToken) {
      try {
        // decode payload unsafely to obtain expiry for blocklist
        const { decodeSessionTokenUnsafe } = await import('../crypto/sessionToken.js');
        const decoded = decodeSessionTokenUnsafe(accessToken);
        const expiresAt = new Date(((decoded && decoded.exp) || Math.floor(Date.now() / 1000) + 900) * 1000);
        await BlockedToken.create({ tokenHash: hashToken(accessToken), expiresAt });
      } catch {}
    }
    // Delete refresh token from DB
    const refreshTokenStr = req.cookies.refreshToken;
    if (refreshTokenStr) {
      await RefreshToken.deleteOne({ token: refreshTokenStr });
    }
    clearAuthCookies(res);
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    clearAuthCookies(res);
    res.json({ message: 'Logout successful' });
  }
};

// ─── Get Current User ────────────────────────────────────────────────────────
export const getCurrentUser = (req, res) => {
  res.json({ data: { user: safeUserResponse(req.user) } });
};

// ─── Update Current User ────────────────────────────────────────────────────
export const updateCurrentUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation failed', errors: errors.array() });

    const { name, phone, profileImage } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (profileImage !== undefined) user.profileImage = profileImage;
    await user.save();

    res.json({ message: 'Profile updated successfully', data: { user: safeUserResponse(user) } });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error during profile update' });
  }
};

// ─── Delete Current User ─────────────────────────────────────────────────────
export const deleteCurrentUser = async (req, res) => {
  const userId = req.user._id;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ message: 'Password is required to delete account' });
  }

  const userWithPassword = await User.findById(userId).select('+password +passwordSalt');
  if (!userWithPassword) return res.status(404).json({ message: 'User not found' });

  const isPasswordValid = await userWithPassword.comparePassword(password);
  if (!isPasswordValid) {
    return res.status(401).json({ message: 'Incorrect password' });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error('User not found');
      let propertyIds = [];
      if (user.role === 'owner') {
        const properties = await Property.find({ owner: userId }, '_id').session(session);
        propertyIds = properties.map(p => p._id);
      }
      const bookingFilter = user.role === 'owner'
        ? { $or: [{ tenant: userId }, { property: { $in: propertyIds } }] }
        : { tenant: userId };
      const reviewFilter = user.role === 'owner'
        ? { $or: [{ tenant: userId }, { property: { $in: propertyIds } }] }
        : { tenant: userId };
      await Promise.all([
        invalidatePropertyCache(),
        propertyIds.length ? Property.deleteMany({ _id: { $in: propertyIds } }).session(session) : Promise.resolve(),
        Booking.deleteMany(bookingFilter).session(session),
        Review.deleteMany(reviewFilter).session(session),
        Notification.deleteMany({ user: userId }).session(session),
        UserRating.deleteMany({ $or: [{ rater: userId }, { ratee: userId }] }).session(session),
      ]);
      await User.findByIdAndDelete(userId).session(session);
    });

    // Clean up tokens
    await RefreshToken.deleteMany({ userId });
    clearAuthCookies(res);
    return res.json({ message: 'Account and related data deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Server error during account deletion' });
  } finally {
    session.endSession();
  }
};