import branchingService from '../services/branchingService.js';
import logger from '../utils/logger.js';

/**
 * Create a new branching video
 */
export const createBranchingVideo = async (req, res) => {
  try {
    const { title, parentVideoId, branchStructure, createdBy } = req.body;
    
    if (!title || !branchStructure) {
      return res.status(400).json({ error: 'Title and branch structure are required' });
    }
    
    const branchingVideo = await branchingService.createBranchingVideo({
      title,
      parentVideoId,
      branchStructure,
      createdBy
    });
    
    logger.info(`Branching video created: ${branchingVideo.id}`);
    res.status(201).json(branchingVideo);
  } catch (error) {
    logger.error('Error creating branching video:', error);
    res.status(500).json({ error: 'Failed to create branching video' });
  }
};

/**
 * Get branching video by ID
 */
export const getBranchingVideo = async (req, res) => {
  try {
    const { branchingVideoId } = req.params;
    
    const branchingVideo = await branchingService.getBranchingVideo(branchingVideoId);
    
    if (!branchingVideo) {
      return res.status(404).json({ error: 'Branching video not found' });
    }
    
    res.json(branchingVideo);
  } catch (error) {
    logger.error('Error fetching branching video:', error);
    res.status(500).json({ error: 'Failed to fetch branching video' });
  }
};

/**
 * Update branching video structure
 */
export const updateBranchingVideo = async (req, res) => {
  try {
    const { branchingVideoId } = req.params;
    const updates = req.body;
    
    const branchingVideo = await branchingService.updateBranchingVideo(branchingVideoId, updates);
    
    if (!branchingVideo) {
      return res.status(404).json({ error: 'Branching video not found' });
    }
    
    res.json(branchingVideo);
  } catch (error) {
    logger.error('Error updating branching video:', error);
    res.status(500).json({ error: 'Failed to update branching video' });
  }
};

/**
 * Add decision point to branching video
 */
export const addDecisionPoint = async (req, res) => {
  try {
    const { branchingVideoId } = req.params;
    const { timestamp, questionText, choices, timeLimit } = req.body;
    
    if (!timestamp || !questionText || !choices) {
      return res.status(400).json({ error: 'Timestamp, question text, and choices are required' });
    }
    
    const decisionPoint = await branchingService.addDecisionPoint(branchingVideoId, {
      timestamp,
      questionText,
      choices,
      timeLimit
    });
    
    res.status(201).json(decisionPoint);
  } catch (error) {
    logger.error('Error adding decision point:', error);
    res.status(500).json({ error: 'Failed to add decision point' });
  }
};

/**
 * Get decision points for branching video
 */
export const getDecisionPoints = async (req, res) => {
  try {
    const { branchingVideoId } = req.params;
    
    const decisionPoints = await branchingService.getDecisionPoints(branchingVideoId);
    
    res.json(decisionPoints);
  } catch (error) {
    logger.error('Error fetching decision points:', error);
    res.status(500).json({ error: 'Failed to fetch decision points' });
  }
};

/**
 * Record user choice at decision point
 */
export const recordChoice = async (req, res) => {
  try {
    const { branchingVideoId, decisionPointId } = req.params;
    const { userId, choice, timestamp } = req.body;
    
    if (!choice) {
      return res.status(400).json({ error: 'Choice is required' });
    }
    
    const userChoice = await branchingService.recordUserChoice({
      branchingVideoId,
      decisionPointId,
      userId,
      choice,
      timestamp
    });
    
    res.status(201).json(userChoice);
  } catch (error) {
    logger.error('Error recording user choice:', error);
    res.status(500).json({ error: 'Failed to record choice' });
  }
};

/**
 * Get user's viewing path through branching video
 */
export const getViewingPath = async (req, res) => {
  try {
    const { branchingVideoId } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const path = await branchingService.getViewingPath(branchingVideoId, userId);
    
    res.json(path);
  } catch (error) {
    logger.error('Error fetching viewing path:', error);
    res.status(500).json({ error: 'Failed to fetch viewing path' });
  }
};

/**
 * Get analytics for branching video
 */
export const getBranchingAnalytics = async (req, res) => {
  try {
    const { branchingVideoId } = req.params;
    
    const analytics = await branchingService.getAnalytics(branchingVideoId);
    
    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching branching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

/**
 * Delete decision point
 */
export const deleteDecisionPoint = async (req, res) => {
  try {
    const { decisionPointId } = req.params;
    
    await branchingService.deleteDecisionPoint(decisionPointId);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting decision point:', error);
    res.status(500).json({ error: 'Failed to delete decision point' });
  }
};

/**
 * Validate branching video structure
 */
export const validateStructure = async (req, res) => {
  try {
    const { branchStructure } = req.body;
    
    const validation = await branchingService.validateBranchStructure(branchStructure);
    
    res.json(validation);
  } catch (error) {
    logger.error('Error validating branch structure:', error);
    res.status(500).json({ error: 'Failed to validate structure' });
  }
};
