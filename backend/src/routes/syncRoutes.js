import express from 'express';
import {
  createSession,
  joinSession,
  getSession,
  updateSessionState,
  reportLag,
  leaveSession,
  getParticipants,
  endSession
} from '../controllers/syncController.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { createRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// Create sync session
router.post('/create-session',
  optionalAuth,
  createRateLimit('sync', 10, 60 * 1000), // 10 sessions per minute
  validateRequest('createSession'),
  async (req, res) => {
    try {
      await createSession(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Join sync session
router.post('/join-session',
  optionalAuth,
  validateRequest('joinSession'),
  async (req, res) => {
    try {
      await joinSession(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Join session by QR code or session code
router.post('/join/:code',
  optionalAuth,
  validateRequest('joinByCode'),
  async (req, res) => {
    try {
      req.body.sessionId = req.params.code;
      await joinSession(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Get session details
router.get('/session/:id',
  optionalAuth,
  async (req, res) => {
    try {
      await getSession(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Update session playback state
router.put('/session/:id/state',
  optionalAuth,
  createRateLimit('sync-state', 30, 60 * 1000), // 30 state updates per minute
  validateRequest('updateSessionState'),
  async (req, res) => {
    try {
      await updateSessionState(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Report lag compensation
router.post('/session/:id/lag',
  optionalAuth,
  validateRequest('reportLag'),
  async (req, res) => {
    try {
      await reportLag(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Leave sync session
router.post('/session/:id/leave',
  optionalAuth,
  validateRequest('leaveSession'),
  async (req, res) => {
    try {
      await leaveSession(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Get session participants
router.get('/session/:id/participants',
  optionalAuth,
  async (req, res) => {
    try {
      await getParticipants(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// End sync session (host only)
router.delete('/session/:id',
  optionalAuth,
  async (req, res) => {
    try {
      await endSession(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: error.message
      });
    }
  }
);

// Get user's active sessions
router.get('/my-sessions',
  requireAuth,
  async (req, res) => {
    try {
      // TODO: Implement getUserSessions in syncController
      res.json({
        success: true,
        data: {
          hosted: [],
          participating: []
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

// Generate QR code for session
router.get('/session/:id/qr',
  optionalAuth,
  async (req, res) => {
    try {
      // TODO: Implement generateQRCode in syncController
      const { sessionId } = req.params;
      
      res.json({
        success: true,
        data: {
          qrCodeUrl: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`,
          sessionCode: sessionId,
          joinUrl: `/sync/join/${sessionId}`
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
