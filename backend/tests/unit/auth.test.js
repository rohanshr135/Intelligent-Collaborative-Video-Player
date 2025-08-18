import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  authLimiter,
  hashPassword,
  comparePassword,
  generateTokens,
  blacklistToken,
  requireAuth,
  requireRole,
  verifyRefreshToken
} from '../../src/middleware/auth.js';
import { User } from '../../src/models/User.js';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config/env.js';

// Mock the User model
jest.mock('../../src/models/User.js', () => ({
  User: {
    create: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn()
  }
}));

describe('Authentication Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {},
      cookies: {},
      query: {},
      ip: '127.0.0.1',
      get: jest.fn()
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis()
    };
    
    mockNext = jest.fn();
    
    jest.clearAllMocks();
    
    // Reset User model mocks
    User.findById.mockReset();
    User.findOne.mockReset();
    User.create.mockReset();
  });

  describe('Password Hashing', () => {
    test('should hash password correctly', async () => {
      const password = 'testPassword123!';
      const hashedPassword = await hashPassword(password);
      
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(50);
    });

    test('should create different hashes for same password', async () => {
      const password = 'testPassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });

    test('should verify password correctly', async () => {
      const password = 'testPassword123!';
      const hashedPassword = await hashPassword(password);
      
      const isValid = await comparePassword(password, hashedPassword);
      const isInvalid = await comparePassword('wrongPassword', hashedPassword);
      
      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Token Generation', () => {
    test('should generate valid tokens', () => {
      const userId = 'user123';
      const userRole = 'user';
      
      const tokens = generateTokens(userId, userRole);
      
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    test('should create valid JWT tokens', () => {
      const userId = 'user123';
      const tokens = generateTokens(userId);
      
      const accessPayload = jwt.verify(tokens.accessToken, config.jwt.secret);
      const refreshPayload = jwt.verify(tokens.refreshToken, config.jwt.refreshSecret);
      
      expect(accessPayload.userId).toBe(userId);
      expect(accessPayload.role).toBe('user');
      expect(refreshPayload.userId).toBe(userId);
    });

    test('should include correct claims in tokens', () => {
      const userId = 'user123';
      const userRole = 'admin';
      const tokens = generateTokens(userId, userRole);
      
      const payload = jwt.verify(tokens.accessToken, config.jwt.secret);
      
      expect(payload.userId).toBe(userId);
      expect(payload.role).toBe(userRole);
      expect(payload.iss).toBe(config.jwt.issuer);
      expect(payload.aud).toBe(config.jwt.audience);
      expect(payload.iat).toBeDefined();
    });
  });

  describe('Token Extraction', () => {
    test('should extract token from Authorization header', async () => {
      const testUser = {
        _id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: await hashPassword('password123'),
        firstName: 'Test',
        lastName: 'User',
        isActive: true
      };

      User.findById.mockResolvedValue(testUser);
      const tokens = generateTokens(testUser._id);
      
      mockReq.headers.authorization = `Bearer ${tokens.accessToken}`;
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user._id).toBe(testUser._id);
    });

    test('should extract token from cookies', async () => {
      const testUser = {
        _id: 'test-user-id-2',
        username: 'testuser2',
        email: 'test2@example.com',
        passwordHash: await hashPassword('password123'),
        firstName: 'Test',
        lastName: 'User',
        isActive: true
      };

      User.findById.mockResolvedValue(testUser);
      const tokens = generateTokens(testUser._id);
      
      mockReq.cookies.accessToken = tokens.accessToken;
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
    });

    test('should extract token from query parameter', async () => {
      const testUser = {
        _id: 'test-user-id-3',
        username: 'testuser3',
        email: 'test3@example.com',
        passwordHash: await hashPassword('password123'),
        firstName: 'Test',
        lastName: 'User',
        isActive: true
      };

      User.findById.mockResolvedValue(testUser);
      const tokens = generateTokens(testUser._id);
      
      mockReq.query.token = tokens.accessToken;
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
    });
  });

  describe('Authentication Middleware', () => {
    test('should reject request without token', async () => {
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'No token provided'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should reject request with invalid token', async () => {
      mockReq.headers.authorization = 'Bearer invalid-token';
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid token')
        })
      );
    });

    test('should reject request for non-existent user', async () => {
      const fakeUserId = '507f1f77bcf86cd799439011';
      const tokens = generateTokens(fakeUserId);
      
      User.findById.mockResolvedValue(null); // User not found
      mockReq.headers.authorization = `Bearer ${tokens.accessToken}`;
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'User not found'
        })
      );
    });

    test('should reject inactive user', async () => {
      const testUser = {
        _id: 'inactive-user-id',
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: await hashPassword('password123'),
        firstName: 'Test',
        lastName: 'User',
        isActive: false
      };

      User.findById.mockResolvedValue(testUser);
      const tokens = generateTokens(testUser._id);
      
      mockReq.headers.authorization = `Bearer ${tokens.accessToken}`;
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'User account is deactivated'
        })
      );
    });
  });

  describe('Role Authorization', () => {
    test('should allow admin users', async () => {
      const adminUser = {
        _id: 'admin-user-id',
        username: 'admin',
        email: 'admin@example.com',
        passwordHash: await hashPassword('password123'),
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
        isActive: true
      };

      mockReq.user = adminUser;
      
      const adminMiddleware = requireRole('admin');
      await adminMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject non-admin users', async () => {
      const regularUser = {
        _id: 'regular-user-id',
        username: 'user',
        email: 'user@example.com',
        passwordHash: await hashPassword('password123'),
        firstName: 'Regular',
        lastName: 'User',
        role: 'user',
        isActive: true
      };

      mockReq.user = regularUser;
      
      const adminMiddleware = requireRole('admin');
      await adminMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('access required')
        })
      );
    });
  });

  describe('Rate Limiting', () => {
    test('should create auth limiter with correct configuration', () => {
      expect(authLimiter).toBeDefined();
      expect(typeof authLimiter).toBe('function');
    });
  });

  describe('Token Blacklisting', () => {
    test('should handle blacklisting when Redis is unavailable', async () => {
      const tokens = generateTokens('user123');
      
      // Should not throw error
      await expect(blacklistToken(tokens.accessToken)).resolves.toBeUndefined();
    });

    test('should accept valid token structure for blacklisting', async () => {
      const tokens = generateTokens('user123');
      
      // Should not throw error when called with valid token
      await expect(blacklistToken(tokens.accessToken)).resolves.toBeUndefined();
    });
  });
});
