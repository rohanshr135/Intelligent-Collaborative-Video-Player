import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import logger from '../utils/logger.js';

// Ensure upload directories exist
const uploadDirs = {
  videos: 'uploads/videos',
  audio: 'uploads/audio',
  images: 'uploads/images',
  projects: 'uploads/projects',
  temp: 'uploads/temp'
};

Object.values(uploadDirs).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Storage configuration for different file types
 */
const createStorage = (uploadPath) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = nanoid() + '-' + Date.now();
      const extension = path.extname(file.originalname);
      const filename = `${file.fieldname}-${uniqueSuffix}${extension}`;
      cb(null, filename);
    }
  });
};

/**
 * Memory storage for temporary files or processing
 */
const memoryStorage = multer.memoryStorage();

/**
 * File filter functions
 */
const fileFilters = {
  video: (req, file, cb) => {
    const allowedTypes = [
      'video/mp4',
      'video/avi',
      'video/mov',
      'video/wmv',
      'video/webm',
      'video/mkv',
      'video/flv'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported video format: ${file.mimetype}. Allowed formats: ${allowedTypes.join(', ')}`), false);
    }
  },

  audio: (req, file, cb) => {
    const allowedTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/ogg',
      'audio/aac',
      'audio/flac'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}. Allowed formats: ${allowedTypes.join(', ')}`), false);
    }
  },

  image: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported image format: ${file.mimetype}. Allowed formats: ${allowedTypes.join(', ')}`), false);
    }
  },

  media: (req, file, cb) => {
    const allowedTypes = [
      // Video formats
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm', 'video/mkv',
      // Audio formats
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac',
      // Image formats
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported media format: ${file.mimetype}`), false);
    }
  },

  project: (req, file, cb) => {
    const allowedTypes = [
      'application/json',
      'text/plain',
      'application/xml',
      'text/xml'
    ];
    
    const allowedExtensions = ['.json', '.edl', '.xml', '.txt', '.proj'];
    const extension = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(extension)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported project file format. Allowed: JSON, EDL, XML, TXT`), false);
    }
  }
};

/**
 * Size limits (in bytes)
 */
const sizeLimits = {
  video: 2 * 1024 * 1024 * 1024,      // 2GB
  audio: 100 * 1024 * 1024,           // 100MB
  image: 10 * 1024 * 1024,            // 10MB
  project: 10 * 1024 * 1024,          // 10MB
  avatar: 5 * 1024 * 1024,            // 5MB
  thumbnail: 2 * 1024 * 1024           // 2MB
};

/**
 * Create multer upload middleware
 */
const createUploadMiddleware = (options = {}) => {
  const {
    type = 'media',
    storage = 'disk',
    maxFileSize = sizeLimits[type] || sizeLimits.video,
    maxFiles = 1,
    fieldName = 'file'
  } = options;

  const storageEngine = storage === 'memory' 
    ? memoryStorage 
    : createStorage(uploadDirs[type] || uploadDirs.temp);

  const upload = multer({
    storage: storageEngine,
    limits: {
      fileSize: maxFileSize,
      files: maxFiles,
      fields: 10,
      fieldSize: 1024 * 1024 // 1MB for text fields
    },
    fileFilter: fileFilters[type] || fileFilters.media
  });

  return upload;
};

/**
 * Pre-configured upload middlewares
 */
export const videoUpload = createUploadMiddleware({
  type: 'video',
  storage: 'disk',
  maxFileSize: sizeLimits.video,
  fieldName: 'video'
});

export const audioUpload = createUploadMiddleware({
  type: 'audio',
  storage: 'disk',
  maxFileSize: sizeLimits.audio,
  fieldName: 'audio'
});

export const imageUpload = createUploadMiddleware({
  type: 'image',
  storage: 'disk',
  maxFileSize: sizeLimits.image,
  fieldName: 'image'
});

export const avatarUpload = createUploadMiddleware({
  type: 'image',
  storage: 'disk',
  maxFileSize: sizeLimits.avatar,
  fieldName: 'avatar'
});

export const thumbnailUpload = createUploadMiddleware({
  type: 'image',
  storage: 'memory',
  maxFileSize: sizeLimits.thumbnail,
  fieldName: 'thumbnail'
});

export const projectUpload = createUploadMiddleware({
  type: 'project',
  storage: 'disk',
  maxFileSize: sizeLimits.project,
  fieldName: 'projectFile'
});

/**
 * Multiple file upload middleware
 */
export const multipleVideoUpload = createUploadMiddleware({
  type: 'video',
  storage: 'disk',
  maxFileSize: sizeLimits.video,
  maxFiles: 5,
  fieldName: 'videos'
});

export const multipleImageUpload = createUploadMiddleware({
  type: 'image',
  storage: 'disk',
  maxFileSize: sizeLimits.image,
  maxFiles: 10,
  fieldName: 'images'
});

/**
 * Advanced upload middleware with preprocessing
 */
export const advancedVideoUpload = (req, res, next) => {
  const upload = videoUpload.single('video');
  
  upload(req, res, (err) => {
    if (err) {
      logger.error('File upload error:', err);
      
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            data: null,
            error: `File too large. Maximum size is ${Math.round(sizeLimits.video / (1024 * 1024))}MB`
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            data: null,
            error: 'Too many files uploaded'
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            data: null,
            error: 'Unexpected field name in upload'
          });
        }
      }
      
      return res.status(400).json({
        success: false,
        data: null,
        error: err.message || 'File upload failed'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'No file uploaded'
      });
    }

    // Add file metadata
    req.fileMetadata = {
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadPath: req.file.path,
      filename: req.file.filename,
      uploadedAt: new Date(),
      uploadedBy: req.user?.id
    };

    logger.info('File uploaded successfully:', {
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      user: req.user?.id
    });

    next();
  });
};

/**
 * Cleanup middleware for failed uploads
 */
export const cleanupFailedUpload = (err, req, res, next) => {
  if (req.file && req.file.path && fs.existsSync(req.file.path)) {
    fs.unlink(req.file.path, (unlinkErr) => {
      if (unlinkErr) {
        logger.error('Failed to cleanup uploaded file:', unlinkErr);
      } else {
        logger.info('Cleaned up failed upload:', req.file.path);
      }
    });
  }
  
  next(err);
};

/**
 * File validation middleware
 */
export const validateFileUpload = (options = {}) => {
  const {
    required = true,
    allowedTypes = [],
    maxSize = null,
    minSize = 0
  } = options;

  return (req, res, next) => {
    if (required && !req.file) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'File is required'
      });
    }

    if (req.file) {
      // Check file type
      if (allowedTypes.length > 0 && !allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
        });
      }

      // Check file size
      if (maxSize && req.file.size > maxSize) {
        return res.status(413).json({
          success: false,
          data: null,
          error: `File too large. Maximum size: ${Math.round(maxSize / (1024 * 1024))}MB`
        });
      }

      if (req.file.size < minSize) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `File too small. Minimum size: ${Math.round(minSize / 1024)}KB`
        });
      }
    }

    next();
  };
};

/**
 * Create directory if it doesn't exist
 */
export const ensureUploadDir = (dirPath) => {
  return (req, res, next) => {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    next();
  };
};

export default {
  videoUpload,
  audioUpload,
  imageUpload,
  avatarUpload,
  thumbnailUpload,
  projectUpload,
  multipleVideoUpload,
  multipleImageUpload,
  advancedVideoUpload,
  cleanupFailedUpload,
  validateFileUpload,
  ensureUploadDir,
  createUploadMiddleware,
  sizeLimits,
  uploadDirs
};
