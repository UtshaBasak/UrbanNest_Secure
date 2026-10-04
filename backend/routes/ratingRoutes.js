import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { validateIds } from '../utils/validation.js';
import { createRating, getRatingSummary, listRatings, canRateCheck, deleteRating } from '../controllers/ratingController.js';

const router = express.Router();

// Private: eligibility check first (avoid shadowing by :userId)
router.get('/can-rate/check', authenticateToken, canRateCheck);

// Public: summary and list
router.get('/:userId/summary', validateIds('userId'), getRatingSummary);
router.get('/:userId', validateIds('userId'), listRatings);

// Private: create rating
router.post('/', authenticateToken, createRating);

// Private: delete rating
router.delete('/:id', authenticateToken, validateIds('id'), deleteRating);

export default router;
