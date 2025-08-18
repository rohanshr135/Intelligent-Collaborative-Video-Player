import express from 'express';
import multer from 'multer';
import {
  transcribeVideo,
  getTranscription,
  generateSummary,
  getSummary,
  detectScenes,
  getScenes,
  generateChapters,
  getJobStatus,
  cancelJob
} from '../controllers/aiController.js';
import { generateSummaryEndpoint } from '../controllers/summarizer.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { createRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// Configure multer for audio file uploads
const upload = multer({
  dest: 'uploads/audio/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for audio
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'audio/mp3',
      'audio/wav',
      'audio/m4a',
      'audio/ogg',
      'audio/webm',
      'video/mp4', // Allow video files for audio extraction
      'video/webm',
      'video/ogg'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio/video files are allowed.'), false);
    }
  }
});

// Transcription routes
router.post('/transcribe',
  requireAuth,
  createRateLimit('ai-transcribe', 5, 60 * 60 * 1000), // 5 transcriptions per hour
  upload.single('audio'),
  validateRequest('transcribeVideo'),
  async (req, res) => {
    try {
      await transcribeVideo(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.get('/transcript/:videoId',
  optionalAuth,
  async (req, res) => {
    try {
      await getTranscription(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Summarization routes
router.post('/summarize',
  requireAuth,
  createRateLimit('ai-summarize', 20, 60 * 60 * 1000), // 20 summaries per hour
  validateRequest('generateSummary'),
  async (req, res) => {
    try {
      await generateSummary(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Legacy summarize endpoint (for backward compatibility)
router.post('/summarize-legacy',
  requireAuth,
  createRateLimit('ai-summarize', 20, 60 * 60 * 1000),
  validateRequest('generateSummaryLegacy'),
  async (req, res) => {
    try {
      await generateSummaryEndpoint(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.get('/summary/:videoId',
  optionalAuth,
  async (req, res) => {
    try {
      await getSummary(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Scene detection routes
router.post('/analyze-scenes',
  requireAuth,
  createRateLimit('ai-scenes', 10, 60 * 60 * 1000), // 10 scene analysis per hour
  validateRequest('detectScenes'),
  async (req, res) => {
    try {
      await detectScenes(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.get('/scenes/:videoId',
  optionalAuth,
  async (req, res) => {
    try {
      await getScenes(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Chapter generation routes
router.post('/generate-chapters',
  requireAuth,
  createRateLimit('ai-chapters', 10, 60 * 60 * 1000), // 10 chapter generation per hour
  validateRequest('generateChapters'),
  async (req, res) => {
    try {
      await generateChapters(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Job management routes
router.get('/job/:jobId',
  requireAuth,
  async (req, res) => {
    try {
      await getJobStatus(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

router.delete('/job/:jobId',
  requireAuth,
  async (req, res) => {
    try {
      await cancelJob(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// AI capabilities endpoint
router.get('/capabilities',
  async (req, res) => {
    try {
      res.json({
        success: true,
        data: {
          transcription: {
            supported: true,
            models: ['whisper-1'],
            maxFileSize: '100MB',
            supportedFormats: ['mp3', 'wav', 'm4a', 'ogg', 'webm', 'mp4']
          },
          summarization: {
            supported: true,
            models: ['gemini-pro'],
            types: ['pause', 'segment', 'full', 'chapter']
          },
          sceneDetection: {
            supported: true,
            methods: ['transcript', 'visual', 'audio']
          },
          chapterGeneration: {
            supported: true,
            minDuration: 300 // 5 minutes
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

// AI analytics endpoint
router.get('/analytics',
  requireAuth,
  async (req, res) => {
    try {
      // TODO: Implement AI usage analytics
      res.json({
        success: true,
        data: {
          usage: {
            transcriptions: 0,
            summaries: 0,
            sceneAnalysis: 0
          },
          limits: {
            transcriptions: 5,
            summaries: 20,
            sceneAnalysis: 10
          },
          resetTime: new Date(Date.now() + 60 * 60 * 1000).toISOString()
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
