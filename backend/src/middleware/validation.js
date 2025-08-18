import Joi from 'joi';
import {
  USER_CONSTANTS,
  CONTENT_CONSTANTS,
  SYNC_CONSTANTS,
  API_CONSTANTS,
  EDITOR_CONSTANTS,
  VALIDATION_PATTERNS,
  VIDEO_CONSTANTS,
  AUDIO_CONSTANTS
} from '../utils/constants.js';
import logger from '../utils/logger.js';

/**
 * Custom validation error class
 */
class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.details = details;
    this.isOperational = true;
  }
}

// Base schemas for common validations
const mongoIdSchema = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required();
const optionalMongoIdSchema = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);
const emailSchema = Joi.string().email().required();
const passwordSchema = Joi.string()
  .min(USER_CONSTANTS.PASSWORD_MIN_LENGTH)
  .max(USER_CONSTANTS.PASSWORD_MAX_LENGTH)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  .required();

// Common validation schemas
export const commonSchemas = {
  objectId: mongoIdSchema,
  optionalObjectId: optionalMongoIdSchema,
  email: emailSchema,
  password: passwordSchema,
  username: Joi.string()
    .alphanum()
    .min(USER_CONSTANTS.USERNAME_MIN_LENGTH)
    .max(USER_CONSTANTS.USERNAME_MAX_LENGTH)
    .trim(),
  phone: Joi.string().pattern(VALIDATION_PATTERNS.PHONE).min(10).max(20),
  url: Joi.string().uri(),
  dateString: Joi.string().isoDate(),
  fileSize: Joi.number().positive().max(VIDEO_CONSTANTS.MAX_FILE_SIZE || 100 * 1024 * 1024),
  page: Joi.number().integer().min(API_CONSTANTS.MIN_PAGE_SIZE).default(API_CONSTANTS.DEFAULT_PAGE_SIZE),
  limit: Joi.number().integer().min(API_CONSTANTS.MIN_PAGE_SIZE).max(API_CONSTANTS.MAX_PAGE_SIZE).default(API_CONSTANTS.DEFAULT_PAGE_SIZE),
  sortField: Joi.string().valid('createdAt', 'updatedAt', 'name', 'title'),
  sortOrder: Joi.string().valid('asc', 'desc', 'ascending', 'descending').default('desc'),
  searchQuery: Joi.string().min(1).max(API_CONSTANTS.MAX_SEARCH_QUERY_LENGTH).trim(),
  roomId: Joi.string().alphanum().length(SYNC_CONSTANTS.ROOM_CODE_LENGTH),
  timestamp: Joi.number().min(0).max(VIDEO_CONSTANTS.MAX_DURATION),
};

// Validation schemas
const validationSchemas = {
  // User validation schemas
  registerUser: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    email: emailSchema,
    password: passwordSchema,
    firstName: Joi.string().min(1).max(50).required(),
    lastName: Joi.string().min(1).max(50).required(),
    acceptTerms: Joi.boolean().valid(true).required()
  }),

  loginUser: Joi.object({
    email: emailSchema,
    password: Joi.string().required()
  }),

  updateProfile: Joi.object({
    firstName: Joi.string().min(1).max(50),
    lastName: Joi.string().min(1).max(50),
    bio: Joi.string().max(500),
    avatar: Joi.string().uri(),
    preferences: Joi.object({
      autoplay: Joi.boolean(),
      quality: Joi.string().valid('auto', '240p', '360p', '480p', '720p', '1080p'),
      notifications: Joi.boolean(),
      syncDefaults: Joi.object({
        autoJoin: Joi.boolean(),
        shareVideo: Joi.boolean()
      })
    })
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: passwordSchema,
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
  }),

  forgotPassword: Joi.object({
    email: emailSchema
  }),

  resetPassword: Joi.object({
    token: Joi.string().required(),
    password: passwordSchema,
    confirmPassword: Joi.string().valid(Joi.ref('password')).required()
  }),

  // Video validation schemas
  uploadVideo: Joi.object({
    title: Joi.string().min(1).max(200).required(),
    description: Joi.string().max(2000),
    tags: Joi.array().items(Joi.string().max(50)).max(20),
    category: Joi.string().max(50),
    isPrivate: Joi.boolean().default(false),
    allowDownload: Joi.boolean().default(true),
    metadata: Joi.object({
      duration: Joi.number().positive(),
      resolution: Joi.string(),
      fileSize: Joi.number().positive(),
      format: Joi.string()
    })
  }),

  updateVideo: Joi.object({
    title: Joi.string().min(1).max(200),
    description: Joi.string().max(2000),
    tags: Joi.array().items(Joi.string().max(50)).max(20),
    category: Joi.string().max(50),
    isPrivate: Joi.boolean(),
    allowDownload: Joi.boolean(),
    thumbnail: Joi.string().uri()
  }),

  // Sync validation schemas
  createSyncSession: Joi.object({
    videoId: mongoIdSchema,
    name: Joi.string().min(1).max(100),
    description: Joi.string().max(500),
    isPrivate: Joi.boolean().default(false),
    maxParticipants: Joi.number().integer().min(2).max(100).default(10),
    settings: Joi.object({
      allowControl: Joi.string().valid('host', 'all', 'moderators').default('host'),
      allowChat: Joi.boolean().default(true),
      autoSync: Joi.boolean().default(true),
      syncDelay: Joi.number().min(0).max(5000).default(100)
    })
  }),

  joinSyncSession: Joi.object({
    sessionCode: Joi.string().length(6).required(),
    nickname: Joi.string().min(1).max(50)
  }),

  updateSyncState: Joi.object({
    currentTime: Joi.number().min(0).required(),
    isPlaying: Joi.boolean().required(),
    playbackRate: Joi.number().positive().max(3).default(1),
    timestamp: Joi.date().iso().default(() => new Date())
  }),

  // AI validation schemas
  transcribeVideo: Joi.object({
    videoId: mongoIdSchema,
    language: Joi.string().length(2).default('en'),
    format: Joi.string().valid('srt', 'vtt', 'txt').default('srt'),
    includeTimestamps: Joi.boolean().default(true)
  }),

  summarizeVideo: Joi.object({
    videoId: mongoIdSchema,
    type: Joi.string().valid('brief', 'detailed', 'bullets', 'chapters').default('brief'),
    maxLength: Joi.number().integer().min(50).max(1000).default(200),
    includeTimestamps: Joi.boolean().default(false)
  }),

  analyzeScenes: Joi.object({
    videoId: mongoIdSchema,
    sensitivity: Joi.string().valid('low', 'medium', 'high').default('medium'),
    includeEmotions: Joi.boolean().default(false),
    includeObjects: Joi.boolean().default(false)
  }),

  // Branching validation schemas
  createBranchingVideo: Joi.object({
    title: Joi.string().min(1).max(200).required(),
    description: Joi.string().max(2000),
    mainVideoId: mongoIdSchema,
    isPublic: Joi.boolean().default(false),
    settings: Joi.object({
      autoAdvance: Joi.boolean().default(false),
      showProgress: Joi.boolean().default(true),
      allowSkip: Joi.boolean().default(true),
      decisionTimeout: Joi.number().integer().min(5).max(300).default(30)
    })
  }),

  addDecisionPoint: Joi.object({
    timestamp: Joi.number().min(0).required(),
    question: Joi.string().min(1).max(500).required(),
    choices: Joi.array().items(
      Joi.object({
        text: Joi.string().min(1).max(200).required(),
        videoId: optionalMongoIdSchema,
        action: Joi.string().valid('jump', 'branch', 'end').default('jump'),
        targetTimestamp: Joi.number().min(0)
      })
    ).min(2).max(5).required(),
    type: Joi.string().valid('multiple-choice', 'binary', 'custom').default('multiple-choice'),
    layout: Joi.string().valid('horizontal', 'vertical', 'grid').default('horizontal')
  }),

  recordChoice: Joi.object({
    choiceIndex: Joi.number().integer().min(0).required(),
    timestamp: Joi.date().iso().default(() => new Date()),
    userAgent: Joi.string(),
    metadata: Joi.object()
  }),

  // Editor validation schemas
  createProject: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500),
    videoId: mongoIdSchema,
    settings: Joi.object({
      resolution: Joi.string().valid('720p', '1080p', '4k').default('1080p'),
      frameRate: Joi.number().valid(24, 30, 60).default(30),
      audioQuality: Joi.string().valid('standard', 'high', 'lossless').default('high')
    })
  }),

  updateProject: Joi.object({
    name: Joi.string().min(1).max(100),
    description: Joi.string().max(500),
    settings: Joi.object({
      resolution: Joi.string().valid('720p', '1080p', '4k'),
      frameRate: Joi.number().valid(24, 30, 60),
      audioQuality: Joi.string().valid('standard', 'high', 'lossless')
    })
  }),

  addSceneMarker: Joi.object({
    timestamp: Joi.number().min(0).required(),
    type: Joi.string().valid('cut', 'fade', 'transition', 'annotation', 'chapter').required(),
    title: Joi.string().min(1).max(100),
    description: Joi.string().max(500),
    duration: Joi.number().min(0),
    properties: Joi.object({
      color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/),
      style: Joi.string(),
      intensity: Joi.number().min(0).max(1)
    }),
    projectId: optionalMongoIdSchema,
    videoId: optionalMongoIdSchema
  }),

  updateSceneMarker: Joi.object({
    timestamp: Joi.number().min(0),
    type: Joi.string().valid('cut', 'fade', 'transition', 'annotation', 'chapter'),
    title: Joi.string().min(1).max(100),
    description: Joi.string().max(500),
    duration: Joi.number().min(0),
    properties: Joi.object({
      color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/),
      style: Joi.string(),
      intensity: Joi.number().min(0).max(1)
    })
  }),

  generateCutSuggestions: Joi.object({
    analysisType: Joi.string().valid('scene', 'motion', 'audio', 'comprehensive').default('comprehensive'),
    sensitivity: Joi.string().valid('low', 'medium', 'high').default('medium'),
    maxSuggestions: Joi.number().integer().min(1).max(50).default(10)
  }),

  exportProject: Joi.object({
    format: Joi.string().valid('mp4', 'avi', 'mov', 'webm').default('mp4'),
    quality: Joi.string().valid('low', 'medium', 'high', 'ultra').default('medium'),
    resolution: Joi.string().valid('480p', '720p', '1080p', '4k'),
    includeAudio: Joi.boolean().default(true),
    watermark: Joi.object({
      enabled: Joi.boolean().default(false),
      text: Joi.string().max(50),
      position: Joi.string().valid('top-left', 'top-right', 'bottom-left', 'bottom-right').default('bottom-right')
    })
  }),

  shareProject: Joi.object({
    userIds: Joi.array().items(mongoIdSchema).min(1).required(),
    permissions: Joi.string().valid('view', 'edit', 'admin').default('view'),
    message: Joi.string().max(500)
  }),

  // Analytics validation schemas
  generateReport: Joi.object({
    type: Joi.string().valid('engagement', 'performance', 'user', 'video', 'sync', 'comprehensive').required(),
    dateRange: Joi.object({
      start: Joi.date().iso().required(),
      end: Joi.date().iso().min(Joi.ref('start')).required()
    }).required(),
    scope: Joi.string().valid('user', 'video', 'global').default('user'),
    format: Joi.string().valid('json', 'csv', 'pdf').default('json'),
    includeCharts: Joi.boolean().default(false),
    filters: Joi.object({
      videoIds: Joi.array().items(mongoIdSchema),
      userIds: Joi.array().items(mongoIdSchema),
      categories: Joi.array().items(Joi.string()),
      minViews: Joi.number().integer().min(0),
      minDuration: Joi.number().min(0)
    })
  }),

  scheduleReport: Joi.object({
    reportConfig: Joi.object().required(), // Uses generateReport schema
    schedule: Joi.object({
      frequency: Joi.string().valid('daily', 'weekly', 'monthly').required(),
      time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(), // HH:MM format
      timezone: Joi.string().default('UTC'),
      startDate: Joi.date().iso().min(new Date()).required()
    }).required(),
    delivery: Joi.object({
      email: Joi.boolean().default(true),
      webhook: Joi.string().uri(),
      storage: Joi.boolean().default(true)
    }).default({ email: true, storage: true })
  }),

  exportAnalytics: Joi.object({
    format: Joi.string().valid('json', 'csv', 'xlsx').default('json'),
    dateRange: Joi.object({
      start: Joi.date().iso().required(),
      end: Joi.date().iso().min(Joi.ref('start')).required()
    }).required(),
    metrics: Joi.array().items(
      Joi.string().valid('views', 'engagement', 'duration', 'sync', 'branching', 'ai')
    ).min(1).required(),
    includeRawData: Joi.boolean().default(false)
  }),

  // Query parameter validations
  paginationQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().default('createdAt'),
    order: Joi.string().valid('asc', 'desc').default('desc')
  }),

  dateRangeQuery: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')),
    timeZone: Joi.string().default('UTC')
  }),

  searchQuery: Joi.object({
    q: Joi.string().min(1).max(100),
    category: Joi.string(),
    tags: Joi.array().items(Joi.string()),
    sortBy: Joi.string().valid('relevance', 'date', 'views', 'title').default('relevance')
  })
};

/**
 * Validation middleware factory
 */
export const validateRequest = (schemaName, property = 'body') => {
  return async (req, res, next) => {
    try {
      const schema = validationSchemas[schemaName];
      
      if (!schema) {
        logger.error(`Validation schema '${schemaName}' not found`);
        throw new ValidationError('Validation configuration error');
      }

      const options = {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true,
        context: {
          isGuest: !req.user,
          userId: req.user?.id,
          userRole: req.user?.role
        }
      };

      const { error, value } = schema.validate(req[property], options);

      if (error) {
        const details = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
          type: detail.type
        }));

        logger.warn('Validation failed:', {
          schema: schemaName,
          property,
          errors: details,
          userId: req.user?.id,
          path: req.path,
          method: req.method
        });

        throw new ValidationError('Validation failed', details);
      }

      // Replace the original data with validated and sanitized data
      req[property] = value;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Legacy validation functions (maintained for compatibility)
 */
export const validateQueryLegacy = (schemaName) => {
  return validateRequest(schemaName, 'query');
};

/**
 * Legacy validate route parameters
 */
export const validateParamsLegacy = (schemaName) => {
  return validateRequest(schemaName, 'params');
};

/**
 * Enhanced validation middleware
 */
export const validate = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      let dataToValidate;
      
      // Determine data source
      switch (source) {
        case 'body':
          dataToValidate = req.body;
          break;
        case 'params':
          dataToValidate = req.params;
          break;
        case 'query':
          dataToValidate = req.query;
          break;
        case 'headers':
          dataToValidate = req.headers;
          break;
        case 'file':
          dataToValidate = req.file;
          break;
        case 'files':
          dataToValidate = req.files;
          break;
        default:
          dataToValidate = req.body;
      }

      // Validation options
      const options = {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true,
        context: {
          isGuest: !req.user,
          userId: req.user?.id,
          userRole: req.user?.role
        }
      };

      // Validate data
      const { error, value } = schema.validate(dataToValidate, options);

      if (error) {
        const details = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
          type: detail.type
        }));

        logger.warn('Validation failed:', {
          source,
          errors: details,
          userId: req.user?.id,
          path: req.path,
          method: req.method
        });

        throw new ValidationError('Validation failed', details);
      }

      // Replace data with validated and sanitized value
      switch (source) {
        case 'body':
          req.body = value;
          break;
        case 'params':
          req.params = value;
          break;
        case 'query':
          req.query = value;
          break;
        case 'headers':
          req.headers = value;
          break;
        case 'file':
          req.file = value;
          break;
        case 'files':
          req.files = value;
          break;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Convenient validation middleware creators
 */
export const validateBody = (schema) => validate(schema, 'body');
export const validateParams = (schema) => validate(schema, 'params');
export const validateQuery = (schema) => validate(schema, 'query');
export const validateFile = (schema) => validate(schema, 'file');

/**
 * Custom validation for MongoDB ObjectId
 */
export const validateMongoId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: `Invalid ${paramName} format`
      });
    }

    next();
  };
};

/**
 * Sanitize input data
 */
export const sanitizeInput = (req, res, next) => {
  // Remove any potential XSS
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  };

  const sanitizeObject = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };

  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  
  next();
};

export default {
  validateRequest,
  validateQueryLegacy,
  validateParamsLegacy,
  validate,
  validateBody,
  validateParams,
  validateQuery,
  validateFile,
  validateMongoId,
  sanitizeInput,
  ValidationError,
  commonSchemas,
  schemas: validationSchemas
};

/**
 * Additional validation utilities
 */

/**
 * File validation with custom rules
 */
export const validateFileUpload = (rules = {}) => {
  return (req, res, next) => {
    try {
      if (!req.file && !req.files) {
        throw new ValidationError('No file uploaded');
      }

      const files = req.files || [req.file];
      const {
        allowedTypes = [],
        maxSize = 10 * 1024 * 1024, // 10MB
        minSize = 0,
        maxFiles = 1,
        requiredFields = []
      } = rules;

      // Check file count
      if (files.length > maxFiles) {
        throw new ValidationError(`Too many files. Maximum ${maxFiles} allowed`);
      }

      // Validate each file
      for (const file of files) {
        // Check file type
        if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
          throw new ValidationError(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`);
        }

        // Check file size
        if (file.size > maxSize) {
          throw new ValidationError(`File too large. Maximum ${Math.round(maxSize / 1024 / 1024)}MB allowed`);
        }

        if (file.size < minSize) {
          throw new ValidationError(`File too small. Minimum ${Math.round(minSize / 1024)}KB required`);
        }
      }

      // Check required fields
      for (const field of requiredFields) {
        if (!req.body[field]) {
          throw new ValidationError(`Required field missing: ${field}`);
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Conditional validation middleware
 */
export const validateConditional = (conditions) => {
  return async (req, res, next) => {
    try {
      for (const condition of conditions) {
        const { when, schema, source = 'body' } = condition;
        
        // Check if condition is met
        const shouldValidate = typeof when === 'function' ? when(req) : when;
        
        if (shouldValidate) {
          // Apply validation
          await new Promise((resolve, reject) => {
            validate(schema, source)(req, res, (error) => {
              if (error) reject(error);
              else resolve();
            });
          });
          break; // Only apply first matching condition
        }
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Array validation middleware
 */
export const validateArray = (itemSchema, options = {}) => {
  const { minItems = 1, maxItems = 100, source = 'body' } = options;
  
  const arraySchema = Joi.array()
    .items(itemSchema)
    .min(minItems)
    .max(maxItems)
    .required();
  
  return validate(arraySchema, source);
};

/**
 * Pre-built validators for common use cases
 */
export const validators = {
  // User validators
  userRegister: validateBody(validationSchemas.registerUser),
  userLogin: validateBody(validationSchemas.loginUser),
  userUpdate: validateBody(validationSchemas.updateProfile),
  userChangePassword: validateBody(validationSchemas.changePassword),
  
  // Video validators
  videoUpload: validateBody(validationSchemas.uploadVideo),
  videoUpdate: validateBody(validationSchemas.updateVideo),
  
  // Sync validators
  syncCreate: validateBody(validationSchemas.createSyncSession),
  syncJoin: validateBody(validationSchemas.joinSyncSession),
  syncUpdate: validateBody(validationSchemas.updateSyncState),
  
  // Query validators
  pagination: validateQuery(validationSchemas.paginationQuery),
  search: validateQuery(validationSchemas.searchQuery),
  
  // Common validators
  objectId: validateParams(Joi.object({ id: mongoIdSchema })),
  objectIds: validateBody(Joi.object({ ids: Joi.array().items(mongoIdSchema).min(1).required() }))
};
