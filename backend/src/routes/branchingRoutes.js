import express from 'express';
import {
  createBranchingVideo,
  getBranchingVideo,
  updateBranchingVideo,
  addDecisionPoint,
  getDecisionPoints,
  recordChoice,
  getViewingPath,
  getBranchingAnalytics,
  deleteDecisionPoint,
  validateStructure
} from '../controllers/branchingController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { createRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// Branching video management
router.post('/:id/branching',
  requireAuth,
  createRateLimit('branching', 10, 60 * 60 * 1000), // 10 branching videos per hour
  validateRequest('createBranching'),
  async (req, res) => {
    try {
      req.body.parentVideoId = req.params.id;
      req.body.createdBy = req.user.id;
      await createBranchingVideo(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.get('/:id/branching',
  optionalAuth,
  async (req, res) => {
    try {
      // Find branching video by parent video ID
      req.params.branchingVideoId = req.params.id;
      await getBranchingVideo(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.put('/:id/branching',
  requireAuth,
  validateRequest('updateBranching'),
  async (req, res) => {
    try {
      req.params.branchingVideoId = req.params.id;
      await updateBranchingVideo(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Decision point management
router.post('/:id/decision-points',
  requireAuth,
  validateRequest('addDecisionPoint'),
  async (req, res) => {
    try {
      req.params.branchingVideoId = req.params.id;
      await addDecisionPoint(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.get('/:id/decision-points',
  optionalAuth,
  async (req, res) => {
    try {
      req.params.branchingVideoId = req.params.id;
      await getDecisionPoints(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.delete('/decision-points/:decisionPointId',
  requireAuth,
  async (req, res) => {
    try {
      await deleteDecisionPoint(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// User choice recording
router.post('/:id/choice',
  optionalAuth,
  createRateLimit('choice', 100, 60 * 1000), // 100 choices per minute
  validateRequest('recordChoice'),
  async (req, res) => {
    try {
      req.body.userId = req.user?.id;
      req.params.branchingVideoId = req.params.id;
      await recordChoice(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// User viewing path
router.get('/:id/path',
  optionalAuth,
  async (req, res) => {
    try {
      req.params.branchingVideoId = req.params.id;
      req.query.userId = req.user?.id || req.query.guestId;
      await getViewingPath(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Analytics
router.get('/:id/analytics',
  optionalAuth,
  async (req, res) => {
    try {
      req.params.branchingVideoId = req.params.id;
      await getBranchingAnalytics(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Structure validation
router.post('/validate-structure',
  requireAuth,
  validateRequest('validateStructure'),
  async (req, res) => {
    try {
      await validateStructure(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Get all branching videos (public)
router.get('/branching/discover',
  optionalAuth,
  async (req, res) => {
    try {
      const { category, difficulty, tags, limit = 10, page = 1 } = req.query;
      
      // TODO: Implement discoverBranchingVideos in branchingController
      res.json({
        success: true,
        data: {
          videos: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
          },
          filters: {
            categories: ['interactive', 'educational', 'entertainment'],
            difficulties: ['easy', 'medium', 'hard']
          }
        },
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

// Get trending branching videos
router.get('/branching/trending',
  async (req, res) => {
    try {
      // TODO: Implement getTrendingBranchingVideos in branchingController
      res.json({
        success: true,
        data: {
          trending: [],
          timeframe: '7d'
        },
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

// Get user's branching videos
router.get('/my/branching',
  requireAuth,
  async (req, res) => {
    try {
      // TODO: Implement getUserBranchingVideos in branchingController
      res.json({
        success: true,
        data: {
          created: [],
          participated: []
        },
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

export default router;
