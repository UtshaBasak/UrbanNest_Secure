import express from 'express';
import { body } from 'express-validator';
import {
  getProperties,
  getProperty,
  getPropertyByPropertyId,
  createProperty,
  updateProperty,
  deleteProperty,
  getPropertiesByOwner,
  getTopRatedProperties,
  getSuggestedProperties
} from '../controllers/propertyController.js';
import { authenticateToken, optionalAuth, authorize, checkOwnership } from '../middleware/auth.js';
import { validateIds } from '../utils/validation.js';
import Property from '../models/Property.js';


const router = express.Router();

// Suggested properties for logged-in user
router.get('/suggested', authenticateToken, getSuggestedProperties);

// Validation rules (fields match the Property model and the property forms)
const PROPERTY_TYPES = ['Apartment', 'House', 'Shop', 'Commercial Space', 'Land'];
const AVAILABILITY = ['Available', 'Booked', 'Not Available', 'Under Construction', 'Pre-booking Available'];
const isImageSource = (value) =>
  typeof value === 'string' &&
  (/^https?:\/\/\S+$/i.test(value) || /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(value));

// On create the core fields are required; on update every field is optional
const propertyRules = (isUpdate) => {
  const required = (chain) => (isUpdate ? chain.optional() : chain);
  return [
    required(body('title')).isString().trim().isLength({ min: 3, max: 150 }).withMessage('Title must be 3-150 characters'),
    required(body('description')).isString().trim().isLength({ min: 10, max: 5000 }).withMessage('Description must be 10-5000 characters'),
    required(body('location')).isString().trim().isLength({ min: 2, max: 300 }).withMessage('Location is required'),
    required(body('price')).isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('latitude').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('longitude').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    body('size').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Size must be a positive number'),
    body('area').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Area must be a positive number'),
    body('bedrooms').optional().isInt({ min: 0, max: 50 }).withMessage('Bedrooms must be between 0 and 50'),
    body('bathrooms').optional().isInt({ min: 0, max: 50 }).withMessage('Bathrooms must be between 0 and 50'),
    body('type').optional().isIn(PROPERTY_TYPES).withMessage('Invalid property type'),
    body('availabilityStatus').optional().isIn(AVAILABILITY).withMessage('Invalid availability status'),
    body('images').optional().isArray({ max: 10 }).withMessage('At most 10 images are allowed'),
    body('images.*').custom(isImageSource).withMessage('Images must be http(s) URLs or base64 image data'),
    body('amenities').optional().isArray({ max: 50 }).withMessage('Amenities must be a list'),
    body('amenities.*').isString().isLength({ max: 100 }),
    body('isActive').optional().isBoolean()
  ];
};

// Routes
// Public reads; a signed-in viewer additionally sees owner contact details
router.get('/', optionalAuth, getProperties);
router.get('/top-rated', optionalAuth, getTopRatedProperties);
router.get('/owner/:ownerId', validateIds('ownerId'), optionalAuth, getPropertiesByOwner);
router.get('/property-id/:propertyId', optionalAuth, getPropertyByPropertyId);
router.get('/:id', validateIds('id'), optionalAuth, getProperty);

router.post('/', 
  authenticateToken, 
  authorize('owner', 'admin'), 
  propertyRules(false), 
  createProperty
);

router.put('/:id', 
  authenticateToken, 
  validateIds('id'),
  authorize('owner', 'admin'),
  checkOwnership(Property),
  propertyRules(true), 
  updateProperty
);

router.delete('/:id', 
  authenticateToken, 
  validateIds('id'),
  authorize('owner', 'admin'),
  checkOwnership(Property),
  deleteProperty
);

export default router;