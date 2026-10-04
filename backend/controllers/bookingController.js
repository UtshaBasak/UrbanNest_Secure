import { validationResult } from 'express-validator';
import Booking from '../models/Booking.js';
import Property from '../models/Property.js';
import LeaveRequest from '../models/LeaveRequest.js';
import { createNotification } from './notificationController.js';
import { invalidatePropertyCache } from '../utils/propertyCache.js';
import { isValidId, parsePagination } from '../utils/validation.js';

// Helper function to check if property is currently occupied
const isPropertyCurrentlyOccupied = async (propertyId) => {
  const now = new Date();
  const currentBookings = await Booking.find({
    property: propertyId,
    status: 'approved',
    startDate: { $lte: now },
    endDate: { $gte: now }
  });
  return currentBookings.length > 0;
};

// Helper function to update property availability based on current bookings.
// Only toggles between Available and Booked so a status the owner set by hand
// (e.g. "Not Available") is never overwritten.
const updatePropertyAvailability = async (propertyId) => {
  const property = await Property.findById(propertyId).select('availabilityStatus availability');
  if (!property) return;
  const current = property.availabilityStatus || property.availability;
  const isOccupied = await isPropertyCurrentlyOccupied(propertyId);
  let next = current;
  if (isOccupied) next = 'Booked';
  else if (current === 'Booked') next = 'Available';
  if (next !== current) {
    await Property.updateOne({ _id: propertyId }, { availabilityStatus: next, availability: next });
    invalidatePropertyCache();
  }
};

// @desc Create booking request
// @route POST /api/bookings
// @access Private (Tenant)
export const createBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { property: propertyId, startDate, endDate, message } = req.body;
    if (!isValidId(propertyId)) {
      return res.status(400).json({ message: 'Invalid property id' });
    }

    // Check if property exists and is available
    const property = await Property.findById(propertyId);
    if (!property || property.isActive === false) {
      return res.status(404).json({ message: 'Property not found' });
    }
    const availability = property.availability || property.availabilityStatus;
    if (availability !== 'Available') {
      return res.status(400).json({ message: 'Property is not available for booking' });
    }

    // Check if user is trying to book their own property
    if (property.owner.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot book your own property' });
    }

    // Only one open request per tenant per property
    const existingRequest = await Booking.exists({ tenant: req.user._id, property: propertyId, status: 'pending' });
    if (existingRequest) {
      return res.status(400).json({ message: 'You already have a pending booking request for this property' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Valid start and end dates are required' });
    }
    if (end <= start) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysRaw = Math.ceil((end - start) / msPerDay);
    const days = Math.max(daysRaw, 1);
    
    const propDecrypted = typeof property.getDecryptedData === 'function' ? property.getDecryptedData() : property.toJSON();
    const propertyPrice = propDecrypted.price || 0;
    const totalAmount = propertyPrice * days;

    // Check for conflicts with approved bookings
    const conflictingBookings = await Booking.find({
      property: propertyId,
      status: 'approved',
      $or: [
        // Case 1: Existing booking starts during new booking period
        {
          startDate: { $gte: start, $lt: end }
        },
        // Case 2: Existing booking ends during new booking period
        {
          endDate: { $gt: start, $lte: end }
        },
        // Case 3: Existing booking completely encompasses new booking
        {
          startDate: { $lte: start },
          endDate: { $gte: end }
        },
        // Case 4: New booking completely encompasses existing booking
        {
          startDate: { $gte: start },
          endDate: { $lte: end }
        }
      ]
    });

    if (conflictingBookings.length > 0) {
      const conflictDates = conflictingBookings.map(cb => 
        `${new Date(cb.startDate).toLocaleDateString()} - ${new Date(cb.endDate).toLocaleDateString()}`
      ).join(', ');
      
      return res.status(400).json({ 
        message: `Cannot create booking request due to conflicts with approved bookings: ${conflictDates}`,
        conflictingBookings: conflictingBookings.map(cb => ({
          id: cb._id,
          startDate: cb.startDate,
          endDate: cb.endDate
        }))
      });
    }

    const booking = new Booking({
      tenant: req.user._id,
      property: propertyId,
      startDate: start,
      endDate: end,
      totalAmount,
      message
    });

    await booking.save();

    const populatedBooking = await Booking.findById(booking._id)
      .populate('tenant', 'nameEncrypted emailEncrypted phoneEncrypted isEncrypted')
      .populate('property', 'titleEncrypted locationEncrypted priceEncrypted images isEncrypted');

    // Notify owner about new booking request
    try {
      const tenantDecrypted = req.user.getDecryptedData();
      const propDecrypted = typeof property.getDecryptedData === 'function' ? property.getDecryptedData() : property.toJSON();
      await createNotification({
        user: property.owner,
        title: 'New booking request',
        message: `${tenantDecrypted.name || 'A tenant'} requested to book ${propDecrypted.title || 'a property'} (${start.toLocaleDateString()} - ${end.toLocaleDateString()}).`,
        link: `/dashboard?tab=bookings`,
        meta: { bookingId: booking._id, propertyId: property._id }
      });
    } catch (e) {
      console.error('Failed to create notification (createBooking):', e.message);
    }

    res.status(201).json({
      message: 'Booking request created successfully',
      data: { booking: populatedBooking }
    });

  } catch (error) {
    console.error('Create booking error:', error);
    // Date rules from the Booking model's validate hook are user errors
    if (error.name === 'ValidationError' || /date/i.test(error.message)) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error while creating booking' });
  }
};

// @desc Get user's bookings
// @route GET /api/bookings/my
// @access Private
export const getMyBookings = async (req, res) => {
  try {
    const { status } = req.query;
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};

    if (req.user.role === 'tenant') {
      query.tenant = req.user._id;
    } else if (req.user.role === 'owner') {
      // Get bookings for properties owned by this user
      const properties = await Property.find({ owner: req.user._id });
      query.property = { $in: properties.map(p => p._id) };
    }

    if (typeof status === 'string' && status) query.status = status;

    const bookings = await Booking.find(query)
      .populate('tenant', 'nameEncrypted emailEncrypted phoneEncrypted isEncrypted')
      .populate({
        path: 'property',
        select: 'titleEncrypted locationEncrypted priceEncrypted images owner isEncrypted',
        populate: {
          path: 'owner',
          select: 'nameEncrypted profileImage isEncrypted'
        }
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Booking.countDocuments(query);

    res.json({
      data: {
        bookings,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });

  } catch (error) {
    console.error('Get my bookings error:', error);
    res.status(500).json({ message: 'Server error while fetching bookings' });
  }
};

// @desc Update booking status
// @route PUT /api/bookings/:id/status
// @access Private (Owner, Admin)
export const updateBookingStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { status, rejectionReason } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('property');

    if (!booking || !booking.property) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if user owns the property or is admin
    if (req.user.role !== 'admin' &&
        booking.property.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Only pending requests can be decided
    if (booking.status !== 'pending') {
      return res.status(400).json({ message: `Cannot change a booking that is already ${booking.status}` });
    }

    booking.status = status;
    if (status === 'rejected' && rejectionReason) {
      booking.rejectionReason = rejectionReason;
    }

    // Check for booking conflicts if approving
    if (status === 'approved') {
      // Find all approved bookings for the same property
      const conflictingBookings = await Booking.find({
        property: booking.property._id,
        status: 'approved',
        _id: { $ne: booking._id }, // Exclude current booking
        $or: [
          // Case 1: Existing booking starts during new booking period
          {
            startDate: { $gte: booking.startDate, $lt: booking.endDate }
          },
          // Case 2: Existing booking ends during new booking period
          {
            endDate: { $gt: booking.startDate, $lte: booking.endDate }
          },
          // Case 3: Existing booking completely encompasses new booking
          {
            startDate: { $lte: booking.startDate },
            endDate: { $gte: booking.endDate }
          },
          // Case 4: New booking completely encompasses existing booking
          {
            startDate: { $gte: booking.startDate },
            endDate: { $lte: booking.endDate }
          }
        ]
      });

      if (conflictingBookings.length > 0) {
        const conflictDates = conflictingBookings.map(cb => 
          `${new Date(cb.startDate).toLocaleDateString()} - ${new Date(cb.endDate).toLocaleDateString()}`
        ).join(', ');
        
        return res.status(400).json({ 
          message: `Cannot approve booking due to date conflicts with existing approved bookings: ${conflictDates}`,
          conflictingBookings: conflictingBookings.map(cb => ({
            id: cb._id,
            startDate: cb.startDate,
            endDate: cb.endDate,
            tenant: cb.tenant
          }))
        });
      }
    }

    await booking.save();

    // Update property availability if approved
    if (status === 'approved') {
      await updatePropertyAvailability(booking.property._id);
      // Note: No automatic transaction creation on booking approval
      // Tenants must manually make monthly payments through the payment form
    }

    // Notify tenant of decision
    try {
      const bPropDecrypted = typeof booking.property.getDecryptedData === 'function' ? booking.property.getDecryptedData() : booking.property.toJSON();
      if (status === 'approved') {
        await createNotification({
          user: booking.tenant,
          title: 'Booking approved',
          message: `Your booking for ${bPropDecrypted.title || 'a property'} was approved.`,
          link: `/dashboard?tab=bookings`,
          meta: { bookingId: booking._id, propertyId: booking.property._id }
        });
      } else if (status === 'rejected') {
        await createNotification({
          user: booking.tenant,
          title: 'Booking rejected',
          message: `Your booking for ${bPropDecrypted.title || 'a property'} was rejected${rejectionReason ? `: ${rejectionReason}` : ''}.`,
          link: `/dashboard?tab=bookings`,
          meta: { bookingId: booking._id, propertyId: booking.property._id }
        });
      }
    } catch (e) {
      console.error('Failed to create notification (updateBookingStatus):', e.message);
    }

    const updatedBooking = await Booking.findById(booking._id)
      .populate('tenant', 'nameEncrypted emailEncrypted phoneEncrypted isEncrypted')
      .populate('property', 'titleEncrypted locationEncrypted priceEncrypted images isEncrypted');

    res.json({
      message: 'Booking status updated successfully',
      data: { booking: updatedBooking }
    });

  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ message: 'Server error while updating booking status' });
  }
};

// @desc Cancel booking
// @route PUT /api/bookings/:id/cancel
// @access Private (Tenant who made booking)
// @desc Delete booking
// @route DELETE /api/bookings/:id
// @access Private (Tenant who made booking, Owner of property, Admin)
export const deleteBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('property', 'owner');

    if (!booking || !booking.property) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check permissions: tenant who made booking, property owner, or admin
    const isTenant = booking.tenant.toString() === req.user._id.toString();
    const isPropertyOwner = booking.property.owner.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isTenant && !isPropertyOwner && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Delete the booking and any leave requests that reference it
    await Booking.findByIdAndDelete(req.params.id);
    await LeaveRequest.deleteMany({ booking: booking._id });

    // Update property availability if it was an approved booking
    if (booking.status === 'approved') {
      await updatePropertyAvailability(booking.property._id);
    }

    res.json({ message: 'Booking deleted successfully', data: { id: req.params.id } });

  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({ message: 'Server error while deleting booking' });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if user owns the booking
    if (booking.tenant.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (booking.status !== 'pending' && booking.status !== 'approved') {
      return res.status(400).json({ message: 'Booking cannot be cancelled' });
    }

    const wasApproved = booking.status === 'approved';
    booking.status = 'cancelled';
    await booking.save();

    // Update property availability if it was an approved booking
    if (wasApproved) {
      await updatePropertyAvailability(booking.property);
    }

    // Notify owner that tenant cancelled
    try {
      const tenantDecrypted = req.user.getDecryptedData();
      await createNotification({
        user: (await Property.findById(booking.property)).owner,
        title: 'Booking cancelled',
        message: `${tenantDecrypted.name || 'Tenant'} cancelled a booking request for your property.`,
        link: `/dashboard?tab=bookings`,
        meta: { bookingId: booking._id, propertyId: booking.property }
      });
    } catch (e) {
      console.error('Failed to create notification (cancelBooking):', e.message);
    }

    res.json({
      message: 'Booking cancelled successfully',
      data: { booking }
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ message: 'Server error while cancelling booking' });
  }
};