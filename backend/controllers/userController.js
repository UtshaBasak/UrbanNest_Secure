import User from '../models/User.js';
import Property from '../models/Property.js';
import Booking from '../models/Booking.js';
import Review from '../models/Review.js';
import Notification from '../models/Notification.js';
import UserRating from '../models/UserRating.js';
import RefreshToken from '../models/RefreshToken.js';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { invalidatePropertyCache } from '../utils/propertyCache.js';
import { validatePasswordPolicy, setAuthCookies } from './authController.js';
import { sendOtpEmail } from '../config/emailService.js';
import { fingerprint } from '../crypto/rsa.js';
import { getPublicKey } from '../crypto/keyManager.js';
import { issueOtp, consumeOtp } from '../utils/otp.js';
import { isValidId, parsePagination, asString } from '../utils/validation.js';

// Fields anyone may see on another user's profile
const PUBLIC_USER_FIELDS = ['_id', 'name', 'role', 'profileImage', 'isActive', 'createdAt'];

const toPublicUser = (decrypted) =>
  Object.fromEntries(PUBLIC_USER_FIELDS.filter((k) => decrypted[k] !== undefined).map((k) => [k, decrypted[k]]));

// Owner -> tenant contact is allowed once a booking links them
async function ownerHasBookingWithTenant(ownerId, tenantId) {
  const propertyIds = await Property.find({ owner: ownerId }).distinct('_id');
  if (!propertyIds.length) return false;
  return !!(await Booking.exists({ tenant: tenantId, property: { $in: propertyIds }, status: { $in: ['approved', 'completed'] } }));
}

// Average rating per user, split by context ('owner' or 'tenant')
async function ratingSummaries(userIds) {
  const groups = await UserRating.aggregate([
    { $match: { ratee: { $in: userIds } } },
    { $group: { _id: { ratee: '$ratee', context: '$context' }, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const map = new Map();
  for (const g of groups) {
    const key = String(g._id.ratee);
    if (!map.has(key)) map.set(key, {});
    map.get(key)[g._id.context] = { avg: g.avg || 0, count: g.count || 0 };
  }
  return map;
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

    // The code is bound to this account, so it can only be redeemed here
    // after the password check above
    const otp = await issueOtp({ emailFingerprint: fp, purpose: 'email-change', userId: user._id });
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
    if (typeof newEmail !== 'string' || !otp) return res.status(400).json({ message: 'New email and OTP are required' });
    const pubKey = getPublicKey('user-data');
    const fp = fingerprint(newEmail.toLowerCase(), pubKey);
    const check = await consumeOtp({ emailFingerprint: fp, purpose: 'email-change', otp, userId: req.user._id });
    if (!check.ok) return res.status(400).json({ message: check.message });

    // Fingerprint duplicate check — plaintext email not in DB
    const existing = await User.findOne({ emailFingerprint: fp });
    if (existing && String(existing._id) !== String(req.user._id)) return res.status(400).json({ message: 'This email is already in use' });

    const user = await User.findById(req.user._id);
    user.email = newEmail.toLowerCase();
    user.isEmailVerified = true;
    await user.save();
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
    // End every other session, then issue fresh tokens for this one
    await RefreshToken.deleteMany({ userId: user._id });
    await setAuthCookies(res, user._id, req.ip || '', req.headers['user-agent'] || '');
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
    // Only admins may change roles
    const allowedFields = isAdmin ? ['name', 'phone', 'profileImage', 'role'] : ['name', 'phone', 'profileImage'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.role !== undefined && !['tenant', 'owner', 'admin'].includes(updates.role)) return res.status(400).json({ message: 'Invalid role' });
    if (updates.name !== undefined && (typeof updates.name !== 'string' || updates.name.trim().length < 2 || updates.name.length > 100)) {
      return res.status(400).json({ message: 'Name must be 2-100 characters' });
    }
    if (updates.phone !== undefined && (typeof updates.phone !== 'string' || updates.phone.length > 30)) {
      return res.status(400).json({ message: 'Invalid phone number' });
    }
    if (updates.profileImage !== undefined && typeof updates.profileImage !== 'string') {
      return res.status(400).json({ message: 'Invalid profile image' });
    }
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
    const role = asString(req.query.role);
    const search = asString(req.query.search).trim();
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 1000, maxLimit: 1000 });
    const isAdmin = req.user?.role === 'admin';
    const query = { isActive: true };
    if (['owner', 'tenant', 'admin'].includes(role)) query.role = role;

    // Non-admins get public fields plus rating summaries; email/phone stay private
    const present = async (decryptedUsers) => {
      const ratings = await ratingSummaries(decryptedUsers.map((u) => u._id));
      return decryptedUsers.map((u) => {
        const r = ratings.get(String(u._id)) || {};
        return {
          ...(isAdmin ? u : toPublicUser(u)),
          avgRatingOwner: r.owner?.avg || 0,
          ratingCountOwner: r.owner?.count || 0,
          avgRatingTenant: r.tenant?.avg || 0,
          ratingCountTenant: r.tenant?.count || 0
        };
      });
    };

    // When searching: fetch all matching role, decrypt, then filter in-memory
    // (plaintext PII is not stored in DB so DB-level regex is not possible)
    if (search) {
      const allRaw = await User.find(query).sort({ createdAt: -1 });
      const searchLower = search.toLowerCase();
      const filtered = allRaw
        .map(u => (typeof u.getDecryptedData === 'function' ? u.getDecryptedData() : u.toJSON()))
        .filter(u =>
          (u.name  && u.name.toLowerCase().includes(searchLower)) ||
          (isAdmin && u.email && u.email.toLowerCase().includes(searchLower))
        );
      const total = filtered.length;
      const users = await present(filtered.slice(skip, skip + limit));
      return res.json({ data: { users, total, page, pages: Math.ceil(total / limit) } });
    }

    const [rawUsers, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query)
    ]);
    const users = await present(rawUsers.map(u =>
      typeof u.getDecryptedData === 'function' ? u.getDecryptedData() : u.toJSON()
    ));
    res.json({ data: { users, total, page, pages: Math.ceil(total / limit) } });
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

    // Decrypt PII before sending, then limit it to what this viewer may see
    const decrypted = typeof userDoc.getDecryptedData === 'function'
      ? userDoc.getDecryptedData()
      : userDoc.toObject();
    const viewer = req.user;
    const isSelf = viewer && String(viewer._id) === String(userDoc._id);
    let canSeeContact = Boolean(isSelf || viewer?.role === 'admin');
    if (!canSeeContact && viewer) {
      // Owners publish contact details to signed-in users; tenants only to
      // owners they have a booking with
      canSeeContact = userDoc.role === 'owner'
        || (userDoc.role === 'tenant' && viewer.role === 'owner' && await ownerHasBookingWithTenant(viewer._id, userDoc._id));
    }
    const user = isSelf || viewer?.role === 'admin'
      ? decrypted
      : { ...toPublicUser(decrypted), ...(canSeeContact ? { email: decrypted.email, phone: decrypted.phone } : {}) };

    let properties = [];
    if (userDoc.role === 'owner') {
      properties = await Property.find({ owner: userDoc._id, isActive: true }).slice('images', 1).sort({ createdAt: -1 }).limit(6);
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
    const q = asString(req.query.q);
    const role = asString(req.query.role);
    if (q.trim().length < 2) return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    const isAdmin = req.user?.role === 'admin';
    // Fetch a broad set, decrypt, filter in-memory (plaintext PII not in DB)
    const query = { isActive: true };
    if (['owner', 'tenant', 'admin'].includes(role)) query.role = role;
    const rawUsers = await User.find(query).limit(500);
    const searchLower = q.trim().toLowerCase();
    const users = rawUsers
      .map(u => (typeof u.getDecryptedData === 'function' ? u.getDecryptedData() : u.toJSON()))
      .filter(u =>
        (u.name  && u.name.toLowerCase().includes(searchLower)) ||
        (isAdmin && u.email && u.email.toLowerCase().includes(searchLower))
      )
      .slice(0, 20)
      .map(u => (isAdmin ? u : toPublicUser(u)));
    res.json({ data: { users } });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error during search' });
  }
};

// @desc Update user status (Admin only)
export const updateUserStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    const isActive = req.body.isActive === true || req.body.isActive === 'true';
    const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { returnDocument: 'after' }).select('-password');
    // A deactivated user loses every session immediately
    if (user && !isActive) await RefreshToken.deleteMany({ userId: user._id });
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
  const isAdmin = req.user && req.user.role === 'admin';
  if (!isAdmin) return res.status(403).json({ message: 'Forbidden' });
  if (!(await User.exists({ _id: targetId }))) return res.status(404).json({ message: 'User not found' });
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
        invalidatePropertyCache(),
        propertyIds.length ? Property.deleteMany({ _id: { $in: propertyIds } }).session(session) : Promise.resolve(),
        Booking.deleteMany({ $or: [{ tenant: targetId }, { property: { $in: propertyIds } }] }).session(session),
        Review.deleteMany({ $or: [{ tenant: targetId }, { property: { $in: propertyIds } }] }).session(session),
        Notification.deleteMany({ user: targetId }).session(session),
        UserRating.deleteMany({ $or: [{ rater: targetId }, { ratee: targetId }] }).session(session),
      ]);
      await User.findByIdAndDelete(targetId).session(session);
    });
    await RefreshToken.deleteMany({ userId: targetId });
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
      return res.json({ canView: await ownerHasBookingWithTenant(req.user._id, tenantId) });
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
    const favourites = user.favourites || [];

    // Attach the decrypted item so the page can render it (null if deleted)
    const propertyIds = favourites.filter(f => f.itemType === 'property').map(f => f.itemId);
    const ownerIds = favourites.filter(f => f.itemType === 'owner').map(f => f.itemId);
    const [properties, owners] = await Promise.all([
      Property.find({ _id: { $in: propertyIds }, isActive: true })
        .slice('images', 1)
        .populate('owner', 'nameEncrypted profileImage isEncrypted'),
      User.find({ _id: { $in: ownerIds }, isActive: true })
    ]);
    const details = new Map([
      ...properties.map(p => [String(p._id), p.toJSON()]),
      ...owners.map(u => [String(u._id), toPublicUser(u.getDecryptedData())])
    ]);
    const items = favourites.map(f => ({
      itemId: f.itemId,
      itemType: f.itemType,
      addedAt: f.addedAt,
      details: details.get(String(f.itemId)) || null
    }));
    res.json({ data: { favourites: items } });
  } catch (error) {
    console.error('Get favourites error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Add to favourites
export const addFavourite = async (req, res) => {
  try {
    const { itemId, itemType } = req.body;
    if (!isValidId(itemId) || !['owner', 'property'].includes(itemType)) {
      return res.status(400).json({ message: 'Valid itemId and itemType are required' });
    }
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
