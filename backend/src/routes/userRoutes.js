import express from 'express';
import { 
  createUser, 
  loginUser, 
  refreshToken, 
  getUserProfile, 
  updateUserProfile,
  changePassword,
  getViewingHistory,
  updatePreferences,
  logoutUser
} from '../controllers/userController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { createRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// Authentication routes
router.post('/auth/register', 
  createRateLimit('auth', 5, 15 * 60 * 1000), // 5 requests per 15 minutes
  validateRequest('register'),
  async (req, res) => {
    try {
      await createUser(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.post('/auth/login',
  createRateLimit('auth', 10, 15 * 60 * 1000), // 10 requests per 15 minutes
  validateRequest('login'),
  async (req, res) => {
    try {
      await loginUser(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.post('/auth/refresh',
  validateRequest('refresh'),
  async (req, res) => {
    try {
      await refreshToken(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.post('/auth/logout',
  async (req, res) => {
    try {
      await logoutUser(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// User profile routes
router.get('/users/profile',
  requireAuth,
  async (req, res) => {
    try {
      await getUserProfile(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.put('/users/profile',
  requireAuth,
  validateRequest('updateProfile'),
  async (req, res) => {
    try {
      req.params.userId = req.user.id;
      await updateUserProfile(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.put('/users/password',
  requireAuth,
  validateRequest('changePassword'),
  async (req, res) => {
    try {
      req.params.userId = req.user.id;
      await changePassword(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// User viewing history routes
router.get('/users/history',
  requireAuth,
  async (req, res) => {
    try {
      req.params.userId = req.user.id;
      await getViewingHistory(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.post('/users/history',
  optionalAuth,
  validateRequest('updateHistory'),
  async (req, res) => {
    try {
      // Implementation would go in userController
      const { videoId, timestamp, duration } = req.body;
      const userId = req.user?.id;
      
      // TODO: Implement updateViewingHistory in userController
      res.json({
        success: true,
        data: { message: 'Viewing history updated' },
        error: null
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// User preferences routes
router.put('/users/preferences',
  requireAuth,
  validateRequest('updatePreferences'),
  async (req, res) => {
    try {
      req.params.userId = req.user.id;
      await updatePreferences(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Get user by ID (public, limited info)
router.get('/users/:userId',
  optionalAuth,
  async (req, res) => {
    try {
      await getUserProfile(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

export default router;
