import videoService from '../services/videoService.js';
import logger from '../utils/logger.js';

/**
 * Upload video file to S3 and enqueue for processing
 */
export const uploadVideo = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const userId = req.user?.id || req.body.userId;
    const metadata = await videoService.storeAndEnqueue(file, userId);
    
    logger.info(`Video uploaded: ${metadata.id} by user ${userId}`);
    res.status(201).json(metadata);
  } catch (error) {
    logger.error('Error uploading video:', error);
    res.status(500).json({ error: 'Failed to upload video' });
  }
};

/**
 * Get video metadata by ID
 */
export const getVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const video = await videoService.getVideoById(videoId);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    res.json(video);
  } catch (error) {
    logger.error('Error fetching video:', error);
    res.status(500).json({ error: 'Failed to fetch video' });
  }
};

/**
 * Stream video with range header support
 */
export const streamVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const range = req.headers.range;
    
    await videoService.streamVideo(videoId, range, res);
  } catch (error) {
    logger.error('Error streaming video:', error);
    res.status(500).json({ error: 'Failed to stream video' });
  }
};

/**
 * Get user's video library
 */
export const getUserVideos = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;
    const { page = 1, limit = 10 } = req.query;
    
    const videos = await videoService.getUserVideos(userId, page, limit);
    res.json(videos);
  } catch (error) {
    logger.error('Error fetching user videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
};

/**
 * Update video metadata
 */
export const updateVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const updates = req.body;
    
    const video = await videoService.updateVideo(videoId, updates);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    res.json(video);
  } catch (error) {
    logger.error('Error updating video:', error);
    res.status(500).json({ error: 'Failed to update video' });
  }
};

/**
 * Delete video
 */
export const deleteVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.user?.id;
    
    await videoService.deleteVideo(videoId, userId);
    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    logger.error('Error deleting video:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
};

/**
 * Get video processing status
 */
export const getProcessingStatus = async (req, res) => {
  try {
    const { videoId } = req.params;
    const status = await videoService.getProcessingStatus(videoId);
    
    res.json(status);
  } catch (error) {
    logger.error('Error fetching processing status:', error);
    res.status(500).json({ error: 'Failed to fetch processing status' });
  }
};
