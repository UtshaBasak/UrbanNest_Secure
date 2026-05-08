// @desc Get suggested properties for a user based on favorites and bookings
// @route GET /api/properties/suggested
// @access Private
export const getSuggestedProperties = async (req, res) => {
  try {
    const userId = req.user.id;
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
        .limit(8)
        .populate('owner', 'nameEncrypted emailEncrypted phoneEncrypted profileImage isEncrypted');
    }

    // If not enough, fill with recent properties
    if (suggested.length < 8) {
      const more = await Property.find({
        isActive: true,
        _id: { $nin: [...activityPropertyIds, ...suggested.map(p => p._id.toString())] }
      })
        .sort({ createdAt: -1 })
        .limit(8 - suggested.length)
        .populate('owner', 'nameEncrypted emailEncrypted phoneEncrypted profileImage isEncrypted');
      suggested = [...suggested, ...more];
    }

    // Add rating aggregation for all suggested properties
    const suggestedIds = suggested.map(p => p._id);
    const reviewAggregation = await Review.aggregate([
      { $match: { property: { $in: suggestedIds } } },
      { $group: { _id: '$property', averageRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
    ]);

    const ratingMap = new Map(reviewAggregation.map(r => [String(r._id), r]));
    suggested = suggested.map(p => ({
      ...p.toJSON(),
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

// @desc Get all properties with filters
// @route GET /api/properties
// @access Public
export const getProperties = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      minPrice,
      maxPrice,
      bedrooms,
      propertyType,
      availabilityStatus = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      lat,
      lng,
      radius = 10 // km
    } = req.query;

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
    let allProperties = await Property.find(query)
      .populate('owner', 'nameEncrypted emailEncrypted phoneEncrypted profileImage isEncrypted')
      .sort(sortOptions);

    // Decrypt all properties to plain objects
    let decryptedProperties = allProperties.map(p => p.toJSON());

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
    if (req.query.type) {
      decryptedProperties = decryptedProperties.filter(p => p.type === req.query.type);
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
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const paged = decryptedProperties.slice((pageNum - 1) * limitNum, pageNum * limitNum);

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
        p.currentTenant = { id: b.tenant._id, name: tenantDecrypted.name || '[Encrypted]' };
      }
      return p;
    });

    // Add rating aggregation for all properties
    const propertyIds = properties.map(p => p._id);
    const reviewAggregation = await Review.aggregate([
      { $match: { property: { $in: propertyIds } } },
      { $group: { _id: '$property', averageRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
    ]);

    const ratingMap = new Map(reviewAggregation.map(r => [String(r._id), r]));
    properties = properties.map(p => ({
      ...p,
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
    const { limit = 6, minReviews = 1 } = req.query;

    const agg = await Review.aggregate([
      { $group: { _id: '$property', averageRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } },
      { $match: { totalReviews: { $gte: Number(minReviews) } } },
      { $sort: { averageRating: -1, totalReviews: -1 } },
      { $limit: Number(limit) }
    ]);

    const ids = agg.map(a => a._id);
    const props = await Property.find({ _id: { $in: ids }, isActive: true })
      .populate('owner', 'nameEncrypted emailEncrypted phoneEncrypted profileImage isEncrypted');

    const map = new Map(agg.map(a => [String(a._id), a]));
    const properties = props.map(p => ({
      ...p.toJSON(),
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
      .populate('owner', 'nameEncrypted emailEncrypted phoneEncrypted profileImage isEncrypted');

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
    const reviewAggregation = await Review.aggregate([
      { $match: { property: propertyDoc._id } },
      { $group: { _id: '$property', averageRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
    ]);

    property.averageRating = reviewAggregation[0]?.averageRating || 0;
    property.totalReviews = reviewAggregation[0]?.totalReviews || 0;

    res.json({
      data: {
        property
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
    const propertyDoc = await Property.findOne({ propertyId: req.params.propertyId })
      .populate('owner', 'nameEncrypted emailEncrypted phoneEncrypted profileImage isEncrypted');

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
    const reviewAggregation = await Review.aggregate([
      { $match: { property: propertyDoc._id } },
      { $group: { _id: '$property', averageRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
    ]);

    property.averageRating = reviewAggregation[0]?.averageRating || 0;
    property.totalReviews = reviewAggregation[0]?.totalReviews || 0;

    res.json({
      data: {
        property
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
    propertyId = '';
    for (let i = 0; i < 8; i++) {
      propertyId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
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
    // Relaxed validation: accept payload as-is; user verification is handled via auth middleware

    // Generate unique property ID
    const propertyId = await generateUniquePropertyId();

    const propertyData = {
      ...req.body,
      propertyId,
      owner: req.user._id
    };

    const property = new Property(propertyData);
    await property.save();

    const populatedProperty = await Property.findById(property._id)
      .populate('owner', 'nameEncrypted emailEncrypted phoneEncrypted profileImage isEncrypted');

    res.status(201).json({
      message: 'Property created successfully',
      data: {
        property: populatedProperty
      }
    });

  } catch (error) {
    console.error('Create property error:', error);
    res.status(500).json({ message: 'Server error while creating property' });
  }
};

// @desc Update property
// @route PUT /api/properties/:id
// @access Private (Owner of property, Admin)
export const updateProperty = async (req, res) => {
  try {
    // Relaxed validation: accept payload updates as-is; user/role verification remains enforced

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
    const updateFields = ['title', 'description', 'location', 'latitude', 'longitude',
      'price', 'bedrooms', 'bathrooms', 'area', 'size', 'propertyType', 'type',
      'images', 'amenities', 'availabilityStatus', 'isActive'];

    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        property[field] = req.body[field];
      }
    });

    // Handle coordinates sub-object
    if (req.body.coordinates) {
      property.coordinates = req.body.coordinates;
    }

    await property.save();

    const updatedProperty = await Property.findById(req.params.id)
      .populate('owner', 'nameEncrypted emailEncrypted phoneEncrypted profileImage isEncrypted');

    res.json({
      message: 'Property updated successfully',
      data: {
        property: updatedProperty
      }
    });

  } catch (error) {
    console.error('Update property error:', error);
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

    // ── Cascade delete all related data ─────────────────────────────────────
    await Promise.all([
      // Delete all bookings for this property
      Booking.deleteMany({ property: propertyId }),
      // Delete all reviews for this property
      Review.deleteMany({ property: propertyId }),
      // Delete all notifications that reference this property
      Notification.deleteMany({ 'meta.propertyId': propertyId }),
      // Delete leave requests tied to this property
      LeaveRequest.deleteMany({ property: propertyId }),
      // Remove property from every user's favourites array
      User.updateMany(
        { 'favourites.itemId': propertyId },
        { $pull: { favourites: { itemId: propertyId } } }
      ),
    ]);

    // Hard delete the property itself
    await Property.findByIdAndDelete(propertyId);

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
    const { page = 1, limit = 12 } = req.query;

    const allProperties = await Property.find({ 
      owner: ownerId, 
      isActive: true 
    })
      .populate('owner', 'nameEncrypted emailEncrypted phoneEncrypted profileImage isEncrypted')
      .sort({ createdAt: -1 });

    const total = allProperties.length;
    const pageNum = Number(page);
    const limitNum = Number(limit);

    // Decrypt and paginate
    const decrypted = allProperties.map(p => p.toJSON());
    const paged = decrypted.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    // Add rating aggregation for owner's properties
    const propertyIds = paged.map(p => p._id);
    const reviewAggregation = await Review.aggregate([
      { $match: { property: { $in: propertyIds } } },
      { $group: { _id: '$property', averageRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
    ]);

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