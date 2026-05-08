import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  createConversation,
  getMyConversations,
  getConversationMessages,
  sendMessage,
  markConversationRead,
  deleteConversation
} from '../controllers/chatController.js';

const router = express.Router();
router.use(authenticateToken);

router.get('/', getMyConversations);
router.post('/', createConversation);
router.get('/:id/messages', getConversationMessages);
router.post('/:id/messages', sendMessage);
router.patch('/:id/read', markConversationRead);
router.delete('/:id', deleteConversation);

export default router;
