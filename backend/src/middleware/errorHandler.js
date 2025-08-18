import logger from '../utils/logger.js';

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error class
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication error class
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization error class
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not found error class
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

/**
 * Rate limit error class
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * File upload error class
 */
export class FileUploadError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'FILE_UPLOAD_ERROR', details);
  }
}

/**
 * Database error class
 */
export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

/**
 * External service error class
 */
export class ExternalServiceError extends AppError {
  constructor(service, message = 'External service unavailable') {
    super(`${service}: ${message}`, 503, 'EXTERNAL_SERVICE_ERROR', { service });
  }
}

/**
 * Handle async errors in route handlers
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle 404 errors for unmatched routes
 */
export const notFound = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.method} ${req.originalUrl}`);
  next(error);
};

/**
 * Handle Mongoose validation errors
 */
const handleMongooseValidationError = (err) => {
  const errors = Object.values(err.errors).map(error => ({
    field: error.path,
    message: error.message,
    value: error.value
  }));

  return new ValidationError('Validation failed', errors);
};

/**
 * Handle Mongoose cast errors (invalid ObjectId)
 */
const handleMongooseCastError = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new ValidationError(message);
};

/**
 * Handle Mongoose duplicate key errors
 */
const handleMongooseDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `${field} '${value}' already exists`;
  return new ValidationError(message, { field, value });
};

/**
 * Handle JWT errors
 */
const handleJWTError = (err) => {
  if (err.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token');
  }
  if (err.name === 'TokenExpiredError') {
    return new AuthenticationError('Token expired');
  }
  return new AuthenticationError('Authentication failed');
};

/**
 * Handle Multer errors
 */
const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new FileUploadError('File too large');
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return new FileUploadError('Too many files');
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new FileUploadError('Unexpected field name');
  }
  return new FileUploadError(err.message);
};

/**
 * Convert known errors to AppError instances
 */
const convertToAppError = (err) => {
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return handleMongooseValidationError(err);
  }

  // Mongoose cast error
  if (err.name === 'CastError') {
    return handleMongooseCastError(err);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    return handleMongooseDuplicateKeyError(err);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return handleJWTError(err);
  }

  // Multer errors
  if (err.code && err.code.startsWith('LIMIT_')) {
    return handleMulterError(err);
  }

  // Return as-is if already an AppError
  if (err instanceof AppError) {
    return err;
  }

  // Default server error
  return new AppError(
    process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message,
    500,
    'INTERNAL_SERVER_ERROR'
  );
};

/**
 * Send error response in development
 */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    data: null,
    error: err.message,
    code: err.code,
    details: err.details,
    stack: err.stack,
    timestamp: err.timestamp
  });
};

/**
 * Send error response in production
 */
const sendErrorProd = (err, res) => {
  // Operational errors: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      data: null,
      error: err.message,
      code: err.code,
      details: err.details,
      timestamp: err.timestamp
    });
  } else {
    // Programming or unknown errors: don't leak error details
    logger.error('Programming error:', err);
    
    res.status(500).json({
      success: false,
      data: null,
      error: 'Something went wrong',
      code: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Main error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.user?.id,
    body: req.body,
    params: req.params,
    query: req.query,
    timestamp: new Date().toISOString()
  });

  // Convert error to AppError
  const appError = convertToAppError(err);

  // Send appropriate response based on environment
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(appError, res);
  } else {
    sendErrorProd(appError, res);
  }
};

/**
 * Handle unhandled promise rejections
 */
export const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection:', {
      reason: reason,
      promise: promise
    });
    
    // Graceful shutdown
    process.exit(1);
  });
};

/**
 * Handle uncaught exceptions
 */
export const handleUncaughtException = () => {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    
    // Graceful shutdown
    process.exit(1);
  });
};

/**
 * Validation error formatter for express-validator
 */
export const formatValidationErrors = (errors) => {
  return errors.map(error => ({
    field: error.path || error.param,
    message: error.msg,
    value: error.value,
    location: error.location
  }));
};

/**
 * Create error response helper
 */
export const createErrorResponse = (message, statusCode = 500, code = null, details = null) => {
  return {
    success: false,
    data: null,
    error: message,
    code: code,
    details: details,
    timestamp: new Date().toISOString()
  };
};

/**
 * Success response helper
 */
export const createSuccessResponse = (data = null, message = 'Success') => {
  return {
    success: true,
    data: data,
    error: null,
    message: message,
    timestamp: new Date().toISOString()
  };
};

/**
 * Paginated response helper
 */
export const createPaginatedResponse = (data, pagination, message = 'Success') => {
  return {
    success: true,
    data: data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      pages: Math.ceil(pagination.total / pagination.limit),
      hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
      hasPrev: pagination.page > 1
    },
    error: null,
    message: message,
    timestamp: new Date().toISOString()
  };
};

/**
 * Handle database connection errors
 */
export const handleDatabaseError = (err) => {
  logger.error('Database connection error:', err);
  
  if (err.name === 'MongoNetworkError') {
    return new DatabaseError('Database connection failed');
  }
  
  if (err.name === 'MongoTimeoutError') {
    return new DatabaseError('Database operation timed out');
  }
  
  return new DatabaseError('Database error occurred');
};

export default {
  errorHandler,
  notFound,
  asyncHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  FileUploadError,
  DatabaseError,
  ExternalServiceError,
  handleUnhandledRejection,
  handleUncaughtException,
  formatValidationErrors,
  createErrorResponse,
  createSuccessResponse,
  createPaginatedResponse,
  handleDatabaseError
};
