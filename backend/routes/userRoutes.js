import express from 'express';
import { body } from 'express-validator';

import {
  getUsers,
  getUser,
  searchUsers,
  updateUserStatus,
  deleteUser,
  canViewTenantContact,
  getMyFavourites,
  addFavourite,
  removeFavourite,
  updateUserProfile,
  changeEmail,
  confirmEmailChange,
  toggle2FA,
  changePassword,
} from '../controllers/userController.js';
import { authenticateToken, optionalAuth, authorize } from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/rateLimit.js';
import { validateIds } from '../utils/validation.js';

const router = express.Router();

// Validation rules
const statusUpdateValidation = [
  body('isActive').isBoolean().withMessage('isActive must be a boolean')
];

// Security endpoints (must be above /:id to avoid shadowing)
// Password/OTP checks are rate limited to stop guessing with a stolen session
router.post('/change-email', sensitiveLimiter, authenticateToken, changeEmail);
router.post('/confirm-email-change', sensitiveLimiter, authenticateToken, confirmEmailChange);
router.post('/toggle-2fa', sensitiveLimiter, authenticateToken, toggle2FA);
router.post('/change-password', sensitiveLimiter, authenticateToken, changePassword);

// Update user profile (self or admin)
router.put('/:id', authenticateToken, validateIds('id'), updateUserProfile);

// Routes
// Public directory; admins additionally see contact details
router.get('/', optionalAuth, getUsers);
router.get('/search', optionalAuth, searchUsers);
// Favourites (tenant)
router.get('/me/favourites', authenticateToken, getMyFavourites);
router.post('/me/favourites', authenticateToken, addFavourite);
router.delete('/me/favourites/:itemType/:itemId', authenticateToken, validateIds('itemId'), removeFavourite);
// Contact visibility check (must be above '/:id' to avoid shadowing)
router.get('/:id/can-view-contact', authenticateToken, validateIds('id'), canViewTenantContact);
router.get('/:id', validateIds('id'), optionalAuth, getUser);

router.put('/:id/status', 
  authenticateToken, 
  validateIds('id'),
  authorize('admin'), 
  statusUpdateValidation, 
  updateUserStatus
);

// Delete user (admin; users delete their own account via DELETE /api/auth/me)
router.delete('/:id', authenticateToken, validateIds('id'), authorize('admin'), deleteUser);

export default router;
