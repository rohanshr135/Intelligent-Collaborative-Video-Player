import dotenv from 'dotenv';

// Load environment variables once
dotenv.config();

/**
 * Centralized configuration object
 * Single source of truth for all environment variables
 */
export const config = {
  // Server configuration
  port: parseInt(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/video_sync',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // API configuration
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:5173'],
  frontendUrl: process.env.FRONTEND_URL,
  adminUrl: process.env.ADMIN_URL,
  
  // Authentication configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: 'video-player-app',
    audience: 'video-player-users'
  },
  
  // Third-party API keys
  api: {
    gemini: process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    supabase: {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_ANON_KEY
    }
  },
  
  // Security configuration
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS) || 12
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5
  },
  
  // File upload configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024, // 100MB
    allowedTypes: process.env.ALLOWED_FILE_TYPES ? process.env.ALLOWED_FILE_TYPES.split(',') : ['video/mp4', 'video/webm', 'video/ogg']
  }
};

/**
 * Validate required environment variables
 */
export const validateConfig = () => {
  const required = [
    'JWT_SECRET',
    'MONGODB_URI'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Warn about missing optional but recommended variables
  const recommended = [
    'GEMINI_API_KEY',
    'REDIS_URL'
  ];
  
  const missingRecommended = recommended.filter(key => !process.env[key]);
  if (missingRecommended.length > 0) {
    console.warn(`Missing recommended environment variables: ${missingRecommended.join(', ')}`);
  }
};

/**
 * Check if running in production
 */
export const isProduction = () => config.nodeEnv === 'production';

/**
 * Check if running in development
 */
export const isDevelopment = () => config.nodeEnv === 'development';

/**
 * Check if running in test environment
 */
export const isTest = () => config.nodeEnv === 'test';
