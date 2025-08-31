import express from 'express';
import {
  generateSummary,
  getSummary,
  exportSummary
} from '../controllers/summaryController.js';

const router = express.Router();

// Summary routes
router.post('/generate', generateSummary);
router.get('/:roomCode/summary', getSummary);
router.get('/:roomCode/export', exportSummary);

export default router;
