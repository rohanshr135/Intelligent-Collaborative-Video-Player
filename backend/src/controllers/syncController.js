import syncService from '../services/syncService.js';
import logger from '../utils/logger.js';

/**
 * Create a new sync session
 */
export const createSession = async (req, res) => {
  try {
    const { videoId, name, hostUserId } = req.body;
    
    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }
    
    const session = await syncService.createSession(videoId, name, hostUserId);
    
    logger.info(`Sync session created: ${session.id} for video ${videoId}`);
    res.status(201).json(session);
  } catch (error) {
    logger.error('Error creating sync session:', error);
    res.status(500).json({ error: 'Failed to create sync session' });
  }
};

/**
 * Join an existing sync session
 */
export const joinSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { deviceId, userId } = req.body;
    
    const participant = await syncService.joinSession(sessionId, deviceId, userId);
    
    if (!participant) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    logger.info(`Device ${deviceId} joined session ${sessionId}`);
    res.json(participant);
  } catch (error) {
    logger.error('Error joining sync session:', error);
    res.status(500).json({ error: 'Failed to join session' });
  }
};

/**
 * Get sync session details
 */
export const getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await syncService.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(session);
  } catch (error) {
    logger.error('Error fetching sync session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
};

/**
 * Update sync session state (play/pause/seek)
 */
export const updateSessionState = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { currentTimestamp, isPlaying, playbackRate } = req.body;
    
    const session = await syncService.updateSessionState(sessionId, {
      currentTimestamp,
      isPlaying,
      playbackRate
    });
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ success: true, session });
  } catch (error) {
    logger.error('Error updating session state:', error);
    res.status(500).json({ error: 'Failed to update session state' });
  }
};

/**
 * Report lag compensation for a participant
 */
export const reportLag = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { deviceId, lagOffsetMs, latency } = req.body;
    
    await syncService.updateLagCompensation(sessionId, deviceId, lagOffsetMs, latency);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error reporting lag:', error);
    res.status(500).json({ error: 'Failed to report lag' });
  }
};

/**
 * Leave sync session
 */
export const leaveSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { deviceId } = req.body;
    
    await syncService.leaveSession(sessionId, deviceId);
    
    logger.info(`Device ${deviceId} left session ${sessionId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error leaving session:', error);
    res.status(500).json({ error: 'Failed to leave session' });
  }
};

/**
 * Get all participants in a session
 */
export const getParticipants = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const participants = await syncService.getParticipants(sessionId);
    
    res.json(participants);
  } catch (error) {
    logger.error('Error fetching participants:', error);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
};

/**
 * End sync session
 */
export const endSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { hostUserId } = req.body;
    
    await syncService.endSession(sessionId, hostUserId);
    
    logger.info(`Sync session ${sessionId} ended by host ${hostUserId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
};
