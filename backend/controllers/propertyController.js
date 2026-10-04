// @desc Get suggested properties for a user based on favorites and bookings
// @route GET /api/properties/suggested
// @access Private
export const getSuggestedProperties = async (req, res) => {
  try {
    const userId = req.user._id;
    // Get user with favorites
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Get favorite property IDs
    const favPropertyIds = user.favourites
      .filter(fav => fav.itemType === 'property')
      .map(fav => fav.itemId);

    // Get property IDs from user's bookings
    const bookings = await Booking.find({ tenant: userId }).select('property');
    const bookedPropertyIds = bookings.map(b => b.property);

    // Combine and deduplicate property IDs
    const activityPropertyIds = Array.from(new Set([
      ...favPropertyIds.map(id => id.toString()),
      ...bookedPropertyIds.map(id => id.toString())
    ]));

    // Since type/location are now encrypted, we can't filter by them in DB queries.
    // Instead, find recent properties that are not in the activity list.
    let suggested = [];
    if (activityPropertyIds.length > 0) {
      suggested = await Property.find({
        isActive: true,
        _id: { $nin: activityPropertyIds },
      })
        .sort({ createdAt: -1 })
        .slice('images', LIST_IMAGE_SLICE)
        .limit(8)
        .populate('owner', OWNER_FIELDS);
    }

    // If not enough, fill with recent properties
    if (suggested.length < 8) {
      const more = await Property.find({
        isActive: true,
        _id: { $nin: [...activityPropertyIds, ...suggested.map(p => p._id.toString())] }
      })
        .sort({ createdAt: -1 })
        .slice('images', LIST_IMAGE_SLICE)
        .limit(8 - suggested.length)
        .populate('owner', OWNER_FIELDS);
      suggested = [...suggested, ...more];
    }

    // Add rating aggregation for all suggested properties
    const suggestedIds = suggested.map(p => p._id);
    const reviewAggregation = await ratingStatsFor(suggestedIds);

    const ratingMap = new Map(reviewAggregation.map(r => [String(r._id), r]));
    suggested = suggested.map(p => ({
      ...sanitizeForViewer(p.toJSON(), req.user),
      averageRating: ratingMap.get(String(p._id))?.averageRating || 0,
      totalReviews: ratingMap.get(String(p._id))?.totalReviews || 0
    }));

    res.json({ data: suggested });
  } catch (error) {
    console.error('Get suggested properties error:', error);
    res.status(500).json({ message: 'Server error while fetching suggested properties' });
  }
};
import { validationResult } from 'express-validator';
import Property from '../models/Property.js';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import Review from '../models/Review.js';
import Notification from '../models/Notification.js';
import LeaveRequest from '../models/LeaveRequest.js';
import { randomString } from '../crypto/random.js';
import { parsePagination, asString } from '../utils/validation.js';
import { getCachedList, invalidatePropertyCache } from '../utils/propertyCache.js';

// List views only render the cover image; sending every base64 image made
// listing responses several megabytes
const LIST_IMAGE_SLICE = 1;

const OWNER_FIELDS = 'nameEncrypted emailEncrypted phoneEncrypted profileImage isEncrypted';

// Ratings shown on listings use public reviews only, matching the review page
const ratingStatsFor = (propertyIds) => Review.aggregate([
  { $match: { property: { $in: propertyIds }, isPublic: true } },
  { $group: { _id: '$property', averageRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
]);

// Hide contact details from anonymous visitors and the current tenant's name
// from everyone except the property owner and admins.
const sanitizeForViewer = (property, viewer) => {
  const p = { ...property };
  if (!viewer && p.owner && typeof p.owner === 'object') {
    const { email, phone, ...publicOwner } = p.owner;
    p.owner = publicOwner;
  }
  const ownerId = String(p.owner?._id || p.owner || '');
  const canSeeTenant = viewer && (viewer.role === 'admin' || String(viewer._id) === ownerId);
  if (!canSeeTenant) delete p.currentTenant;
  return p;
};

// Fields a client may set on a property; everything else (owner, propertyId,
// encrypted blobs, timestamps) is controlled by the server.
const EDITABLE_FIELDS = ['title', 'description', 'location', 'latitude', 'longitude',
  'price', 'bedrooms', 'bathrooms', 'area', 'size', 'propertyType', 'type',
  'images', 'amenities', 'availabilityStatus', 'isActive'];

const pickEditable = (body) => {
  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (body.coordinates && typeof body.coordinates === 'object') {
    data.coordinates = {
      latitude: body.coordinates.latitude,
      longitude: body.coordinates.longitude
    };
  }
  return data;
};

const validationFailed = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  return true;
};

// @desc Get all properties with filters
// @route GET /api/properties
// @access Public
export const getProperties = async (req, res) => {
  try {
    // Query values can arrive as arrays (?a=1&a=2); only accept strings
    const q = (name, fallback = '') => asString(req.query[name], fallback);
    const minPrice = q('minPrice');
    const maxPrice = q('maxPrice');
    const bedrooms = q('bedrooms');
    const propertyType = q('propertyType');
    const type = q('type');
    const availabilityStatus = q('availabilityStatus');
    const sortBy = q('sortBy', 'createdAt');
    const sortOrder = q('sortOrder', 'desc');
    const search = q('search');
    const lat = q('lat');
    const lng = q('lng');
    const radius = q('radius', '10'); // km
    // The listing page loads everything for client-side filtering, so allow large pages
    const { page: pageNum, limit: limitNum, skip } = parsePagination(req.query, { defaultLimit: 12, maxLimit: 1000 });

    // Since property fields are now encrypted, most filters must be applied post-query.
    // Only non-encrypted fields (isActive, availabilityStatus) can be filtered in DB.
    const query = { isActive: true };
    if (availabilityStatus) query.availabilityStatus = availabilityStatus;

    const sortOptions = {};
    // Only sortBy createdAt / updatedAt is safe (non-encrypted). Default others to createdAt.
    const safeSortFields = ['createdAt', 'updatedAt'];
    const actualSortBy = safeSortFields.includes(sortBy) ? sortBy : 'createdAt';
    sortOptions[actualSortBy] = sortOrder === 'desc' ? -1 : 1;

    // Fetch all matching docs, decrypt in memory, then apply filters + pagination
    // Decrypted plain objects are cached briefly and shared between requests,
    // so they must not be mutated below
    const cacheKey = JSON.stringify({ query, sortOptions });
    let decryptedProperties = await getCachedList(cacheKey, async () => {
      const docs = await Property.find(query)
        .slice('images', LIST_IMAGE_SLICE)
        .populate('owner', OWNER_FIELDS)
        .sort(sortOptions);
      return docs.map(p => p.toJSON());
    });

    // Apply post-decryption filters
    if (minPrice || maxPrice) {
      decryptedProperties = decryptedProperties.filter(p => {
        if (typeof p.price !== 'number') return false;
        if (minPrice && p.price < Number(minPrice)) return false;
        if (maxPrice && p.price > Number(maxPrice)) return false;
        return true;
      });
    }
    if (bedrooms) {
      decryptedProperties = decryptedProperties.filter(p => p.bedrooms === Number(bedrooms));
    }
    if (propertyType) {
      decryptedProperties = decryptedProperties.filter(p => p.propertyType === propertyType);
    }
    if (type) {
      decryptedProperties = decryptedProperties.filter(p => p.type === type);
    }

    // Search in decrypted title, location, description
    if (search) {
      const s = search.toLowerCase();
      decryptedProperties = decryptedProperties.filter(p =>
        (p.title && p.title.toLowerCase().includes(s)) ||
        (p.location && p.location.toLowerCase().includes(s)) ||
        (p.description && p.description.toLowerCase().includes(s))
      );
    }

    // Location-based search on decrypted coordinates
    if (lat && lng) {
      const radiusInDeg = Number(radius) / 111; // ~111 km per degree
      const latNum = Number(lat);
      const lngNum = Number(lng);
      decryptedProperties = decryptedProperties.filter(p => {
        const pLat = p.latitude || p.coordinates?.latitude;
        const pLng = p.longitude || p.coordinates?.longitude;
        if (pLat == null || pLng == null) return false;
        return Math.abs(pLat - latNum) <= radiusInDeg && Math.abs(pLng - lngNum) <= radiusInDeg;
      });
    }

    const total = decryptedProperties.length;
    const paged = decryptedProperties.slice(skip, skip + limitNum);

    // Attach currentTenant if active booking exists
    const now = new Date();
    const propIds = paged.map(p => p._id);

    const activeBookings = await Booking.find({
      property: { $in: propIds },
      startDate: { $lte: now },
      endDate: { $gt: now },
      status: { $in: ['approved', 'completed'] }
    }).populate('tenant', 'nameEncrypted isEncrypted');

    const propsWithActive = new Set(activeBookings.map(b => b.property.toString()));
    const propsWithoutActive = propIds.filter(id => !propsWithActive.has(id.toString()));

    const futureBookings = await Booking.find({
      property: { $in: propsWithoutActive },
      startDate: { $gt: now },
      status: 'approved'
    }).populate('tenant', 'nameEncrypted isEncrypted');

    const futureByProp = new Map();
    futureBookings.forEach(b => {
      const propId = b.property.toString();
      if (!futureByProp.has(propId) || b.startDate < futureByProp.get(propId).startDate) {
        futureByProp.set(propId, b);
      }
    });

    const allBookings = [...activeBookings, ...Array.from(futureByProp.values())];
    const byProp = new Map();
    allBookings.forEach(b => byProp.set(b.property.toString(), b));

    let properties = paged.map(p => {
      const b = byProp.get(p._id.toString());
      if (b && b.tenant) {
        const tenantDecrypted = typeof b.tenant.toJSON === 'function' ? b.tenant.toJSON() : b.tenant;
        return { ...p, currentTenant: { id: b.tenant._id, name: tenantDecrypted.name || '[Encrypted]' } };
      }
      return p;
    });

    // Add rating aggregation for all properties
    const propertyIds = properties.map(p => p._id);
    const reviewAggregation = await ratingStatsFor(propertyIds);

    const ratingMap = new Map(reviewAggregation.map(r => [String(r._id), r]));
    properties = properties.map(p => ({
      ...sanitizeForViewer(p, req.user),
      averageRating: ratingMap.get(String(p._id))?.averageRating || 0,
      totalReviews: ratingMap.get(String(p._id))?.totalReviews || 0
    }));

    res.json({
      data: {
        properties,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum
        }
      }
    });

  } catch (error) {
    console.error('Get properties error:', error);
    res.status(500).json({ message: 'Server error while fetching properties' });
  }
};

// @desc Get top-rated properties (by average rating and review count)
// @route GET /api/properties/top-rated
// @access Public
export const getTopRatedProperties = async (req, res) => {
  try {
    const { limit } = parsePagination(req.query, { defaultLimit: 6, maxLimit: 50 });
    const minReviews = Math.max(1, parseInt(req.query.minReviews, 10) || 1);

    // Rank first, then drop inactive listings before applying the limit
    const ranked = await Review.aggregate([
      { $match: { isPublic: true } },
      { $group: { _id: '$property', averageRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } },
      { $match: { totalReviews: { $gte: minReviews } } },
      { $sort: { averageRating: -1, totalReviews: -1 } }
    ]);
    const activeIds = new Set((await Property.find({ _id: { $in: ranked.map(a => a._id) }, isActive: true }).distinct('_id')).map(String));
    const agg = ranked.filter(a => activeIds.has(String(a._id))).slice(0, limit);

    const ids = agg.map(a => a._id);
    const props = await Property.find({ _id: { $in: ids }, isActive: true })
      .slice('images', LIST_IMAGE_SLICE)
      .populate('owner', OWNER_FIELDS);

    const map = new Map(agg.map(a => [String(a._id), a]));
    const properties = props.map(p => ({
      ...sanitizeForViewer(p.toJSON(), req.user),
      averageRating: map.get(String(p._id))?.averageRating || 0,
      totalReviews: map.get(String(p._id))?.totalReviews || 0
    }));

    properties.sort((a, b) => (b.averageRating - a.averageRating) || (b.totalReviews - a.totalReviews));

    res.json({ data: { properties } });
  } catch (error) {
    console.error('getTopRatedProperties error:', error);
    res.status(500).json({ message: 'Server error while fetching top-rated properties' });
  }
};

// @desc Get single property
// @route GET /api/properties/:id
// @access Public
export const getProperty = async (req, res) => {
  try {
    const propertyDoc = await Property.findById(req.params.id)
      .populate('owner', OWNER_FIELDS);

    if (!propertyDoc) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Compute currentTenant for this property
    const now = new Date();
    let activeBooking = await Booking.findOne({
      property: propertyDoc._id,
      startDate: { $lte: now },
      endDate: { $gt: now },
      status: { $in: ['approved', 'completed'] }
    }).populate('tenant', 'nameEncrypted isEncrypted');

    // If no active booking, check for approved future booking
    if (!activeBooking) {
      activeBooking = await Booking.findOne({
        property: propertyDoc._id,
        startDate: { $gt: now },
        status: 'approved'
      }).sort({ startDate: 1 }).populate('tenant', 'nameEncrypted isEncrypted');
    }

    const property = propertyDoc.toJSON();
    if (activeBooking && activeBooking.tenant) {
      const tenantDecrypted = typeof activeBooking.tenant.toJSON === 'function' ? activeBooking.tenant.toJSON() : activeBooking.tenant;
      property.currentTenant = { id: activeBooking.tenant._id, name: tenantDecrypted.name || '[Encrypted]' };
    }

    // Add rating information
    const reviewAggregation = await ratingStatsFor([propertyDoc._id]);

    property.averageRating = reviewAggregation[0]?.averageRating || 0;
    property.totalReviews = reviewAggregation[0]?.totalReviews || 0;

    res.json({
      data: {
        property: sanitizeForViewer(property, req.user)
      }
    });

  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({ message: 'Server error while fetching property' });
  }
};

// @desc Get property by propertyId
// @route GET /api/properties/property-id/:propertyId
// @access Public
export const getPropertyByPropertyId = async (req, res) => {
  try {
    const propertyDoc = await Property.findOne({ propertyId: asString(req.params.propertyId) })
      .populate('owner', OWNER_FIELDS);

    if (!propertyDoc) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Compute currentTenant for this property
    const now = new Date();
    let activeBooking = await Booking.findOne({
      property: propertyDoc._id,
      startDate: { $lte: now },
      endDate: { $gt: now },
      status: { $in: ['approved', 'completed'] }
    }).populate('tenant', 'nameEncrypted isEncrypted');

    // If no active booking, check for approved future booking
    if (!activeBooking) {
      activeBooking = await Booking.findOne({
        property: propertyDoc._id,
        startDate: { $gt: now },
        status: 'approved'
      }).sort({ startDate: 1 }).populate('tenant', 'nameEncrypted isEncrypted');
    }

    const property = propertyDoc.toJSON();
    if (activeBooking && activeBooking.tenant) {
      const tenantDecrypted = typeof activeBooking.tenant.toJSON === 'function' ? activeBooking.tenant.toJSON() : activeBooking.tenant;
      property.currentTenant = { id: activeBooking.tenant._id, name: tenantDecrypted.name || '[Encrypted]' };
    }

    // Add rating information
    const reviewAggregation = await ratingStatsFor([propertyDoc._id]);

    property.averageRating = reviewAggregation[0]?.averageRating || 0;
    property.totalReviews = reviewAggregation[0]?.totalReviews || 0;

    res.json({
      data: {
        property: sanitizeForViewer(property, req.user)
      }
    });

  } catch (error) {
    console.error('Get property by propertyId error:', error);
    res.status(500).json({ message: 'Server error while fetching property' });
  }
};

// Function to generate unique 8-character alphanumeric ID
const generateUniquePropertyId = async () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let propertyId;
  let isUnique = false;
  
  while (!isUnique) {
    propertyId = randomString(8, chars);
    
    // Check if this ID already exists
    const existingProperty = await Property.findOne({ propertyId });
    if (!existingProperty) {
      isUnique = true;
    }
  }
  
  return propertyId;
};

// @desc Create property
// @route POST /api/properties
// @access Private (Owner, Admin)
export const createProperty = async (req, res) => {
  try {
    if (validationFailed(req, res)) return;

    // Generate unique property ID
    const propertyId = await generateUniquePropertyId();

    const propertyData = {
      ...pickEditable(req.body),
      propertyId,
      owner: req.user._id
    };

    const property = new Property(propertyData);
    await property.save();
    invalidatePropertyCache();

    const populatedProperty = await Property.findById(property._id)
      .populate('owner', OWNER_FIELDS);

    res.status(201).json({
      message: 'Property created successfully',
      data: {
        property: populatedProperty
      }
    });

  } catch (error) {
    console.error('Create property error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error while creating property' });
  }
};

// @desc Update property
// @route PUT /api/properties/:id
// @access Private (Owner of property, Admin)
export const updateProperty = async (req, res) => {
  try {
    if (validationFailed(req, res)) return;

    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Check ownership (middleware handles this, but double-check)
    if (req.user.role !== 'admin' && property.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // For encrypted updates, we need to set fields on the document and save
    // (not use findByIdAndUpdate, which bypasses pre-save hooks)
    Object.assign(property, pickEditable(req.body));

    await property.save();
    invalidatePropertyCache();

    const updatedProperty = await Property.findById(req.params.id)
      .populate('owner', OWNER_FIELDS);

    res.json({
      message: 'Property updated successfully',
      data: {
        property: updatedProperty
      }
    });

  } catch (error) {
    console.error('Update property error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error while updating property' });
  }
};

// @desc Delete property (hard delete + cascade)
// @route DELETE /api/properties/:id
// @access Private (Owner of property, Admin)
export const deleteProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Check ownership
    if (req.user.role !== 'admin' && property.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const propertyId = property._id;
    const bookingIds = await Booking.find({ property: propertyId }).distinct('_id');

    // ── Cascade delete all related data ─────────────────────────────────────
    await Promise.all([
      // Delete all bookings for this property
      Booking.deleteMany({ property: propertyId }),
      // Delete all reviews for this property
      Review.deleteMany({ property: propertyId }),
      // Delete all notifications that reference this property
      Notification.deleteMany({ 'meta.propertyId': propertyId }),
      // Delete leave requests tied to this property
      LeaveRequest.deleteMany({ booking: { $in: bookingIds } }),
      // Remove property from every user's favourites array
      User.updateMany(
        { 'favourites.itemId': propertyId },
        { $pull: { favourites: { itemId: propertyId } } }
      ),
    ]);

    // Hard delete the property itself
    await Property.findByIdAndDelete(propertyId);
    invalidatePropertyCache();

    res.json({ message: 'Property and all related data deleted successfully' });

  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({ message: 'Server error while deleting property' });
  }
};

// @desc Get properties by owner
// @route GET /api/properties/owner/:ownerId
// @access Public
export const getPropertiesByOwner = async (req, res) => {
  try {
    const { ownerId } = req.params;
    const { page: pageNum, limit: limitNum, skip } = parsePagination(req.query, { defaultLimit: 12 });

    const allProperties = await Property.find({ 
      owner: ownerId, 
      isActive: true 
    })
      .slice('images', LIST_IMAGE_SLICE)
      .populate('owner', OWNER_FIELDS)
      .sort({ createdAt: -1 });

    const total = allProperties.length;

    // Decrypt and paginate
    const decrypted = allProperties.map(p => sanitizeForViewer(p.toJSON(), req.user));
    const paged = decrypted.slice(skip, skip + limitNum);

    // Add rating aggregation for owner's properties
    const propertyIds = paged.map(p => p._id);
    const reviewAggregation = await ratingStatsFor(propertyIds);

    const ratingMap = new Map(reviewAggregation.map(r => [String(r._id), r]));
    const propertiesWithRatings = paged.map(p => ({
      ...p,
      averageRating: ratingMap.get(String(p._id))?.averageRating || 0,
      totalReviews: ratingMap.get(String(p._id))?.totalReviews || 0
    }));

    res.json({
      data: {
        properties: propertiesWithRatings,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum
        }
      }
    });

  } catch (error) {
    console.error('Get properties by owner error:', error);
    res.status(500).json({ message: 'Server error while fetching owner properties' });
  }
};