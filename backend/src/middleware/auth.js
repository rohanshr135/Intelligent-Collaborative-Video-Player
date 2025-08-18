import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { config } from '../config/env.js';
import { getRedisClient, isRedisAvailable } from '../utils/redis.js';

/**
 * Custom authentication error classes
 */
export class AuthenticationError extends Error {
  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
    this.isOperational = true;
  }
}

export class AuthorizationError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
    this.isOperational = true;
  }
}

/**
 * Rate limiting for authentication endpoints
 */
export const authLimiter = rateLimit({
  store: isRedisAvailable() ? new RedisStore({
    sendCommand: async (...args) => {
      const client = await getRedisClient();
      return client.sendCommand(args);
    },
  }) : undefined,
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMaxRequests,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `auth:${req.ip}:${req.get('User-Agent') || 'unknown'}`
});

/**
 * Extract token from request
 */
const extractToken = (req) => {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookies
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }

  // Check query parameter (for WebSocket connections)
  if (req.query && req.query.token) {
    return req.query.token;
  }

  return null;
};

/**
 * Hash password utility
 */
export const hashPassword = async (password) => {
  return await bcrypt.hash(password, config.bcrypt.rounds);
};

/**
 * Compare password utility
 */
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Middleware to require authentication
 * Verifies JWT token and attaches user to request
 */
export const requireAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    // Verify the token
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Check if token is blacklisted
    if (isRedisAvailable()) {
      const client = await getRedisClient();
      const isBlacklisted = await client.get(`blacklist:${token}`);
      if (isBlacklisted) {
        throw new AuthenticationError('Token has been revoked');
      }
    }
    
    // Find the user
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (!user.isActive) {
      throw new AuthenticationError('User account is deactivated');
    }

    // Check if email verification is required
    if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !user.isEmailVerified) {
      throw new AuthenticationError('Email verification required');
    }

    // Attach user and token to request
    req.user = user;
    req.token = token;

    // Update last activity
    user.lastActivity = new Date();
    await user.save();

    logger.info('User authenticated:', {
      userId: user._id,
      email: user.email,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed:', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });

    if (error.name === 'JsonWebTokenError') {
      next(new AuthenticationError('Invalid token'));
    } else if (error.name === 'TokenExpiredError') {
      next(new AuthenticationError('Token expired'));
    } else {
      next(error);
    }
  }
};

/**
 * Middleware for optional authentication
 * Attaches user to request if token is valid, but doesn't require it
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return next();
    }

    // Verify the token for admin route
    const decoded = jwt.verify(token, config.jwt.secret);    // Find the user
    const user = await User.findById(decoded.userId).select('-password');
    
    if (user && user.isActive) {
      req.user = user;
      req.token = token;
    }

    next();
  } catch (error) {
    // Don't fail on optional auth errors, just continue without user
    logger.debug('Optional auth failed:', error.message);
    next();
  }
};

/**
 * Middleware to require specific role(s)
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      if (!roles.includes(req.user.role)) {
        throw new AuthorizationError(`Access denied. Required role(s): ${roles.join(', ')}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Legacy support - single role check
 */
export const requireSingleRole = (role) => {
  return requireRole(role);
};

/**
 * Legacy support - multiple role check
 */
export const requireAnyRole = (roles) => {
  return requireRole(...roles);
};

/**
 * Enhanced ownership middleware
 */
export const requireOwnership = (resourceModel, resourceParam = 'id', userField = 'userId') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      // Admin users can access any resource
      if (req.user.role === 'admin') {
        return next();
      }

      const resourceId = req.params[resourceParam];
      
      // If checking user ownership by ID
      if (resourceParam === 'userId' && resourceId !== req.user.id) {
        throw new AuthorizationError('You can only access your own resources');
      }

      // If we have a model, check database
      if (resourceModel) {
        const resource = await resourceModel.findById(resourceId);
        
        if (!resource) {
          return res.status(404).json({
            success: false,
            error: 'Resource not found'
          });
        }

        const resourceUserId = resource[userField]?.toString() || resource[userField];
        if (resourceUserId !== req.user._id.toString()) {
          throw new AuthorizationError('Access denied');
        }

        req.resource = resource;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to verify refresh token
 */
export const verifyRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Refresh token required'
      });
    }

    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    
    // Find the user
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'User account is deactivated'
      });
    }

    // Check if refresh token is still valid (stored in user record)
    if (!user.refreshTokens.includes(refreshToken)) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Invalid refresh token'
      });
    }

    req.user = user;
    req.refreshToken = refreshToken;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Invalid refresh token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Refresh token expired'
      });
    }

    console.error('Refresh token verification error:', error);
    res.status(500).json({
      success: false,
      data: null,
      error: 'Token verification error'
    });
  }
};

/**
 * Enhanced token generation with improved security
 */
export const generateTokens = (userId, userRole = 'user') => {
  const payload = {
    userId,
    role: userRole,
    iat: Math.floor(Date.now() / 1000)
  };

  const accessToken = jwt.sign(
    payload,
    config.jwt.secret,
    { 
      expiresIn: config.jwt.expiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience
    }
  );

  const refreshToken = jwt.sign(
    { userId },
    config.jwt.refreshSecret,
    { 
      expiresIn: config.jwt.refreshExpiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience
    }
  );

  return { accessToken, refreshToken };
};

/**
 * Token blacklisting utility
 */
export const blacklistToken = async (token) => {
  try {
    if (!isRedisAvailable()) {
      logger.warn('Redis not available, cannot blacklist token');
      return;
    }

    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        const client = await getRedisClient();
        await client.setEx(`blacklist:${token}`, ttl, 'true');
      }
    }
  } catch (error) {
    logger.error('Failed to blacklist token:', error);
  }
};

/**
 * Logout middleware
 */
export const logout = async (req, res, next) => {
  try {
    if (req.token) {
      await blacklistToken(req.token);
    }

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    logger.info('User logged out:', {
      userId: req.user?._id,
      ip: req.ip
    });

    next();
  } catch (error) {
    logger.error('Logout error:', error);
    next(error);
  }
};

/**
 * Permission-based authorization middleware
 */
export const requirePermission = (...permissions) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userPermissions = req.user.permissions || [];
      const hasPermission = permissions.some(permission => userPermissions.includes(permission));

      if (!hasPermission) {
        throw new AuthorizationError(`Required permission(s): ${permissions.join(', ')}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * API key authentication middleware
 */
export const requireApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
      throw new AuthenticationError('API key required');
    }

    // Find user by API key
    const user = await User.findOne({ 
      apiKey: apiKey, 
      isActive: true 
    }).select('-password');

    if (!user) {
      throw new AuthenticationError('Invalid API key');
    }

    req.user = user;
    req.apiKeyUsed = true;

    next();
  } catch (error) {
    next(error);
  }
};

export default {
  requireAuth,
  optionalAuth,
  requireRole,
  requireSingleRole,
  requireAnyRole,
  requireOwnership,
  requirePermission,
  requireApiKey,
  verifyRefreshToken,
  generateTokens,
  hashPassword,
  comparePassword,
  blacklistToken,
  logout,
  authLimiter,
  AuthenticationError,
  AuthorizationError
};
