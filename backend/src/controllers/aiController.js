import aiService from '../services/aiService.js';
import logger from '../utils/logger.js';

/**
 * Transcribe audio/video using Whisper
 */
export const transcribeVideo = async (req, res) => {
  try {
    const { videoId } = req.body;
    const audioFile = req.file;
    
    if (!videoId && !audioFile) {
      return res.status(400).json({ error: 'Video ID or audio file is required' });
    }
    
    const jobId = await aiService.enqueueTranscription(videoId, audioFile);
    
    logger.info(`Transcription job queued: ${jobId} for video ${videoId}`);
    res.status(202).json({ jobId, status: 'queued' });
  } catch (error) {
    logger.error('Error starting transcription:', error);
    res.status(500).json({ error: 'Failed to start transcription' });
  }
};

/**
 * Get transcription status and result
 */
export const getTranscription = async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const transcription = await aiService.getTranscription(videoId);
    
    if (!transcription) {
      return res.status(404).json({ error: 'Transcription not found' });
    }
    
    res.json(transcription);
  } catch (error) {
    logger.error('Error fetching transcription:', error);
    res.status(500).json({ error: 'Failed to fetch transcription' });
  }
};

/**
 * Generate summary for video segment
 */
export const generateSummary = async (req, res) => {
  try {
    const { videoId, startTimestamp, endTimestamp } = req.body;
    
    if (!videoId || startTimestamp === undefined) {
      return res.status(400).json({ error: 'Video ID and start timestamp are required' });
    }
    
    const summary = await aiService.generateSummary(videoId, startTimestamp, endTimestamp);
    
    res.json(summary);
  } catch (error) {
    logger.error('Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
};

/**
 * Get cached summary for video segment
 */
export const getSummary = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { timestamp } = req.query;
    
    const summary = await aiService.getCachedSummary(videoId, parseFloat(timestamp));
    
    if (!summary) {
      return res.status(404).json({ error: 'Summary not found' });
    }
    
    res.json(summary);
  } catch (error) {
    logger.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
};

/**
 * Detect scenes and important segments
 */
export const detectScenes = async (req, res) => {
  try {
    const { videoId } = req.body;
    
    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }
    
    const jobId = await aiService.enqueueSceneDetection(videoId);
    
    logger.info(`Scene detection job queued: ${jobId} for video ${videoId}`);
    res.status(202).json({ jobId, status: 'queued' });
  } catch (error) {
    logger.error('Error starting scene detection:', error);
    res.status(500).json({ error: 'Failed to start scene detection' });
  }
};

/**
 * Get scene detection results
 */
export const getScenes = async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const scenes = await aiService.getScenes(videoId);
    
    res.json(scenes || []);
  } catch (error) {
    logger.error('Error fetching scenes:', error);
    res.status(500).json({ error: 'Failed to fetch scenes' });
  }
};

/**
 * Generate automatic chapter markers
 */
export const generateChapters = async (req, res) => {
  try {
    const { videoId } = req.body;
    
    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }
    
    const chapters = await aiService.generateChapters(videoId);
    
    res.json(chapters);
  } catch (error) {
    logger.error('Error generating chapters:', error);
    res.status(500).json({ error: 'Failed to generate chapters' });
  }
};

/**
 * Get AI job status
 */
export const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const status = await aiService.getJobStatus(jobId);
    
    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(status);
  } catch (error) {
    logger.error('Error fetching job status:', error);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
};

/**
 * Cancel AI job
 */
export const cancelJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    await aiService.cancelJob(jobId);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error canceling job:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
};
