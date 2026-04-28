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
import { authenticateToken, authorize } from '../middleware/auth.js';

const router = express.Router();

// Validation rules
const statusUpdateValidation = [
  body('isActive').isBoolean().withMessage('isActive must be a boolean')
];

// Security endpoints (must be above /:id to avoid shadowing)
router.post('/change-email', authenticateToken, changeEmail);
router.post('/confirm-email-change', authenticateToken, confirmEmailChange);
router.post('/toggle-2fa', authenticateToken, toggle2FA);
router.post('/change-password', authenticateToken, changePassword);

// Update user profile (self or admin)
router.put('/:id', authenticateToken, updateUserProfile);

// Routes
router.get('/', getUsers);
router.get('/search', searchUsers);
// Favourites (tenant)
router.get('/me/favourites', authenticateToken, getMyFavourites);
router.post('/me/favourites', authenticateToken, addFavourite);
router.delete('/me/favourites/:itemType/:itemId', authenticateToken, removeFavourite);
// Contact visibility check (must be above '/:id' to avoid shadowing)
router.get('/:id/can-view-contact', authenticateToken, canViewTenantContact);
router.get('/:id', getUser);

router.put('/:id/status', 
  authenticateToken, 
  authorize('admin'), 
  statusUpdateValidation, 
  updateUserStatus
);

// Delete user (self or admin)
router.delete('/:id', authenticateToken, deleteUser);

export default router;
