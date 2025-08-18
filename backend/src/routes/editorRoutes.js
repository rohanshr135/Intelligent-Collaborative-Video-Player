import express from 'express';
import multer from 'multer';
import {
  createProject,
  getProject,
  addSceneMarker,
  getSceneMarkers,
  updateSceneMarker,
  deleteSceneMarker,
  generateCutSuggestions,
  exportProject,
  importProject,
  getUserProjects,
  updateProject,
  deleteProject,
  generateTimelineThumbnails
} from '../controllers/editorController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { createRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// Configure multer for project file uploads
const upload = multer({
  dest: 'uploads/projects/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for project files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/json',
      'text/plain',
      'application/xml',
      'text/xml'
    ];
    
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.edl')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JSON, EDL, and XML project files are allowed.'), false);
    }
  }
});

// Project management
router.post('/projects',
  requireAuth,
  createRateLimit('editor-projects', 20, 60 * 60 * 1000), // 20 projects per hour
  validateRequest('createProject'),
  async (req, res) => {
    try {
      req.body.userId = req.user.id;
      await createProject(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.get('/projects/:projectId',
  requireAuth,
  async (req, res) => {
    try {
      await getProject(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.put('/projects/:projectId',
  requireAuth,
  validateRequest('updateProject'),
  async (req, res) => {
    try {
      await updateProject(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.delete('/projects/:projectId',
  requireAuth,
  async (req, res) => {
    try {
      req.body.userId = req.user.id;
      await deleteProject(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Get user's projects
router.get('/my/projects',
  requireAuth,
  async (req, res) => {
    try {
      req.params.userId = req.user.id;
      await getUserProjects(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Scene markers management
router.post('/markers',
  requireAuth,
  createRateLimit('editor-markers', 50, 60 * 1000), // 50 markers per minute
  validateRequest('addSceneMarker'),
  async (req, res) => {
    try {
      // If projectId is not provided, create a marker directly on the video
      if (!req.body.projectId && req.body.videoId) {
        // Create a temporary project or add marker directly to video
        req.body.createdBy = req.user.id;
      }
      await addSceneMarker(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.get('/markers/:videoId',
  optionalAuth,
  async (req, res) => {
    try {
      // Get markers for a specific video
      req.params.projectId = req.params.videoId; // Assume project ID = video ID for simplicity
      await getSceneMarkers(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.put('/markers/:markerId',
  requireAuth,
  validateRequest('updateSceneMarker'),
  async (req, res) => {
    try {
      await updateSceneMarker(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.delete('/markers/:markerId',
  requireAuth,
  async (req, res) => {
    try {
      await deleteSceneMarker(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Project markers (specific to a project)
router.get('/projects/:projectId/markers',
  requireAuth,
  async (req, res) => {
    try {
      await getSceneMarkers(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.post('/projects/:projectId/markers',
  requireAuth,
  validateRequest('addSceneMarker'),
  async (req, res) => {
    try {
      await addSceneMarker(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// AI-powered features
router.post('/projects/:projectId/cut-suggestions',
  requireAuth,
  createRateLimit('editor-ai', 10, 60 * 60 * 1000), // 10 AI suggestions per hour
  validateRequest('generateCutSuggestions'),
  async (req, res) => {
    try {
      await generateCutSuggestions(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.post('/projects/:projectId/thumbnails',
  requireAuth,
  createRateLimit('editor-thumbnails', 5, 60 * 60 * 1000), // 5 thumbnail generations per hour
  async (req, res) => {
    try {
      await generateTimelineThumbnails(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Export functionality
router.post('/export',
  requireAuth,
  createRateLimit('editor-export', 10, 60 * 60 * 1000), // 10 exports per hour
  validateRequest('exportProject'),
  async (req, res) => {
    try {
      await exportProject(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.post('/projects/:projectId/export',
  requireAuth,
  validateRequest('exportProject'),
  async (req, res) => {
    try {
      await exportProject(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Import functionality
router.post('/import',
  requireAuth,
  upload.single('projectFile'),
  async (req, res) => {
    try {
      req.body.userId = req.user.id;
      await importProject(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Templates and presets
router.get('/templates',
  optionalAuth,
  async (req, res) => {
    try {
      res.json({
        success: true,
        data: {
          templates: [
            {
              id: 'basic-cut',
              name: 'Basic Cut Template',
              description: 'Simple cuts and transitions',
              markers: []
            },
            {
              id: 'highlight-reel',
              name: 'Highlight Reel',
              description: 'Best moments compilation',
              markers: []
            },
            {
              id: 'chapter-based',
              name: 'Chapter-based Edit',
              description: 'Organized by chapters',
              markers: []
            }
          ]
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

// Collaboration features
router.post('/projects/:projectId/share',
  requireAuth,
  validateRequest('shareProject'),
  async (req, res) => {
    try {
      // TODO: Implement project sharing
      const { userIds, permissions } = req.body;
      
      res.json({
        success: true,
        data: {
          sharedWith: userIds,
          shareCode: `EDIT-${req.params.projectId.slice(-6).toUpperCase()}`
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

// Project analytics
router.get('/projects/:projectId/analytics',
  requireAuth,
  async (req, res) => {
    try {
      // TODO: Implement project analytics
      res.json({
        success: true,
        data: {
          markers: {
            total: 0,
            byType: {}
          },
          exports: 0,
          collaborators: 0,
          lastModified: new Date().toISOString()
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
