import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom token definitions for Morgan
 */

// Response time in milliseconds
morgan.token('response-time-ms', (req, res) => {
  if (!req._startAt || !res._startAt) {
    return '-';
  }
  const ms = (res._startAt[0] - req._startAt[0]) * 1000 + 
             (res._startAt[1] - req._startAt[1]) * 1e-6;
  return ms.toFixed(3);
});

// User ID from authenticated request
morgan.token('user-id', (req) => {
  return req.user?.id || 'anonymous';
});

// Request ID for tracing
morgan.token('request-id', (req) => {
  return req.id || 'no-id';
});

// User agent (truncated)
morgan.token('user-agent-short', (req) => {
  const userAgent = req.get('User-Agent') || '';
  return userAgent.substring(0, 50);
});

// Request body size
morgan.token('req-size', (req) => {
  return req.get('Content-Length') || '0';
});

// Response body size
morgan.token('res-size', (res) => {
  return res.get('Content-Length') || '0';
});

// Memory usage
morgan.token('memory', () => {
  const used = process.memoryUsage();
  return `${Math.round(used.rss / 1024 / 1024)}MB`;
});

// Request timestamp in ISO format
morgan.token('iso-date', () => {
  return new Date().toISOString();
});

// Session ID if available
morgan.token('session-id', (req) => {
  return req.sessionID || '-';
});

// Error details for error responses
morgan.token('error', (req, res) => {
  if (res.statusCode >= 400 && res.locals.error) {
    return res.locals.error.message || 'Unknown error';
  }
  return '-';
});

/**
 * Custom log formats
 */

// Development format - colored and detailed
const devFormat = ':method :url :status :response-time-ms ms - :res[content-length] - :user-id - :user-agent-short';

// Production format - structured JSON
const prodFormat = JSON.stringify({
  timestamp: ':iso-date',
  method: ':method',
  url: ':url',
  status: ':status',
  responseTime: ':response-time-ms ms',
  requestSize: ':req-size',
  responseSize: ':res-size',
  userAgent: ':user-agent',
  ip: ':remote-addr',
  userId: ':user-id',
  requestId: ':request-id',
  referer: ':referrer',
  memory: ':memory'
});

// Combined format with custom fields
const combinedFormat = ':remote-addr - :user-id [:iso-date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time-ms ms';

// Minimal format for high-traffic endpoints
const minimalFormat = ':method :url :status :response-time-ms ms';

// Error format for error logs
const errorFormat = ':iso-date :method :url :status :response-time-ms ms - :user-id - :error';

/**
 * Stream configurations
 */

// Console stream with colors for development
const consoleStream = {
  write: (message) => {
    // Remove trailing newline and log through our logger
    logger.info(message.trim());
  }
};

// File streams for different log levels
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, 'access.log'),
  { flags: 'a' }
);

const errorLogStream = fs.createWriteStream(
  path.join(logsDir, 'error.log'),
  { flags: 'a' }
);

const apiLogStream = fs.createWriteStream(
  path.join(logsDir, 'api.log'),
  { flags: 'a' }
);

/**
 * Skip function for different scenarios
 */
const skipHealthChecks = (req, res) => {
  return req.url === '/health' || req.url === '/ping';
};

const skipSuccessful = (req, res) => {
  return res.statusCode < 400;
};

const skipErrors = (req, res) => {
  return res.statusCode < 400;
};

const skipStatic = (req, res) => {
  return req.url.startsWith('/static') || req.url.startsWith('/assets');
};

/**
 * Environment-specific middleware configurations
 */

// Development logging - detailed console output
export const developmentLogging = morgan(devFormat, {
  stream: consoleStream,
  skip: skipHealthChecks
});

// Production access logging - to file
export const productionAccessLogging = morgan(combinedFormat, {
  stream: accessLogStream,
  skip: (req, res) => skipHealthChecks(req, res) || skipStatic(req, res)
});

// Error logging - errors only
export const errorLogging = morgan(errorFormat, {
  stream: errorLogStream,
  skip: skipSuccessful
});

// API-specific logging with JSON format
export const apiLogging = morgan(prodFormat, {
  stream: apiLogStream,
  skip: (req, res) => !req.url.startsWith('/api') || skipHealthChecks(req, res)
});

// High-performance logging for streaming endpoints
export const streamingLogging = morgan(minimalFormat, {
  stream: consoleStream,
  skip: (req, res) => !req.url.includes('/stream') && !req.url.includes('/video')
});

/**
 * Request tracing middleware
 */
export const requestTracing = (req, res, next) => {
  // Generate request ID for tracing
  req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Add request start time
  req._startAt = process.hrtime();
  
  // Store original end function
  const originalEnd = res.end;
  
  // Override end function to capture response time
  res.end = function(chunk, encoding) {
    res._startAt = process.hrtime();
    res.end = originalEnd;
    res.end(chunk, encoding);
  };
  
  next();
};

/**
 * Performance monitoring middleware
 */
export const performanceMonitoring = (req, res, next) => {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const endMemory = process.memoryUsage();
    
    // Log slow requests (> 1 second)
    if (duration > 1000) {
      logger.warn('Slow request detected:', {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        userId: req.user?.id,
        memoryDelta: {
          rss: endMemory.rss - startMemory.rss,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed
        }
      });
    }
    
    // Log memory-intensive requests
    const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;
    if (memoryIncrease > 50 * 1024 * 1024) { // 50MB
      logger.warn('Memory-intensive request:', {
        method: req.method,
        url: req.url,
        memoryIncrease: `${Math.round(memoryIncrease / 1024 / 1024)}MB`,
        userId: req.user?.id
      });
    }
  });
  
  next();
};

/**
 * Request size monitoring
 */
export const requestSizeMonitoring = (req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  
  // Log large requests (> 10MB)
  if (contentLength > 10 * 1024 * 1024) {
    logger.info('Large request received:', {
      method: req.method,
      url: req.url,
      size: `${Math.round(contentLength / 1024 / 1024)}MB`,
      userId: req.user?.id,
      userAgent: req.get('User-Agent')
    });
  }
  
  next();
};

/**
 * User activity tracking
 */
export const userActivityTracking = (req, res, next) => {
  if (req.user && req.method !== 'GET') {
    logger.info('User activity:', {
      userId: req.user.id,
      action: `${req.method} ${req.url}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

/**
 * Setup logging middleware based on environment
 */
export const setupLogging = (app) => {
  // Add request tracing
  app.use(requestTracing);
  
  // Add performance monitoring
  app.use(performanceMonitoring);
  
  // Add request size monitoring
  app.use(requestSizeMonitoring);
  
  // Environment-specific logging
  if (process.env.NODE_ENV === 'development') {
    app.use(developmentLogging);
  } else {
    app.use(productionAccessLogging);
  }
  
  // Always log errors
  app.use(errorLogging);
  
  // API-specific logging
  app.use(apiLogging);
  
  // User activity tracking
  app.use(userActivityTracking);
  
  logger.info('Logging middleware initialized');
};

/**
 * Log rotation helper
 */
export const rotateLog = (logPath) => {
  const timestamp = new Date().toISOString().slice(0, 10);
  const rotatedPath = `${logPath}.${timestamp}`;
  
  try {
    if (fs.existsSync(logPath)) {
      fs.renameSync(logPath, rotatedPath);
      logger.info(`Log rotated: ${logPath} -> ${rotatedPath}`);
    }
  } catch (error) {
    logger.error('Log rotation failed:', error);
  }
};

/**
 * Schedule daily log rotation
 */
export const scheduleLogRotation = () => {
  const rotateDaily = () => {
    rotateLog(path.join(logsDir, 'access.log'));
    rotateLog(path.join(logsDir, 'error.log'));
    rotateLog(path.join(logsDir, 'api.log'));
  };
  
  // Rotate logs daily at midnight
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const timeUntilMidnight = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    rotateDaily();
    // Then rotate every 24 hours
    setInterval(rotateDaily, 24 * 60 * 60 * 1000);
  }, timeUntilMidnight);
  
  logger.info('Log rotation scheduled');
};

export default {
  setupLogging,
  developmentLogging,
  productionAccessLogging,
  errorLogging,
  apiLogging,
  streamingLogging,
  requestTracing,
  performanceMonitoring,
  requestSizeMonitoring,
  userActivityTracking,
  rotateLog,
  scheduleLogRotation
};
