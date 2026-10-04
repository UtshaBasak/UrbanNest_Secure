import { validationResult } from 'express-validator';
import Review from '../models/Review.js';
import Property from '../models/Property.js';
import Booking from '../models/Booking.js';
import mongoose from 'mongoose';
import { isValidId, parsePagination } from '../utils/validation.js';

// A tenant can review once their stay has started (approved or completed)
const reviewableBookingFilter = (tenantId, propertyId) => ({
  tenant: tenantId,
  property: propertyId,
  status: { $in: ['approved', 'completed'] },
  startDate: { $lte: new Date() }
});

// @desc Create review
// @route POST /api/reviews
// @access Private (Tenant)
export const createReview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { property: propertyId, rating, comment } = req.body;

    // Check if property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Check if user has an approved booking for this property
    const hasBooking = await Booking.exists(reviewableBookingFilter(req.user._id, propertyId));

    if (!hasBooking) {
      return res.status(400).json({ 
        message: 'You can only review properties you have booked and have been approved for' 
      });
    }

    // Check if user already reviewed this property
    const existingReview = await Review.findOne({
      tenant: req.user._id,
      property: propertyId
    });

    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this property' });
    }

    const review = new Review({
      tenant: req.user._id,
      property: propertyId,
      rating,
      comment
    });

    await review.save();

    const populatedReview = await Review.findById(review._id)
      .populate('tenant', 'nameEncrypted profileImage isEncrypted')
      .populate('property', 'titleEncrypted isEncrypted');

    res.status(201).json({
      message: 'Review created successfully',
      data: { review: populatedReview }
    });

  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({ message: 'Server error while creating review' });
  }
};

// @desc Check if current user can review a property (tenant with approved booking)
// @route GET /api/reviews/can-review?propertyId=
// @access Private (Tenant)
export const canReviewCheck = async (req, res) => {
  try {
    // Accepts ?propertyId= or the /can-review/:propertyId path parameter
    const propertyId = req.params.propertyId || req.query.propertyId;
    if (!isValidId(propertyId)) return res.status(400).json({ message: 'Valid propertyId is required' });
    const hasBooking = await Booking.exists(reviewableBookingFilter(req.user._id, propertyId));
    const alreadyReviewed = !!(await Review.exists({ tenant: req.user._id, property: propertyId }));
    return res.json({ data: { canReview: !!hasBooking && !alreadyReviewed, alreadyReviewed } });
  } catch (error) {
    console.error('canReviewCheck error:', error);
    res.status(500).json({ message: 'Server error while checking review permission' });
  }
};

// @desc Get reviews for a property
// @route GET /api/reviews/property/:propertyId
// @access Public
export const getPropertyReviews = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { page, limit, skip } = parsePagination(req.query);
    if (!isValidId(propertyId)) return res.status(400).json({ message: 'Invalid property id' });

    const reviews = await Review.find({ 
      property: propertyId, 
      isPublic: true 
    })
      .populate('tenant', 'nameEncrypted profileImage isEncrypted')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Review.countDocuments({ 
      property: propertyId, 
      isPublic: true 
    });

    // Calculate average rating
    const ratingStats = await Review.aggregate([
      // Aggregations are not cast by Mongoose, so match on a real ObjectId
      { $match: { property: new mongoose.Types.ObjectId(propertyId), isPublic: true } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    const stats = ratingStats[0] || { averageRating: 0, totalReviews: 0 };

    res.json({
      data: {
        reviews,
        stats,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });

  } catch (error) {
    console.error('Get property reviews error:', error);
    res.status(500).json({ message: 'Server error while fetching reviews' });
  }
};

// @desc Get user's reviews
// @route GET /api/reviews/my
// @access Private
export const getMyReviews = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const reviews = await Review.find({ tenant: req.user._id })
      .populate('property', 'titleEncrypted images locationEncrypted isEncrypted')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Review.countDocuments({ tenant: req.user._id });

    res.json({
      data: {
        reviews,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });

  } catch (error) {
    console.error('Get my reviews error:', error);
    res.status(500).json({ message: 'Server error while fetching reviews' });
  }
};

// @desc Get reviews for owner's properties
// @route GET /api/reviews/my-properties
// @access Private (Owner)
export const getMyPropertiesReviews = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    // First, get all properties owned by the current user
    const properties = await Property.find({ owner: req.user._id }).select('_id');
    const propertyIds = properties.map(p => p._id);

    // Then get all reviews for these properties
    const reviews = await Review.find({ property: { $in: propertyIds } })
      .populate('property', 'titleEncrypted images locationEncrypted isEncrypted')
      .populate('tenant', 'nameEncrypted emailEncrypted isEncrypted')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Review.countDocuments({ property: { $in: propertyIds } });

    res.json({
      message: 'Reviews for owner properties fetched successfully',
      data: {
        reviews,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });

  } catch (error) {
    console.error('Get my properties reviews error:', error);
    res.status(500).json({ message: 'Server error while fetching property reviews' });
  }
};

// @desc Update review
// @route PUT /api/reviews/:id
// @access Private (Review owner)
export const updateReview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Check if user owns the review
    if (review.tenant.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { rating, comment } = req.body;
    
    review.rating = rating;
    review.comment = comment;
    await review.save();

    const updatedReview = await Review.findById(review._id)
      .populate('tenant', 'nameEncrypted profileImage isEncrypted')
      .populate('property', 'titleEncrypted isEncrypted');

    res.json({
      message: 'Review updated successfully',
      data: { review: updatedReview }
    });

  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({ message: 'Server error while updating review' });
  }
};

// @desc Delete review
// @route DELETE /api/reviews/:id
// @access Private (Review owner, Admin)
export const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Check if user owns the review or is admin
    if (req.user.role !== 'admin' && 
        review.tenant.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Review.findByIdAndDelete(req.params.id);

    res.json({ message: 'Review deleted successfully' });

  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ message: 'Server error while deleting review' });
  }
};