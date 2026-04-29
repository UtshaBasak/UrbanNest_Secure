import User from '../models/User.js';
import Property from '../models/Property.js';
import Booking from '../models/Booking.js';
import Review from '../models/Review.js';
import Notification from '../models/Notification.js';
import UserRating from '../models/UserRating.js';
import Otp from '../models/Otp.js';
import mongoose from 'mongoose';
import { validatePasswordPolicy } from './authController.js';
import { sendOtpEmail } from '../config/emailService.js';
import { fingerprint } from '../crypto/rsa.js';
import { getPublicKey } from '../crypto/keyManager.js';

function simpleHashOtp(otp) {
  let h = 0n;
  for (let i = 0; i < otp.length; i++) h = (h * 31n + BigInt(otp.charCodeAt(i))) % (2n ** 64n);
  return h.toString(16);
}
function generateOtp() {
  let otp = '';
  for (let i = 0; i < 6; i++) otp += Math.floor(Math.random() * 10).toString();
  return otp;
}

// @desc Initiate email change
export const changeEmail = async (req, res) => {
  try {
    const { password, newEmail } = req.body;
    if (!password || !newEmail) return res.status(400).json({ message: 'Password and new email are required' });
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) return res.status(400).json({ message: 'Invalid email format' });
    const user = await User.findById(req.user._id).select('+password +passwordSalt');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ message: 'Incorrect password' });

    // Use fingerprint lookup — plaintext email not stored in DB
    const pubKey = getPublicKey('user-data');
    const fp = fingerprint(newEmail.toLowerCase(), pubKey);
    const existing = await User.findOne({ emailFingerprint: fp });
    if (existing) return res.status(400).json({ message: 'This email is already in use' });

    const otp = generateOtp();
    const pubKeyEmailChange = getPublicKey('user-data');
    const fpEmailChange = fingerprint(newEmail.toLowerCase(), pubKeyEmailChange);
    await Otp.deleteMany({ emailFingerprint: fpEmailChange, purpose: 'email-change' });
    await Otp.create({ emailFingerprint: fpEmailChange, otp: simpleHashOtp(otp), purpose: 'email-change' });
    await sendOtpEmail(newEmail, otp, 'email-change');
    res.json({ message: 'Verification code sent to new email' });
  } catch (error) {
    console.error('Change email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Confirm email change with OTP
export const confirmEmailChange = async (req, res) => {
  try {
    const { newEmail, otp } = req.body;
    if (!newEmail || !otp) return res.status(400).json({ message: 'New email and OTP are required' });
    const pubKeyEmailChangeVerify = getPublicKey('user-data');
    const fpEmailChangeVerify = fingerprint(newEmail.toLowerCase(), pubKeyEmailChangeVerify);
    const record = await Otp.findOne({ emailFingerprint: fpEmailChangeVerify, purpose: 'email-change' });
    if (!record || record.otp !== simpleHashOtp(otp)) return res.status(400).json({ message: 'Invalid verification code' });
    if (record.expiresAt < new Date()) return res.status(400).json({ message: 'Code expired' });

    // Fingerprint duplicate check — plaintext email not in DB
    const pubKey = getPublicKey('user-data');
    const fp = fingerprint(newEmail.toLowerCase(), pubKey);
    const existing = await User.findOne({ emailFingerprint: fp });
    if (existing && String(existing._id) !== String(req.user._id)) return res.status(400).json({ message: 'This email is already in use' });

    const user = await User.findById(req.user._id);
    user.email = newEmail.toLowerCase();
    user.isEmailVerified = true;
    await user.save();
    await Otp.deleteOne({ _id: record._id });
    const obj = typeof user.getDecryptedData === 'function' ? user.getDecryptedData() : user.toJSON();
    res.json({ message: 'Email updated successfully', data: { user: obj } });
  } catch (error) {
    console.error('Confirm email change error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Toggle 2FA
export const toggle2FA = async (req, res) => {
  try {
    const { password, enabled } = req.body;
    if (!password || enabled === undefined) return res.status(400).json({ message: 'Password and enabled flag are required' });
    const user = await User.findById(req.user._id).select('+password +passwordSalt');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ message: 'Incorrect password' });
    user.twoFactorEnabled = !!enabled;
    await user.save();
    res.json({ message: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`, twoFactorEnabled: user.twoFactorEnabled });
  } catch (error) {
    console.error('Toggle 2FA error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Change password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current and new passwords are required' });
    const policyErrors = validatePasswordPolicy(newPassword);
    if (policyErrors.length > 0) return res.status(400).json({ message: 'Password does not meet requirements', errors: policyErrors });
    const user = await User.findById(req.user._id).select('+password +passwordSalt');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const valid = await user.comparePassword(currentPassword);
    if (!valid) return res.status(401).json({ message: 'Current password is incorrect' });
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Update user profile (self or admin)
export const updateUserProfile = async (req, res) => {
  try {
    const targetId = req.params.id;
    const isSelf = req.user && (req.user.id === targetId || String(req.user._id) === String(targetId));
    const isAdmin = req.user && req.user.role === 'admin';
    if (!isSelf && !isAdmin) return res.status(403).json({ message: 'Forbidden' });
    const allowedFields = ['name', 'phone', 'profileImage', 'role'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.role && !['tenant', 'owner', 'admin'].includes(updates.role)) return res.status(400).json({ message: 'Invalid role' });
    if (updates.role === 'admin' && !isAdmin) return res.status(403).json({ message: 'Cannot set admin role' });
    const user = await User.findById(targetId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    for (const [field, val] of Object.entries(updates)) user[field] = val;
    await user.save();
    const safeUser = typeof user.getDecryptedData === 'function' ? user.getDecryptedData() : user.toJSON();
    res.json({ message: 'Profile updated successfully', data: { user: safeUser } });
  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
};

// @desc Get all users (Admin only)
export const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 1000000, role, search } = req.query;
    const query = { isActive: true };
    if (role) query.role = role;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // When searching: fetch all matching role, decrypt, then filter in-memory
    // (plaintext PII is not stored in DB so DB-level regex is not possible)
    if (search) {
      const allRaw = await User.find(query).sort({ createdAt: -1 });
      const searchLower = search.toLowerCase();
      const filtered = allRaw
        .map(u => (typeof u.getDecryptedData === 'function' ? u.getDecryptedData() : u.toJSON()))
        .filter(u =>
          (u.name  && u.name.toLowerCase().includes(searchLower)) ||
          (u.email && u.email.toLowerCase().includes(searchLower))
        );
      const total = filtered.length;
      const users = filtered.slice(skip, skip + parseInt(limit));
      return res.json({ data: { users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
    }

    const [rawUsers, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      User.countDocuments(query)
    ]);
    const users = rawUsers.map(u =>
      typeof u.getDecryptedData === 'function' ? u.getDecryptedData() : u.toJSON()
    );
    res.json({ data: { users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error while fetching users' });
  }
};

// @desc Get a single user
export const getUser = async (req, res) => {
  try {
    const userDoc = await User.findById(req.params.id).select('-password');
    if (!userDoc || !userDoc.isActive) return res.status(404).json({ message: 'User not found' });

    // Decrypt PII before sending
    const user = typeof userDoc.getDecryptedData === 'function'
      ? userDoc.getDecryptedData()
      : userDoc.toObject();

    let properties = [];
    if (userDoc.role === 'owner') {
      properties = await Property.find({ owner: userDoc._id, isActive: true }).sort({ createdAt: -1 }).limit(6);
    }
    const groups = await UserRating.aggregate([
      { $match: { ratee: userDoc._id } },
      { $group: { _id: '$context', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    const summary = { owner: { avg: 0, count: 0 }, tenant: { avg: 0, count: 0 } };
    for (const g of groups) {
      if (g._id === 'owner') summary.owner = { avg: g.avg || 0, count: g.count || 0 };
      if (g._id === 'tenant') summary.tenant = { avg: g.avg || 0, count: g.count || 0 };
    }
    let tenantActivity;
    if (userDoc.role === 'tenant') {
      const [bookingsCount, reviewsCount] = await Promise.all([
        Booking.countDocuments({ tenant: userDoc._id }),
        Review.countDocuments({ tenant: userDoc._id })
      ]);
      tenantActivity = { bookingsCount, reviewsCount };
    }
    res.json({ data: { user, properties, ratingSummary: summary, tenantActivity } });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error while fetching user' });
  }
};

// @desc Search users
export const searchUsers = async (req, res) => {
  try {
    const { q, role } = req.query;
    if (!q || q.trim().length < 2) return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    // Fetch a broad set, decrypt, filter in-memory (plaintext PII not in DB)
    const query = { isActive: true };
    if (role) query.role = role;
    const rawUsers = await User.find(query).limit(500);
    const searchLower = q.trim().toLowerCase();
    const users = rawUsers
      .map(u => (typeof u.getDecryptedData === 'function' ? u.getDecryptedData() : u.toJSON()))
      .filter(u =>
        (u.name  && u.name.toLowerCase().includes(searchLower)) ||
        (u.email && u.email.toLowerCase().includes(searchLower))
      )
      .slice(0, 20);
    res.json({ data: { users } });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error during search' });
  }
};

// @desc Update user status (Admin only)
export const updateUserStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: `User ${isActive ? 'activated' : 'deactivated'} successfully`, data: { user } });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ message: 'Server error while updating user status' });
  }
};

// @desc Delete a user (Admin or self)
export const deleteUser = async (req, res) => {
  const targetId = req.params.id;
  const isSelf = req.user && String(req.user._id) === String(targetId);
  const isAdmin = req.user && req.user.role === 'admin';
  if (!isSelf && !isAdmin) return res.status(403).json({ message: 'Forbidden' });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(targetId).session(session);
      if (!user) throw new Error('User not found');
      let propertyIds = [];
      if (user.role === 'owner') {
        const properties = await Property.find({ owner: targetId }, '_id').session(session);
        propertyIds = properties.map(p => p._id);
      }
      await Promise.all([
        propertyIds.length ? Property.deleteMany({ _id: { $in: propertyIds } }).session(session) : Promise.resolve(),
        Booking.deleteMany({ $or: [{ tenant: targetId }, { property: { $in: propertyIds } }] }).session(session),
        Review.deleteMany({ $or: [{ tenant: targetId }, { property: { $in: propertyIds } }] }).session(session),
        Notification.deleteMany({ user: targetId }).session(session),
        UserRating.deleteMany({ $or: [{ rater: targetId }, { ratee: targetId }] }).session(session),
      ]);
      await User.findByIdAndDelete(targetId).session(session);
    });
    res.json({ message: 'User and related data deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error during deletion' });
  } finally {
    session.endSession();
  }
};

// @desc Check if current user can view tenant contact info
export const canViewTenantContact = async (req, res) => {
  try {
    const tenantId = req.params.id;
    if (!req.user) return res.json({ canView: false });
    if (req.user.role === 'admin') return res.json({ canView: true });
    if (req.user.role === 'owner') {
      const booking = await Booking.findOne({ tenant: tenantId, property: { $in: await Property.find({ owner: req.user._id }).distinct('_id') }, status: { $in: ['confirmed', 'active'] } });
      return res.json({ canView: !!booking });
    }
    res.json({ canView: false });
  } catch (error) {
    console.error('Can view contact error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Get my favourites
export const getMyFavourites = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('favourites');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ data: { favourites: user.favourites || [] } });
  } catch (error) {
    console.error('Get favourites error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Add to favourites
export const addFavourite = async (req, res) => {
  try {
    const { itemId, itemType } = req.body;
    if (!itemId || !itemType) return res.status(400).json({ message: 'itemId and itemType are required' });
    const user = await User.findById(req.user._id);
    const exists = user.favourites?.some(f => String(f.itemId) === String(itemId) && f.itemType === itemType);
    if (exists) return res.status(400).json({ message: 'Already in favourites' });
    user.favourites = user.favourites || [];
    user.favourites.push({ itemId, itemType });
    await user.save();
    res.json({ message: 'Added to favourites', data: { favourites: user.favourites } });
  } catch (error) {
    console.error('Add favourite error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Remove from favourites
export const removeFavourite = async (req, res) => {
  try {
    const { itemId, itemType } = req.params;
    const user = await User.findById(req.user._id);
    user.favourites = (user.favourites || []).filter(f => !(String(f.itemId) === String(itemId) && f.itemType === itemType));
    await user.save();
    res.json({ message: 'Removed from favourites', data: { favourites: user.favourites } });
  } catch (error) {
    console.error('Remove favourite error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
