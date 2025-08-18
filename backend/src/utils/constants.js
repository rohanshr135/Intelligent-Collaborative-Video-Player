/**
 * Application constants
 * Centralized place for all constants used across the application
 */

// Video processing constants
export const VIDEO_CONSTANTS = {
  SUPPORTED_FORMATS: ['mp4', 'webm', 'ogg', 'avi', 'mov'],
  SUPPORTED_MIME_TYPES: ['video/mp4', 'video/webm', 'video/ogg'],
  MAX_DURATION: 7200, // 2 hours in seconds
  DEFAULT_QUALITY: '1080p',
  SUPPORTED_RESOLUTIONS: ['240p', '360p', '480p', '720p', '1080p', '4k'],
  SUPPORTED_FRAME_RATES: [24, 30, 60],
  THUMBNAIL_COUNT: 5
};

// Audio processing constants
export const AUDIO_CONSTANTS = {
  SUPPORTED_FORMATS: ['mp3', 'wav', 'aac', 'flac'],
  SUPPORTED_MIME_TYPES: ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/flac'],
  QUALITY_LEVELS: ['standard', 'high', 'lossless'],
  DEFAULT_QUALITY: 'high'
};

// User related constants
export const USER_CONSTANTS = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  BIO_MAX_LENGTH: 500,
  DISPLAY_NAME_MAX_LENGTH: 50,
  MAX_TAGS_PER_VIDEO: 20,
  TAG_MAX_LENGTH: 50
};

// Content validation constants
export const CONTENT_CONSTANTS = {
  TITLE_MIN_LENGTH: 1,
  TITLE_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 2000,
  COMMENT_MAX_LENGTH: 1000,
  CATEGORY_MAX_LENGTH: 50
};

// Synchronization constants
export const SYNC_CONSTANTS = {
  MAX_PARTICIPANTS: 100,
  MIN_PARTICIPANTS: 2,
  DEFAULT_SYNC_TOLERANCE: 250, // milliseconds
  MAX_SYNC_DELAY: 5000, // milliseconds
  SESSION_NAME_MAX_LENGTH: 100,
  SESSION_DESCRIPTION_MAX_LENGTH: 500,
  ROOM_CODE_LENGTH: 8
};

// API limits and pagination
export const API_CONSTANTS = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1,
  MAX_SEARCH_QUERY_LENGTH: 255,
  MAX_BULK_OPERATIONS: 100
};

// Time and date constants
export const TIME_CONSTANTS = {
  SECONDS_IN_MINUTE: 60,
  SECONDS_IN_HOUR: 3600,
  SECONDS_IN_DAY: 86400,
  MS_IN_SECOND: 1000,
  MAX_VIDEO_DURATION: 7200 // 2 hours
};

// File upload constants
export const UPLOAD_CONSTANTS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  CHUNK_SIZE: 1024 * 1024, // 1MB chunks
  ALLOWED_EXTENSIONS: ['.mp4', '.webm', '.ogg', '.avi', '.mov'],
  TEMP_UPLOAD_DIR: '/tmp/uploads',
  PROCESSED_VIDEO_DIR: '/processed'
};

// Editor and markers constants
export const EDITOR_CONSTANTS = {
  MAX_MARKERS_PER_VIDEO: 1000,
  MARKER_TITLE_MAX_LENGTH: 100,
  MARKER_DESCRIPTION_MAX_LENGTH: 500,
  PROJECT_NAME_MAX_LENGTH: 100,
  PROJECT_DESCRIPTION_MAX_LENGTH: 500,
  OVERLAY_TEXT_MAX_LENGTH: 200
};

// AI processing constants
export const AI_CONSTANTS = {
  MAX_TRANSCRIPT_LENGTH: 50000,
  MAX_SUMMARY_LENGTH: 1000,
  CHAPTER_TITLE_MAX_LENGTH: 100,
  MIN_CHAPTER_DURATION: 30, // seconds
  MAX_CHAPTERS_PER_VIDEO: 50
};

// Branching video constants
export const BRANCHING_CONSTANTS = {
  MAX_BRANCHES_PER_DECISION: 10,
  MAX_DECISIONS_PER_VIDEO: 100,
  DECISION_TITLE_MAX_LENGTH: 100,
  BRANCH_TITLE_MAX_LENGTH: 100,
  BRANCH_DESCRIPTION_MAX_LENGTH: 300
};

// Analytics constants
export const ANALYTICS_CONSTANTS = {
  MAX_REPORT_DATE_RANGE: 365, // days
  RETENTION_PERIOD: 730, // days
  MAX_CHART_DATA_POINTS: 1000
};

// Regular expressions for validation
export const VALIDATION_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  USERNAME: /^[a-zA-Z0-9_]{3,30}$/,
  SLUG: /^[a-z0-9-]+$/,
  HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  TIME_FORMAT: /^([01]\d|2[0-3]):([0-5]\d)$/,
  URL_SAFE: /^[a-zA-Z0-9\-_.~]+$/,
  PHONE: /^\+?[\d\s\-\(\)]+$/
};

// HTTP status codes commonly used
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503
};

// Error codes for application-specific errors
export const ERROR_CODES = {
  // Authentication errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_NOT_VERIFIED: 'ACCOUNT_NOT_VERIFIED',
  
  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  
  // Resource errors
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Processing errors
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  TRANSCODING_FAILED: 'TRANSCODING_FAILED',
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // External service errors
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR'
};

// Default values for various operations
export const DEFAULTS = {
  PAGINATION: {
    page: 1,
    limit: 10,
    sort: 'createdAt',
    order: 'desc'
  },
  VIDEO: {
    quality: '1080p',
    frameRate: 30,
    audioQuality: 'high',
    privacy: 'private'
  },
  SYNC: {
    maxParticipants: 10,
    syncTolerance: 250,
    allowControl: 'host',
    allowChat: true,
    autoSync: true
  }
};
