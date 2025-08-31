import express from 'express';
import {
  sendMessage,
  getMessages,
  editMessage,
  deleteMessage,
  getChatStats
} from '../controllers/chatController.js';

const router = express.Router();

// Chat routes
router.post('/send', sendMessage);
router.get('/:roomCode/messages', getMessages);
router.put('/messages/:messageId', editMessage);
router.delete('/messages/:messageId', deleteMessage);
router.get('/:roomCode/stats', getChatStats);

export default router;
