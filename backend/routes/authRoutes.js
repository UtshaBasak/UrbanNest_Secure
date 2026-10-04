import express from 'express';
import { body } from 'express-validator';
import {
  register,
  login,
  logout,
  getCurrentUser,
  updateCurrentUser,
  deleteCurrentUser,
  sendOtp,
  verifyOtp,
  verify2FA,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
} from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Validation rules
const registerValidation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email')
    .isEmail().withMessage('Please enter a valid email')
    .customSanitizer(v => v.toLowerCase().trim()),
  body('password').isLength({ min: 12 }).withMessage('Password must be at least 12 characters'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('role').optional().isIn(['owner', 'tenant']).withMessage('Invalid role'),
];

const loginValidation = [
  body('email')
    .isEmail().withMessage('Please enter a valid email')
    .customSanitizer(v => v.toLowerCase().trim()),
  body('password').notEmpty().withMessage('Password is required'),
];

const updateProfileValidation = [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('phone').optional().notEmpty().withMessage('Phone number is required'),
  body('profileImage').optional().isString().withMessage('Profile image must be a string'),
];

// Public routes
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/verify-2fa', verify2FA);
router.post('/refresh', refreshAccessToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/logout', logout);

// Protected routes
router.get('/me', authenticateToken, getCurrentUser);
router.put('/me', authenticateToken, updateProfileValidation, updateCurrentUser);
router.delete('/me', authenticateToken, deleteCurrentUser);

export default router;
