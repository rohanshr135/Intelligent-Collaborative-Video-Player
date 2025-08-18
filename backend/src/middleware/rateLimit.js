import expressRateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

// Redis connection for rate limiting (optional - falls back to memory store)
let redisClient;
try {
  if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL);
  }
} catch (error) {
  console.warn('Redis not available for rate limiting, using memory store');
}

// Rate limiters configuration
const rateLimiters = {
  // Authentication endpoints
  'auth-login': {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
      success: false,
      data: null,
      error: 'Too many login attempts, please try again later'
    }
  },
  
  'auth-register': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registrations per hour per IP
    message: {
      success: false,
      data: null,
      error: 'Too many registration attempts, please try again later'
    }
  },

  'auth-password-reset': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 password reset attempts per hour
    message: {
      success: false,
      data: null,
      error: 'Too many password reset attempts, please try again later'
    }
  },

  // Video endpoints
  'video-upload': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 uploads per hour
    message: {
      success: false,
      data: null,
      error: 'Upload limit exceeded, please try again later'
    }
  },

  'video-stream': {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 stream requests per minute
    message: {
      success: false,
      data: null,
      error: 'Too many streaming requests, please slow down'
    }
  },

  // AI endpoints
  'ai-transcription': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 transcriptions per hour
    message: {
      success: false,
      data: null,
      error: 'Transcription limit exceeded, please try again later'
    }
  },

  'ai-summarization': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 summarizations per hour
    message: {
      success: false,
      data: null,
      error: 'Summarization limit exceeded, please try again later'
    }
  },

  'ai-scene-analysis': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30, // 30 scene analyses per hour
    message: {
      success: false,
      data: null,
      error: 'Scene analysis limit exceeded, please try again later'
    }
  },

  // Sync endpoints
  'sync-create': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 sync sessions per hour
    message: {
      success: false,
      data: null,
      error: 'Too many sync sessions created, please try again later'
    }
  },

  'sync-join': {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 join attempts per minute
    message: {
      success: false,
      data: null,
      error: 'Too many join attempts, please slow down'
    }
  },

  // Branching endpoints
  'branching-create': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 branching videos per hour
    message: {
      success: false,
      data: null,
      error: 'Branching video creation limit exceeded'
    }
  },

  // Editor endpoints
  'editor-projects': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 projects per hour
    message: {
      success: false,
      data: null,
      error: 'Project creation limit exceeded'
    }
  },

  'editor-markers': {
    windowMs: 60 * 1000, // 1 minute
    max: 50, // 50 markers per minute
    message: {
      success: false,
      data: null,
      error: 'Too many marker operations, please slow down'
    }
  },

  'editor-ai': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 AI operations per hour
    message: {
      success: false,
      data: null,
      error: 'AI editor operations limit exceeded'
    }
  },

  'editor-thumbnails': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 thumbnail generations per hour
    message: {
      success: false,
      data: null,
      error: 'Thumbnail generation limit exceeded'
    }
  },

  'editor-export': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 exports per hour
    message: {
      success: false,
      data: null,
      error: 'Export limit exceeded'
    }
  },

  // Analytics endpoints
  'analytics-reports': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 reports per hour
    message: {
      success: false,
      data: null,
      error: 'Report generation limit exceeded'
    }
  },

  'analytics-export': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 exports per hour
    message: {
      success: false,
      data: null,
      error: 'Analytics export limit exceeded'
    }
  },

  // General API endpoints
  'api-general': {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per 15 minutes
    message: {
      success: false,
      data: null,
      error: 'Rate limit exceeded, please slow down'
    }
  }
};

/**
 * Creates a rate limiter middleware from a configuration object
 * @param {object} config - Rate limit configuration
 * @returns {function} Express middleware
 */
const createRateLimiterFromConfig = (config) => {
  const options = {
    windowMs: config.windowMs,
    max: config.max,
    message: config.message,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for admin users in development
      if (process.env.NODE_ENV === 'development' && req.user?.role === 'admin') {
        return true;
      }
      return false;
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP address
      return req.user?.id || req.ip;
    }
  };

  // Use Redis store if available
  if (redisClient) {
    options.store = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: 'rl:'
    });
  }

  return expressRateLimit(options);
};

/**
 * Get rate limiter by name
 */
export const getRateLimit = (limiterName) => {
  const config = rateLimiters[limiterName];
  if (!config) {
    console.warn(`Rate limiter '${limiterName}' not found, using default`);
    return createRateLimiterFromConfig(rateLimiters['api-general']);
  }
  return createRateLimiterFromConfig(config);
};

/**
 * Express middleware factory for rate limiting
 */
export const createRateLimit = (limiterName, maxOverride, windowMsOverride) => {
  let config = rateLimiters[limiterName];
  
  if (!config) {
    console.warn(`Rate limiter '${limiterName}' not found, using default`);
    config = rateLimiters['api-general'];
  }

  // Allow overriding limits
  if (maxOverride !== undefined) {
    config = { ...config, max: maxOverride };
  }
  if (windowMsOverride !== undefined) {
    config = { ...config, windowMs: windowMsOverride };
  }

  return createRateLimiterFromConfig(config);
};

/**
 * Dynamic rate limiting based on user role
 */
export const dynamicRateLimit = (limiterName) => {
  return (req, res, next) => {
    let config = rateLimiters[limiterName] || rateLimiters['api-general'];
    
    // Adjust limits based on user role
    if (req.user) {
      switch (req.user.role) {
        case 'admin':
          config = { ...config, max: config.max * 10 }; // 10x limit for admins
          break;
        case 'premium':
          config = { ...config, max: config.max * 3 }; // 3x limit for premium users
          break;
        case 'verified':
          config = { ...config, max: config.max * 2 }; // 2x limit for verified users
          break;
        default:
          // Standard limits for regular users
          break;
      }
    }

    const limiter = createRateLimiterFromConfig(config);
    limiter(req, res, next);
  };
};

/**
 * Sliding window rate limiter for more precise control
 */
export const slidingWindowRateLimit = (limiterName, points, duration) => {
  const config = {
    windowMs: duration,
    max: points,
    message: rateLimiters[limiterName]?.message || rateLimiters['api-general'].message
  };

  return createRateLimiterFromConfig(config);
};

/**
 * Rate limiting with burst allowance
 */
export const burstRateLimit = (limiterName, burstMax, sustainedMax, windowMs) => {
  const burstLimiter = createRateLimiterFromConfig({
    windowMs: 60 * 1000, // 1 minute for burst
    max: burstMax,
    message: {
      success: false,
      data: null,
      error: 'Burst rate limit exceeded'
    }
  });

  const sustainedLimiter = createRateLimiterFromConfig({
    windowMs: windowMs,
    max: sustainedMax,
    message: rateLimiters[limiterName]?.message || {
      success: false,
      data: null,
      error: 'Sustained rate limit exceeded'
    }
  });

  return (req, res, next) => {
    burstLimiter(req, res, (err) => {
      if (err) return next(err);
      sustainedLimiter(req, res, next);
    });
  };
};

export default {
  getRateLimit,
  createRateLimit,
  dynamicRateLimit,
  slidingWindowRateLimit,
  burstRateLimit
};
