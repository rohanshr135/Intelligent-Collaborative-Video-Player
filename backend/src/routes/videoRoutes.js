import express from 'express';
import multer from 'multer';
import {
  uploadVideo,
  getVideo,
  streamVideo,
  updateVideo,
  deleteVideo,
  getUserVideos,
  getProcessingStatus
} from '../controllers/videoController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { createRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// Configure multer for video uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/avi',
      'video/mov',
      'video/wmv'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only video files are allowed.'), false);
    }
  }
});

// Video upload route
router.post('/upload',
  requireAuth,
  createRateLimit('upload', 3, 60 * 60 * 1000), // 3 uploads per hour
  upload.single('video'),
  validateRequest('uploadVideo'),
  async (req, res) => {
    try {
      await uploadVideo(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Get video metadata
router.get('/:id',
  optionalAuth,
  async (req, res) => {
    try {
      await getVideo(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Stream video with range support
router.get('/:id/stream',
  optionalAuth,
  async (req, res) => {
    try {
      await streamVideo(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Update video metadata
router.put('/:id',
  requireAuth,
  validateRequest('updateVideo'),
  async (req, res) => {
    try {
      await updateVideo(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Delete video
router.delete('/:id',
  requireAuth,
  async (req, res) => {
    try {
      await deleteVideo(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Get user's videos
router.get('/user/:userId',
  optionalAuth,
  async (req, res) => {
    try {
      await getUserVideos(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Get current user's videos
router.get('/my/videos',
  requireAuth,
  async (req, res) => {
    try {
      req.query.userId = req.user.id;
      await getUserVideos(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Get video processing status
router.get('/:id/status',
  optionalAuth,
  async (req, res) => {
    try {
      await getProcessingStatus(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Video search endpoint
router.get('/',
  optionalAuth,
  validateRequest('searchVideos'),
  async (req, res) => {
    try {
      // TODO: Implement searchVideos in videoController
      const { q, category, tags, limit = 10, page = 1 } = req.query;
      
      res.json({
        success: true,
        data: {
          videos: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
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

export default router;
