import Video from '../models/Video.js';
import videoUtils from '../utils/videoUtils.js';
import generalUtils from '../utils/generalUtils.js';
import encryptionUtils from '../utils/encryptionUtils.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

/**
 * Video Service - Handles video upload, processing, metadata extraction, and streaming
 */
export class VideoService {
  constructor() {
    this.uploadPath = process.env.UPLOAD_PATH || './uploads/videos';
    this.thumbnailPath = process.env.THUMBNAIL_PATH || './uploads/thumbnails';
    this.tempPath = process.env.TEMP_PATH || './temp';
    
    // Ensure directories exist
    this.initializeDirectories();
  }

  /**
   * Initialize required directories
   */
  async initializeDirectories() {
    const dirs = [this.uploadPath, this.thumbnailPath, this.tempPath];
    
    for (const dir of dirs) {
      try {
        await access(dir);
      } catch {
        await mkdir(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    }
  }

  /**
   * Store video file and extract metadata
   * @param {Buffer} fileBuffer - uploaded video file buffer
   * @param {Object} fileMeta - file metadata including mimetype, filename
   * @param {String} userId - uploader user id
   * @param {Object} options - additional processing options
   * @returns {Promise<Object>} created video record
   */
  async storeAndProcessVideo(fileBuffer, fileMeta, userId, options = {}) {
    try {
      logger.info('Starting video processing:', {
        filename: fileMeta.originalname,
        size: fileMeta.size,
        mimetype: fileMeta.mimetype,
        userId
      });

      // Validate file type
      if (!videoUtils.isSupportedVideoMime(fileMeta.mimetype)) {
        throw new Error(`Unsupported video format: ${fileMeta.mimetype}`);
      }

      // Generate unique identifiers
      const videoId = generalUtils.generateUUID();
      const sanitizedFilename = generalUtils.sanitizeFilename(fileMeta.originalname);
      const fileExtension = path.extname(sanitizedFilename);
      const uniqueFilename = `${videoId}${fileExtension}`;
      
      // Create file paths
      const userUploadDir = path.join(this.uploadPath, userId);
      const filePath = path.join(userUploadDir, uniqueFilename);
      const thumbnailDir = path.join(this.thumbnailPath, userId);
      const thumbnailPath = path.join(thumbnailDir, `${videoId}.jpg`);

      // Ensure user directories exist
      await mkdir(userUploadDir, { recursive: true });
      await mkdir(thumbnailDir, { recursive: true });

      // Save file to storage
      await writeFile(filePath, fileBuffer);
      logger.info('Video file saved:', { filePath });

      // Extract metadata
      const metadata = await videoUtils.getVideoMetadata(filePath);
      logger.info('Video metadata extracted:', {
        duration: metadata.duration,
        resolution: metadata.resolution,
        format: metadata.format
      });

      // Generate thumbnail
      const thumbnailTimestamp = Math.min(10, metadata.duration / 2);
      await videoUtils.generateThumbnail(filePath, thumbnailPath, thumbnailTimestamp);
      logger.info('Thumbnail generated:', { thumbnailPath });

      // Prepare video record
      const videoData = {
        _id: videoId,
        title: options.title || sanitizedFilename.replace(fileExtension, ''),
        description: options.description || '',
        filename: uniqueFilename,
        originalFilename: fileMeta.originalname,
        filePath: filePath,
        thumbnailPath: thumbnailPath,
        uploadedBy: userId,
        
        // File information
        fileSize: fileMeta.size,
        mimeType: fileMeta.mimetype,
        
        // Video metadata
        duration: metadata.duration,
        resolution: metadata.resolution,
        width: metadata.video.width,
        height: metadata.video.height,
        frameRate: metadata.video.frameRate,
        codec: metadata.video.codec,
        bitRate: metadata.video.bitRate,
        aspectRatio: metadata.video.aspectRatio,
        
        // Audio metadata
        hasAudio: metadata.hasAudio,
        audioCodec: metadata.audio?.codec,
        audioChannels: metadata.audio?.channels,
        audioSampleRate: metadata.audio?.sampleRate,
        
        // Processing status
        processingStatus: 'completed',
        isPublic: options.isPublic || false,
        allowDownload: options.allowDownload !== false,
        
        // Quality classification
        quality: videoUtils.getVideoQuality(metadata.video.width, metadata.video.height),
        isHD: metadata.isHD,
        is4K: metadata.is4K,
        
        // Metadata (encrypted for sensitive data)
        rawMetadata: encryptionUtils.encrypt(JSON.stringify(metadata.raw)),
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save to database
      const video = new Video(videoData);
      await video.save();

      logger.info('Video processed successfully:', {
        videoId,
        title: video.title,
        duration: generalUtils.formatDuration(video.duration),
        size: generalUtils.formatBytes(video.fileSize)
      });

      // Queue transcoding job if needed
      if (options.enableTranscoding) {
        await this.enqueueTranscodingJob(videoId, filePath);
      }

      return video;

    } catch (error) {
      logger.error('Video processing failed:', {
        filename: fileMeta.originalname,
        userId,
        error: error.message
      });
      throw new Error(`Video processing failed: ${error.message}`);
    }
  }

  /**
   * Update video metadata
   * @param {String} videoId - video ID
   * @param {Object} updates - fields to update
   * @param {String} userId - user making the update
   * @returns {Promise<Object>} updated video
   */
  async updateVideoMetadata(videoId, updates, userId) {
    try {
      const video = await Video.findById(videoId);
      
      if (!video) {
        throw new Error('Video not found');
      }

      // Check ownership or admin privileges
      if (video.uploadedBy.toString() !== userId && !this.isAdmin(userId)) {
        throw new Error('Access denied');
      }

      // Sanitize updates
      const allowedUpdates = [
        'title', 'description', 'isPublic', 'allowDownload', 
        'tags', 'category', 'customThumbnail'
      ];
      
      const sanitizedUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key)) {
          if (key === 'title' && value) {
            sanitizedUpdates[key] = generalUtils.sanitizeFilename(value);
          } else {
            sanitizedUpdates[key] = value;
          }
        }
      }

      sanitizedUpdates.updatedAt = new Date();

      const updatedVideo = await Video.findByIdAndUpdate(
        videoId, 
        sanitizedUpdates, 
        { new: true, runValidators: true }
      );

      logger.info('Video metadata updated:', {
        videoId,
        updates: Object.keys(sanitizedUpdates),
        userId
      });

      return updatedVideo;

    } catch (error) {
      logger.error('Video metadata update failed:', {
        videoId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get video streaming information with range support
   * @param {String} videoId - video ID
   * @param {String} rangeHeader - HTTP Range header
   * @param {String} userId - requesting user ID (optional)
   * @returns {Promise<Object>} streaming information
   */
  async getStreamingInfo(videoId, rangeHeader = null, userId = null) {
    try {
      const video = await Video.findById(videoId);
      
      if (!video) {
        throw new Error('Video not found');
      }

      // Check access permissions
      if (!video.isPublic && video.uploadedBy.toString() !== userId) {
        throw new Error('Access denied');
      }

      // Check if file exists
      const fileInfo = await generalUtils.getFileInfo(video.filePath);
      if (!fileInfo.exists) {
        throw new Error('Video file not found');
      }

      const fileSize = fileInfo.size;
      let start = 0;
      let end = fileSize - 1;
      let contentLength = fileSize;

      // Parse range header if provided
      if (rangeHeader) {
        const range = rangeHeader.replace(/bytes=/, '').split('-');
        start = parseInt(range[0], 10) || 0;
        end = parseInt(range[1], 10) || fileSize - 1;
        contentLength = end - start + 1;
      }

      // Log streaming access
      logger.info('Video streaming requested:', {
        videoId,
        title: video.title,
        userId,
        range: rangeHeader,
        start,
        end,
        contentLength
      });

      return {
        video,
        filePath: video.filePath,
        fileSize,
        start,
        end,
        contentLength,
        mimeType: video.mimeType,
        hasRange: !!rangeHeader
      };

    } catch (error) {
      logger.error('Video streaming failed:', {
        videoId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete video and associated files
   * @param {String} videoId - video ID
   * @param {String} userId - user requesting deletion
   * @returns {Promise<Boolean>} deletion success
   */
  async deleteVideo(videoId, userId) {
    try {
      const video = await Video.findById(videoId);
      
      if (!video) {
        throw new Error('Video not found');
      }

      // Check ownership or admin privileges
      if (video.uploadedBy.toString() !== userId && !this.isAdmin(userId)) {
        throw new Error('Access denied');
      }

      // Delete physical files
      const filesToDelete = [video.filePath, video.thumbnailPath];
      
      for (const filePath of filesToDelete) {
        if (filePath) {
          try {
            await fs.promises.unlink(filePath);
            logger.info(`Deleted file: ${filePath}`);
          } catch (error) {
            logger.warn(`Failed to delete file: ${filePath}`, error);
          }
        }
      }

      // Delete database record
      await Video.findByIdAndDelete(videoId);

      logger.info('Video deleted successfully:', {
        videoId,
        title: video.title,
        userId
      });

      return true;

    } catch (error) {
      logger.error('Video deletion failed:', {
        videoId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Search videos with filtering and pagination
   * @param {Object} criteria - search criteria
   * @param {Object} options - pagination and sorting options
   * @returns {Promise<Object>} search results
   */
  async searchVideos(criteria = {}, options = {}) {
    try {
      const {
        query,
        category,
        quality,
        duration,
        userId,
        isPublic,
        uploadedBy
      } = criteria;

      const {
        page = 1,
        limit = 20,
        sort = '-createdAt',
        includePrivate = false
      } = options;

      // Build search filter
      const filter = {};

      if (query) {
        filter.$or = [
          { title: new RegExp(query, 'i') },
          { description: new RegExp(query, 'i') },
          { tags: { $in: [new RegExp(query, 'i')] } }
        ];
      }

      if (category) {
        filter.category = category;
      }

      if (quality) {
        filter.quality = quality;
      }

      if (duration) {
        if (duration.min !== undefined) filter.duration = { $gte: duration.min };
        if (duration.max !== undefined) filter.duration = { ...filter.duration, $lte: duration.max };
      }

      if (uploadedBy) {
        filter.uploadedBy = uploadedBy;
      }

      // Handle privacy settings
      if (!includePrivate) {
        filter.$or = [
          { isPublic: true },
          { uploadedBy: userId }
        ];
      }

      // Execute search with pagination
      const skip = (page - 1) * limit;
      
      const [videos, total] = await Promise.all([
        Video.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('uploadedBy', 'username email')
          .lean(),
        Video.countDocuments(filter)
      ]);

      // Add formatted fields
      const formattedVideos = videos.map(video => ({
        ...video,
        formattedDuration: generalUtils.formatDuration(video.duration),
        formattedSize: generalUtils.formatBytes(video.fileSize),
        formattedCreatedAt: video.createdAt.toISOString()
      }));

      logger.info('Video search completed:', {
        query,
        total,
        page,
        limit,
        resultCount: videos.length
      });

      return {
        videos: formattedVideos,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      };

    } catch (error) {
      logger.error('Video search failed:', {
        criteria,
        options,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get video analytics and statistics
   * @param {String} videoId - video ID
   * @param {String} userId - requesting user ID
   * @returns {Promise<Object>} video analytics
   */
  async getVideoAnalytics(videoId, userId) {
    try {
      const video = await Video.findById(videoId);
      
      if (!video) {
        throw new Error('Video not found');
      }

      // Check access permissions
      if (video.uploadedBy.toString() !== userId && !this.isAdmin(userId)) {
        throw new Error('Access denied');
      }

      // TODO: Implement analytics aggregation from view logs
      // This would typically aggregate data from view tracking
      
      const analytics = {
        videoId,
        title: video.title,
        totalViews: video.viewCount || 0,
        totalDuration: video.duration,
        createdAt: video.createdAt,
        
        // Placeholder analytics - implement based on your tracking needs
        dailyViews: [], // Last 30 days
        viewerRetention: [], // Retention curve
        popularSegments: [], // Most watched segments
        deviceBreakdown: {}, // Device types
        locationBreakdown: {}, // Geographic distribution
        
        summary: {
          avgViewDuration: 0,
          completionRate: 0,
          engagementScore: 0
        }
      };

      return analytics;

    } catch (error) {
      logger.error('Video analytics retrieval failed:', {
        videoId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Enqueue transcoding job for adaptive streaming
   * @param {String} videoId - video ID
   * @param {String} filePath - source file path
   * @returns {Promise<Object>} job information
   */
  async enqueueTranscodingJob(videoId, filePath) {
    try {
      // This would typically integrate with a job queue like Bull or AWS MediaConvert
      logger.info('Transcoding job enqueued:', { videoId, filePath });
      
      // Update video status
      await Video.findByIdAndUpdate(videoId, {
        processingStatus: 'transcoding',
        updatedAt: new Date()
      });

      // TODO: Implement actual job queue integration
      // Example: await jobQueue.add('transcode-video', { videoId, filePath });

      return {
        jobId: generalUtils.generateUUID(),
        videoId,
        status: 'queued',
        enqueuedAt: new Date()
      };

    } catch (error) {
      logger.error('Transcoding job enqueue failed:', {
        videoId,
        filePath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if user has admin privileges
   * @param {String} userId - user ID to check
   * @returns {Boolean} is admin
   */
  isAdmin(userId) {
    // TODO: Implement actual admin check based on your user model
    return false;
  }

  /**
   * Get video processing status
   * @param {String} videoId - video ID
   * @returns {Promise<Object>} processing status
   */
  async getProcessingStatus(videoId) {
    try {
      const video = await Video.findById(videoId).select('processingStatus updatedAt');
      
      if (!video) {
        throw new Error('Video not found');
      }

      return {
        videoId,
        status: video.processingStatus,
        lastUpdated: video.updatedAt
      };

    } catch (error) {
      logger.error('Processing status retrieval failed:', {
        videoId,
        error: error.message
      });
      throw error;
    }
  }
}

// Create singleton instance
const videoService = new VideoService();

export default videoService;
