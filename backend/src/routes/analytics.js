import express from 'express';
import {
  trackEvent,
  getAnalytics,
  getHeatmap,
  getUserAnalytics,
  exportAnalytics,
  getDashboard
} from '../controllers/analyticsController.js';

const router = express.Router();

// Analytics routes
router.post('/track', trackEvent);
router.get('/:roomCode/analytics', getAnalytics);
router.get('/:roomCode/heatmap', getHeatmap);
router.get('/:roomCode/users/:userId', getUserAnalytics);
router.get('/:roomCode/export', exportAnalytics);
router.get('/:roomCode/dashboard', getDashboard);

export default router;
