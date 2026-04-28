import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
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
import { fingerprint } from '../crypto/rsa.js';
import { getPublicKey } from '../crypto/keyManager.js';

// ─── Token helpers ───────────────────────────────────────────────────────────

const generateAccessToken = (userId, ip, userAgent) => {
  return jwt.sign({ userId, ip, userAgent }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

const generateRefreshTokenString = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result + '_' + Date.now().toString(36);
};

const setAuthCookies = async (res, userId, ip, userAgent) => {
  const accessToken = generateAccessToken(userId, ip, userAgent);
  const refreshTokenStr = generateRefreshTokenString();
  const refreshExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h absolute timeout

  await RefreshToken.create({
    userId, token: refreshTokenStr, ip, userAgent, expiresAt: refreshExpiry,
  });

  const cookieBase = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
  res.cookie('accessToken', accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });
  res.cookie('refreshToken', refreshTokenStr, { ...cookieBase, maxAge: 24 * 60 * 60 * 1000 });
  // Legacy compat
  res.cookie('token', accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });
  return accessToken;
};

const clearAuthCookies = (res) => {
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' };
  res.clearCookie('accessToken', opts);
  res.clearCookie('refreshToken', opts);
  res.clearCookie('token', opts);
};

// ─── OTP helpers ─────────────────────────────────────────────────────────────

function generateOtp() {
  let otp = '';
  for (let i = 0; i < 6; i++) otp += Math.floor(Math.random() * 10).toString();
  return otp;
}

function simpleHashOtp(otp) {
  let h = 0n;
  for (let i = 0; i < otp.length; i++) h = (h * 31n + BigInt(otp.charCodeAt(i))) % (2n ** 64n);
  return h.toString(16);
}

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
    const validPurposes = ['signup', 'forgot-password', 'email-change', '2fa-login'];
    if (!validPurposes.includes(purpose)) return res.status(400).json({ message: 'Invalid purpose' });

    // Rate limit: max 1 OTP per email+purpose per 60s
    const recent = await Otp.findOne({ email: email.toLowerCase(), purpose, createdAt: { $gt: new Date(Date.now() - 60000) } });
    if (recent) return res.status(429).json({ message: 'Please wait before requesting another code' });

    // Delete old OTPs for this email+purpose
    await Otp.deleteMany({ email: email.toLowerCase(), purpose });

    const otp = generateOtp();
    await Otp.create({ email: email.toLowerCase(), otp: simpleHashOtp(otp), purpose });
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

    const record = await Otp.findOne({ email: email.toLowerCase(), purpose });
    if (!record) return res.status(400).json({ message: 'No verification code found. Please request a new one.' });
    if (record.expiresAt < new Date()) {
      await Otp.deleteOne({ _id: record._id });
      return res.status(400).json({ message: 'Code has expired. Please request a new one.' });
    }
    if (record.otp !== simpleHashOtp(otp)) return res.status(400).json({ message: 'Invalid verification code' });

    await Otp.deleteOne({ _id: record._id });

    // Return a short-lived verification token
    const verificationToken = jwt.sign({ email: email.toLowerCase(), purpose, verified: true }, process.env.JWT_SECRET, { expiresIn: '10m' });
    res.json({ message: 'Verification successful', verificationToken });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Verification failed' });
  }
};

// Helper: look up user by email using fingerprint (RSA-safe)
async function findUserByEmail(email) {
  try {
    const pubKey = getPublicKey('user-data');
    const fp = fingerprint(email.toLowerCase(), pubKey);
    return await User.findOne({ emailFingerprint: fp });
  } catch {
    // Fallback to plaintext lookup if keys not ready
    return await User.findOne({ email: email.toLowerCase() });
  }
}

// ─── Register ────────────────────────────────────────────────────────────────
export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation failed', errors: errors.array() });

    const { name, email, password, phone, role, profileImage, verificationToken } = req.body;

    if (!verificationToken) return res.status(400).json({ message: 'Email verification is required' });
    try {
      const decoded = jwt.verify(verificationToken, process.env.JWT_SECRET);
      if (!decoded.verified || decoded.purpose !== 'signup' || decoded.email !== email.toLowerCase()) {
        return res.status(400).json({ message: 'Invalid or expired email verification' });
      }
    } catch (e) {
      return res.status(400).json({ message: 'Email verification expired. Please verify again.' });
    }

    const policyErrors = validatePasswordPolicy(password);
    if (policyErrors.length > 0) return res.status(400).json({ message: 'Password does not meet requirements', errors: policyErrors });

    const existingUser = await findUserByEmail(email);
    if (existingUser) return res.status(400).json({ message: 'User already exists with this email' });

    const user = new User({ name, email, password, phone, role: role || 'tenant', profileImage: profileImage || '', isEmailVerified: true });
    await user.save();

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
    res.status(500).json({ message: error.message || 'Server error during registration' });
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation failed', errors: errors.array() });

    const { email, password } = req.body;
    // Use fingerprint lookup to find RSA-encrypted user records
    let user;
    try {
      const pubKey = getPublicKey('user-data');
      const fp = fingerprint(email.toLowerCase(), pubKey);
      user = await User.findOne({ emailFingerprint: fp }).select('+password +passwordSalt +failedLoginAttempts +lockUntil +twoFactorEnabled +isEmailVerified +passwordChangedAt');
    } catch {
      user = await User.findOne({ email: email.toLowerCase() }).select('+password +passwordSalt +failedLoginAttempts +lockUntil +twoFactorEnabled +isEmailVerified +passwordChangedAt');
    }
    if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid credentials' });

    // Account lockout check
    if (user.isLocked()) {
      const remaining = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ message: `Account locked due to too many failed attempts. Try again in ${remaining} minute(s).`, locked: true, remainingMinutes: remaining });
    }

    // Admin role auto-assign
    if (email === 'utsha.basak.v2@gmail.com' && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incrementLoginAttempts();
      const attemptsLeft = Math.max(0, 5 - user.failedLoginAttempts);
      return res.status(401).json({ message: `Invalid credentials. ${attemptsLeft} attempt(s) remaining before lockout.` });
    }

    // Reset failed attempts on success
    await user.resetLoginAttempts();

    // Two-factor authentication check
    if (user.twoFactorEnabled) {
      // Send OTP and return requires2FA
      const otp = generateOtp();
      await Otp.deleteMany({ email: email.toLowerCase(), purpose: '2fa-login' });
      await Otp.create({ email: email.toLowerCase(), otp: simpleHashOtp(otp), purpose: '2fa-login' });
      await sendOtpEmail(email, otp, '2fa-login');

      const tempToken = jwt.sign({ userId: user._id, purpose: '2fa-pending' }, process.env.JWT_SECRET, { expiresIn: '10m' });
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
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch { return res.status(400).json({ message: 'Session expired. Please log in again.' }); }

    if (decoded.purpose !== '2fa-pending') return res.status(400).json({ message: 'Invalid token' });

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const record = await Otp.findOne({ email: user.email.toLowerCase(), purpose: '2fa-login' });
    if (!record || record.otp !== simpleHashOtp(otp)) return res.status(400).json({ message: 'Invalid verification code' });
    if (record.expiresAt < new Date()) return res.status(400).json({ message: 'Code expired' });

    await Otp.deleteOne({ _id: record._id });

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

    const record = await RefreshToken.findOne({ token: refreshTokenStr });
    if (!record || record.expiresAt < new Date()) {
      if (record) await RefreshToken.deleteOne({ _id: record._id });
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
      await RefreshToken.deleteOne({ _id: record._id });
      clearAuthCookies(res);
      return res.status(401).json({ message: 'User not found' });
    }

    // Rotate refresh token
    await RefreshToken.deleteOne({ _id: record._id });
    const ip = req.ip || '';
    const userAgent = req.headers['user-agent'] || '';
    await setAuthCookies(res, user._id, ip, userAgent);

    res.json({ message: 'Token refreshed', data: { user: safeUserResponse(user) } });
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
    // Always return success to prevent email enumeration
    if (!user) return res.json({ message: 'If an account exists with this email, a verification code has been sent.' });

    const otp = generateOtp();
    await Otp.deleteMany({ email: email.toLowerCase(), purpose: 'forgot-password' });
    await Otp.create({ email: email.toLowerCase(), otp: simpleHashOtp(otp), purpose: 'forgot-password' });
    await sendOtpEmail(email, otp, 'forgot-password');

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

    const record = await Otp.findOne({ email: email.toLowerCase(), purpose: 'forgot-password' });
    if (!record || record.otp !== simpleHashOtp(otp)) return res.status(400).json({ message: 'Invalid or expired verification code' });
    if (record.expiresAt < new Date()) return res.status(400).json({ message: 'Code expired' });

    // Use fingerprint-based lookup for RSA-encrypted email fields
    const user = await (async () => {
      try {
        const pubKey = getPublicKey('user-data');
        const fp = fingerprint(email.toLowerCase(), pubKey);
        return await User.findOne({ emailFingerprint: fp }).select('+password +passwordSalt');
      } catch {
        return await User.findOne({ email: email.toLowerCase() }).select('+password +passwordSalt');
      }
    })();
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.password = newPassword;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
    await Otp.deleteOne({ _id: record._id });
    // Invalidate all existing sessions
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
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET, { ignoreExpiration: true });
        const expiresAt = new Date((decoded.exp || Math.floor(Date.now() / 1000) + 900) * 1000);
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