import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import logger from '../utils/logger.js';
import { config, isProduction } from '../config/env.js';
import { getRedisClient, isRedisAvailable } from '../utils/redis.js';

/**
 * CORS configuration
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [...config.allowedOrigins];

    // In production, add configured production domains
    if (isProduction()) {
      if (config.frontendUrl) allowedOrigins.push(config.frontendUrl);
      if (config.adminUrl) allowedOrigins.push(config.adminUrl);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-CSRF-Token'
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200 // Support legacy browsers
};

/**
 * Helmet security configuration
 */
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com"
      ],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'", // Required for development
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://cdnjs.cloudflare.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https:",
        "http:"
      ],
      mediaSrc: [
        "'self'",
        "blob:",
        "data:",
        "https:",
        "http:"
      ],
      connectSrc: [
        "'self'",
        "ws:",
        "wss:",
        "https:",
        "http:"
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false, // Required for video streaming
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
};

/**
 * Create rate limiter with Redis store if available
 */
const createRateLimit = (options = {}) => {
  const defaultOptions = {
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      success: false,
      data: null,
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for admin users
      return req.user?.role === 'admin';
    },
    // Removed deprecated onLimitReached option
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for ${req.ip} (${req.user?.id || 'anonymous'})`);
      res.status(429).json({
        success: false,
        data: null,
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
      });
    }
  };

  const mergedOptions = { ...defaultOptions, ...options };

  // Use Redis store if available
  if (isRedisAvailable()) {
    mergedOptions.store = new RedisStore({
      sendCommand: async (...args) => {
        const client = await getRedisClient();
        return client.sendCommand(args);
      },
    });
  }

  return rateLimit(mergedOptions);
};

/**
 * General API rate limiting
 */
export const generalRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes
  message: {
    success: false,
    data: null,
    error: 'Too many API requests, please try again later.'
  }
});

/**
 * Strict rate limiting for authentication endpoints
 */
export const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per 15 minutes
  skipSuccessfulRequests: true,
  message: {
    success: false,
    data: null,
    error: 'Too many authentication attempts, please try again later.'
  }
});

/**
 * AI endpoints rate limiting (more restrictive)
 */
export const aiRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 AI requests per hour
  message: {
    success: false,
    data: null,
    error: 'AI request limit exceeded, please try again later.'
  }
});

/**
 * Upload endpoints rate limiting
 */
export const uploadRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: {
    success: false,
    data: null,
    error: 'Upload limit exceeded, please try again later.'
  }
});

/**
 * Video streaming rate limiting (more lenient)
 */
export const streamRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 stream requests per minute
  message: {
    success: false,
    data: null,
    error: 'Too many streaming requests, please slow down.'
  }
});

/**
 * IP whitelist middleware
 */
export const ipWhitelist = (whitelist = []) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (whitelist.length === 0 || whitelist.includes(clientIP)) {
      return next();
    }

    logger.warn(`Blocked request from non-whitelisted IP: ${clientIP}`);
    return res.status(403).json({
      success: false,
      data: null,
      error: 'Access denied'
    });
  };
};

/**
 * Request size limiting
 */
export const requestSizeLimit = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const maxBytes = typeof maxSize === 'string' 
      ? parseInt(maxSize) * 1024 * 1024 
      : maxSize;

    if (contentLength > maxBytes) {
      return res.status(413).json({
        success: false,
        data: null,
        error: 'Request entity too large'
      });
    }

    next();
  };
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req, res, next) => {
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  // Add custom security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Add API version header
  res.setHeader('X-API-Version', process.env.API_VERSION || '1.0.0');

  next();
};

/**
 * Request logging middleware
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.info('Request received:', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length'),
    user: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed:', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      user: req.user?.id
    });
  });

  next();
};

/**
 * CSRF protection for state-changing operations
 */
export const csrfProtection = (req, res, next) => {
  // Skip CSRF for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for API requests with valid JWT
  if (req.headers.authorization && req.user) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  
  if (!token) {
    return res.status(403).json({
      success: false,
      data: null,
      error: 'CSRF token missing'
    });
  }

  // Verify CSRF token (implement your token verification logic)
  // For now, we'll skip actual verification in API-only mode
  next();
};

/**
 * API key authentication for external services
 */
export const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKeys = (process.env.API_KEYS || '').split(',').filter(Boolean);

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'API key required'
    });
  }

  if (!validApiKeys.includes(apiKey)) {
    logger.warn(`Invalid API key attempt: ${apiKey.substring(0, 8)}...`);
    return res.status(401).json({
      success: false,
      data: null,
      error: 'Invalid API key'
    });
  }

  next();
};

/**
 * Content-Type validation
 */
export const validateContentType = (allowedTypes = ['application/json']) => {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const contentType = req.headers['content-type'];
    
    if (!contentType) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Content-Type header required'
      });
    }

    const isValid = allowedTypes.some(type => 
      contentType.toLowerCase().includes(type.toLowerCase())
    );

    if (!isValid) {
      return res.status(415).json({
        success: false,
        data: null,
        error: `Unsupported Media Type. Allowed: ${allowedTypes.join(', ')}`
      });
    }

    next();
  };
};

/**
 * Setup all security middleware
 */
export const setupSecurity = (app) => {
  // Trust proxy (important for rate limiting with IP)
  app.set('trust proxy', 1);

  // Compression
  app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    }
  }));

  // Security headers
  app.use(helmet(helmetOptions));
  app.use(securityHeaders);

  // CORS
  app.use(cors(corsOptions));

  // Request logging
  if (process.env.NODE_ENV !== 'test') {
    app.use(requestLogger);
  }

  // General rate limiting
  app.use('/api/', generalRateLimit);

  logger.info('Security middleware initialized');
};

export default {
  setupSecurity,
  corsOptions,
  helmetOptions,
  generalRateLimit,
  authRateLimit,
  aiRateLimit,
  uploadRateLimit,
  streamRateLimit,
  ipWhitelist,
  requestSizeLimit,
  securityHeaders,
  requestLogger,
  csrfProtection,
  apiKeyAuth,
  validateContentType,
  createRateLimit
};
