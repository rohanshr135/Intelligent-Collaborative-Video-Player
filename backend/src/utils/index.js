/**
 * Utility modules index
 * Provides centralized access to all utility functions
 */

// Import all utility modules
import videoUtils from './videoUtils.js';
import syncUtils from './syncUtils.js';
import aiUtils from './aiUtils.js';
import encryptionUtils from './encryptionUtils.js';
import generalUtils from './generalUtils.js';
import logger from './logger.js';
import redisManager from './redis.js';
import * as constants from './constants.js';

// Export individual modules
export {
  videoUtils,
  syncUtils,
  aiUtils,
  encryptionUtils,
  generalUtils,
  logger,
  redisManager,
  constants
};

// Export commonly used functions for convenience
export const {
  // Video utilities
  getVideoMetadata,
  isSupportedVideoMime,
  secondsToTimecode,
  timecodeToSeconds,
  generateThumbnail,
  validateVideoFile
} = videoUtils;

export const {
  // Sync utilities
  calculateLagMs,
  playbackRateFromLag,
  shouldSkipLag,
  calculateNetworkDelay,
  generateSyncStrategy
} = syncUtils;

export const {
  // AI utilities
  summarizeTranscript,
  analyzeTranscriptTopics,
  generateChapters,
  transcribeAudio,
  generateVideoDescription
} = aiUtils;

export const {
  // Encryption utilities
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  generateSecureToken,
  generateAPIKey
} = encryptionUtils;

export const {
  // General utilities
  generateUUID,
  generateRoomId,
  delay,
  formatBytes,
  formatDuration,
  isValidEmail,
  isValidUrl,
  sanitizeFilename,
  retry
} = generalUtils;

// Create a utilities object for easy access
const utils = {
  video: videoUtils,
  sync: syncUtils,
  ai: aiUtils,
  encryption: encryptionUtils,
  general: generalUtils,
  logger,
  redis: redisManager,
  constants
};

export default utils;
