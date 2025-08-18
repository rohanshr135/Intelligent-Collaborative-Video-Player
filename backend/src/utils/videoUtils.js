import ffprobe from 'ffprobe';
import ffprobeStatic from 'ffprobe-static';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import logger from './logger.js';

const access = promisify(fs.access);

/**
 * Video utility functions for metadata extraction, format validation, and timecode conversions
 */
export class VideoUtils {
  constructor() {
    // Set ffprobe path for metadata extraction
    ffmpeg.setFfprobePath(ffprobeStatic.path);
  }

  /**
   * Extract comprehensive video metadata using ffprobe
   * @param {string} videoPath - local file path or remote URL
   * @returns {Promise<Object>} detailed metadata object
   */
  async getVideoMetadata(videoPath) {
    try {
      logger.info('Extracting video metadata:', { videoPath });

      // Check if file exists for local paths
      if (!videoPath.startsWith('http') && !videoPath.startsWith('https')) {
        try {
          await access(videoPath, fs.constants.F_OK);
        } catch (error) {
          throw new Error(`Video file not found: ${videoPath}`);
        }
      }

      const info = await ffprobe(videoPath, { path: ffprobeStatic.path });
      
      // Extract video stream information
      const videoStream = info.streams.find(stream => stream.codec_type === 'video');
      const audioStream = info.streams.find(stream => stream.codec_type === 'audio');
      
      if (!videoStream) {
        throw new Error('No video stream found in file');
      }

      const metadata = {
        // Basic file information
        filename: path.basename(videoPath),
        format: info.format.format_name,
        formatLongName: info.format.format_long_name,
        duration: parseFloat(info.format.duration),
        size: parseInt(info.format.size),
        bitRate: parseInt(info.format.bit_rate),
        
        // Video stream information
        video: {
          codec: videoStream.codec_name,
          codecLongName: videoStream.codec_long_name,
          profile: videoStream.profile,
          width: parseInt(videoStream.width),
          height: parseInt(videoStream.height),
          aspectRatio: videoStream.display_aspect_ratio || `${videoStream.width}:${videoStream.height}`,
          frameRate: this.parseFrameRate(videoStream.r_frame_rate),
          avgFrameRate: this.parseFrameRate(videoStream.avg_frame_rate),
          pixelFormat: videoStream.pix_fmt,
          colorRange: videoStream.color_range,
          colorSpace: videoStream.color_space,
          bitRate: parseInt(videoStream.bit_rate) || null,
          level: videoStream.level,
          refFrames: videoStream.refs
        },
        
        // Audio stream information
        audio: audioStream ? {
          codec: audioStream.codec_name,
          codecLongName: audioStream.codec_long_name,
          sampleRate: parseInt(audioStream.sample_rate),
          channels: parseInt(audioStream.channels),
          channelLayout: audioStream.channel_layout,
          bitRate: parseInt(audioStream.bit_rate) || null,
          sampleFormat: audioStream.sample_fmt
        } : null,
        
        // Additional metadata
        metadata: info.format.tags || {},
        
        // Calculated properties
        resolution: `${videoStream.width}x${videoStream.height}`,
        isHD: parseInt(videoStream.height) >= 720,
        is4K: parseInt(videoStream.height) >= 2160,
        hasAudio: !!audioStream,
        
        // Chapters if available
        chapters: info.chapters || [],
        
        // Raw ffprobe data for advanced use
        raw: info
      };

      logger.info('Video metadata extracted successfully:', {
        filename: metadata.filename,
        duration: metadata.duration,
        resolution: metadata.resolution,
        format: metadata.format
      });

      return metadata;
    } catch (error) {
      logger.error('Failed to extract video metadata:', {
        videoPath,
        error: error.message
      });
      throw new Error(`Failed to extract video metadata: ${error.message}`);
    }
  }

  /**
   * Parse frame rate string to number
   * @param {string} frameRateString - e.g., "30/1" or "29.97"
   * @returns {number} frame rate as decimal
   */
  parseFrameRate(frameRateString) {
    if (!frameRateString) return null;
    
    if (frameRateString.includes('/')) {
      const [numerator, denominator] = frameRateString.split('/').map(Number);
      return denominator !== 0 ? numerator / denominator : null;
    }
    
    return parseFloat(frameRateString);
  }

  /**
   * Validates whether a MIME type is a supported video format
   * @param {string} mimeType - MIME type to validate
   * @returns {boolean} true if supported
   */
  isSupportedVideoMime(mimeType) {
    const supportedMimes = [
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime',
      'video/x-msvideo', // AVI
      'video/x-matroska', // MKV
      'video/x-ms-wmv', // WMV
      'video/x-flv', // FLV
      'video/3gpp', // 3GP
      'video/x-m4v' // M4V
    ];
    
    return supportedMimes.includes(mimeType.toLowerCase());
  }

  /**
   * Get video quality classification based on resolution
   * @param {number} width - video width
   * @param {number} height - video height
   * @returns {string} quality classification
   */
  getVideoQuality(width, height) {
    if (height >= 2160) return '4K';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    if (height >= 240) return '240p';
    return 'Low';
  }

  /**
   * Convert seconds to HH:MM:SS.xxx string format
   * @param {number} seconds - time in seconds
   * @param {boolean} includeMilliseconds - whether to include milliseconds
   * @returns {string} formatted timecode
   */
  secondsToTimecode(seconds, includeMilliseconds = true) {
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
      return '00:00:00';
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const h = hours.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    
    if (includeMilliseconds) {
      const s = secs.toFixed(3).padStart(6, '0');
      return `${h}:${m}:${s}`;
    } else {
      const s = Math.floor(secs).toString().padStart(2, '0');
      return `${h}:${m}:${s}`;
    }
  }

  /**
   * Convert HH:MM:SS or HH:MM:SS.xxx string to seconds
   * @param {string} timecode - formatted time string
   * @returns {number} time in seconds
   */
  timecodeToSeconds(timecode) {
    if (typeof timecode !== 'string') {
      throw new Error('Timecode must be a string');
    }

    const parts = timecode.split(':');
    if (parts.length < 2 || parts.length > 3) {
      throw new Error('Invalid timecode format. Expected HH:MM:SS or MM:SS');
    }

    let hours = 0, minutes = 0, seconds = 0;
    
    if (parts.length === 3) {
      // HH:MM:SS format
      hours = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10);
      seconds = parseFloat(parts[2]);
    } else {
      // MM:SS format
      minutes = parseInt(parts[0], 10);
      seconds = parseFloat(parts[1]);
    }

    // Validate ranges
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
      throw new Error('Invalid timecode format. All parts must be numbers');
    }
    
    if (minutes >= 60 || seconds >= 60) {
      throw new Error('Invalid timecode format. Minutes and seconds must be less than 60');
    }

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Generate video thumbnail at specified timestamp
   * @param {string} videoPath - path to video file
   * @param {string} outputPath - path for thumbnail output
   * @param {number} timestamp - timestamp in seconds
   * @param {Object} options - thumbnail options
   * @returns {Promise<string>} path to generated thumbnail
   */
  async generateThumbnail(videoPath, outputPath, timestamp = 0, options = {}) {
    return new Promise((resolve, reject) => {
      const {
        width = 320,
        height = 180,
        quality = 2
      } = options;

      ffmpeg(videoPath)
        .seekInput(timestamp)
        .outputOptions([
          '-vframes 1',
          '-f image2',
          `-q:v ${quality}`,
          `-s ${width}x${height}`
        ])
        .output(outputPath)
        .on('end', () => {
          logger.info('Thumbnail generated successfully:', {
            videoPath,
            outputPath,
            timestamp
          });
          resolve(outputPath);
        })
        .on('error', (error) => {
          logger.error('Thumbnail generation failed:', {
            videoPath,
            outputPath,
            timestamp,
            error: error.message
          });
          reject(new Error(`Thumbnail generation failed: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Extract video frames at specified intervals
   * @param {string} videoPath - path to video file
   * @param {string} outputDir - directory for frame output
   * @param {Object} options - extraction options
   * @returns {Promise<Array>} array of frame file paths
   */
  async extractFrames(videoPath, outputDir, options = {}) {
    return new Promise((resolve, reject) => {
      const {
        interval = 10, // seconds between frames
        maxFrames = 10,
        format = 'png',
        quality = 2
      } = options;

      const framePattern = path.join(outputDir, `frame_%04d.${format}`);
      
      ffmpeg(videoPath)
        .outputOptions([
          `-vf fps=1/${interval}`,
          `-vframes ${maxFrames}`,
          `-q:v ${quality}`
        ])
        .output(framePattern)
        .on('end', () => {
          // Generate list of created frame files
          const frames = [];
          for (let i = 1; i <= maxFrames; i++) {
            const framePath = path.join(outputDir, `frame_${i.toString().padStart(4, '0')}.${format}`);
            frames.push(framePath);
          }
          
          logger.info('Frames extracted successfully:', {
            videoPath,
            outputDir,
            frameCount: frames.length
          });
          
          resolve(frames);
        })
        .on('error', (error) => {
          logger.error('Frame extraction failed:', {
            videoPath,
            outputDir,
            error: error.message
          });
          reject(new Error(`Frame extraction failed: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Validate video file integrity
   * @param {string} videoPath - path to video file
   * @returns {Promise<Object>} validation result
   */
  async validateVideoFile(videoPath) {
    try {
      const metadata = await this.getVideoMetadata(videoPath);
      
      const validation = {
        isValid: true,
        errors: [],
        warnings: [],
        metadata
      };

      // Check for common issues
      if (!metadata.video) {
        validation.isValid = false;
        validation.errors.push('No video stream found');
      }

      if (metadata.duration <= 0) {
        validation.isValid = false;
        validation.errors.push('Invalid duration');
      }

      if (metadata.video && (metadata.video.width <= 0 || metadata.video.height <= 0)) {
        validation.isValid = false;
        validation.errors.push('Invalid video dimensions');
      }

      // Add warnings for potential issues
      if (!metadata.hasAudio) {
        validation.warnings.push('No audio stream found');
      }

      if (metadata.video && metadata.video.frameRate < 15) {
        validation.warnings.push('Low frame rate detected');
      }

      return validation;
    } catch (error) {
      return {
        isValid: false,
        errors: [error.message],
        warnings: [],
        metadata: null
      };
    }
  }

  /**
   * Format file size to human readable string
   * @param {number} bytes - file size in bytes
   * @param {number} decimals - number of decimal places
   * @returns {string} formatted size string
   */
  formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Get video container format from file extension
   * @param {string} filename - file name or path
   * @returns {string} container format
   */
  getContainerFormat(filename) {
    const ext = path.extname(filename).toLowerCase();
    const formatMap = {
      '.mp4': 'mp4',
      '.webm': 'webm',
      '.avi': 'avi',
      '.mkv': 'matroska',
      '.mov': 'quicktime',
      '.wmv': 'wmv',
      '.flv': 'flv',
      '.3gp': '3gp',
      '.m4v': 'mp4',
      '.ogv': 'ogg'
    };
    
    return formatMap[ext] || 'unknown';
  }
}

// Create singleton instance
const videoUtils = new VideoUtils();

export default videoUtils;

// Export individual functions for convenience
export const {
  getVideoMetadata,
  isSupportedVideoMime,
  getVideoQuality,
  secondsToTimecode,
  timecodeToSeconds,
  generateThumbnail,
  extractFrames,
  validateVideoFile,
  formatFileSize,
  getContainerFormat
} = videoUtils;
