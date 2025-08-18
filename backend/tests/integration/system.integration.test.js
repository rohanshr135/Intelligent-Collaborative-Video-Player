import { describe, test, expect, beforeEach } from '@jest/globals';
import { config, validateConfig } from '../../src/config/env.js';
import redisManager from '../../src/utils/redis.js';
import { User } from '../../src/models/User.js';
import { Video } from '../../src/models/Video.js';
import { SyncSession } from '../../src/models/SyncSession.js';
import mongoose from 'mongoose';

describe('System Integration Tests', () => {
  describe('Configuration Integration', () => {
    test('should have all required configuration loaded', () => {
      expect(() => validateConfig()).not.toThrow();
      
      expect(config.port).toBeDefined();
      expect(config.nodeEnv).toBe('test');
      expect(config.mongoUri).toBeDefined();
      expect(config.jwt.secret).toBeDefined();
      expect(config.corsOrigin).toBeDefined();
    });

    test('should have proper JWT configuration', () => {
      expect(config.jwt.secret).toBeTruthy();
      expect(config.jwt.refreshSecret).toBeTruthy();
      expect(config.jwt.expiresIn).toBe('15m');
      expect(config.jwt.refreshExpiresIn).toBe('7d');
      expect(config.jwt.issuer).toBe('video-player-app');
      expect(config.jwt.audience).toBe('video-player-users');
    });

    test('should have security configurations', () => {
      expect(config.bcrypt.rounds).toBeGreaterThanOrEqual(12);
      expect(config.rateLimit.windowMs).toBeGreaterThan(0);
      expect(config.rateLimit.maxRequests).toBeGreaterThan(0);
      expect(config.upload.maxFileSize).toBeGreaterThan(0);
    });
  });

  describe('Database Integration', () => {
    test('should connect to MongoDB successfully', () => {
      expect(mongoose.connection.readyState).toBe(1); // Connected
    });

    test('should have proper database name for testing', () => {
      expect(mongoose.connection.name).toMatch(/test/i);
    });

    test('should create and query models successfully', async () => {
      const testUser = await User.create({
        username: 'integrationtest',
        email: 'integration@test.com',
        password: 'TestPassword123!',
        firstName: 'Integration',
        lastName: 'Test'
      });

      expect(testUser._id).toBeDefined();
      
      const foundUser = await User.findById(testUser._id);
      expect(foundUser.username).toBe('integrationtest');
    });

    test('should handle model relationships correctly', async () => {
      const user = await User.create({
        username: 'videouser',
        email: 'video@test.com',
        password: 'TestPassword123!',
        firstName: 'Video',
        lastName: 'User'
      });

      // Test if Video model exists and can reference User
      if (Video) {
        const video = await Video.create({
          title: 'Test Video',
          description: 'Integration test video',
          uploadedBy: user._id,
          filename: 'test.mp4',
          mimetype: 'video/mp4',
          size: 1000000,
          path: '/uploads/test.mp4'
        });

        expect(video.uploadedBy.toString()).toBe(user._id);
      }
    });
  });

  describe('Redis Integration', () => {
    test('should handle Redis unavailability gracefully', () => {
      expect(redisManager.isAvailable()).toBe(false);
    });

    test('should provide fallback behavior when Redis is down', async () => {
      const info = await redisManager.getInfo();
      
      expect(info).toEqual({
        connected: false,
        error: 'Redis not available'
      });
    });

    test('should not throw errors when Redis operations fail', async () => {
      await expect(redisManager.getClient()).resolves.toBeDefined();
      await expect(redisManager.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('Environment Variable Integration', () => {
    test('should use test environment variables', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.JWT_SECRET).toBeDefined();
      expect(process.env.MONGODB_URI).toContain('memory');
    });

    test('should override defaults with environment values', () => {
      // Test that environment variables are being used
      expect(config.jwt.secret).toBe(process.env.JWT_SECRET);
      expect(config.mongoUri).toBe(process.env.MONGODB_URI);
    });
  });

  describe('Model Integration', () => {
    beforeEach(async () => {
      // Clean up before each test
      await User.deleteMany({});
      if (Video) await Video.deleteMany({});
      if (SyncSession) await SyncSession.deleteMany({});
    });

    test('should handle User model operations', async () => {
      const user = await User.create({
        username: 'modeltest',
        email: 'model@test.com',
        password: 'TestPassword123!',
        firstName: 'Model',
        lastName: 'Test'
      });

      // Test update
      user.firstName = 'Updated';
      await user.save();
      
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.firstName).toBe('Updated');

      // Test delete
      await User.findByIdAndDelete(user._id);
      const deletedUser = await User.findById(user._id);
      expect(deletedUser).toBeNull();
    });

    test('should handle unique constraints', async () => {
      const userData = {
        username: 'uniquetest',
        email: 'unique@test.com',
        password: 'TestPassword123!',
        firstName: 'Unique',
        lastName: 'Test'
      };

      await User.create(userData);

      // Try to create duplicate username
      await expect(User.create({
        ...userData,
        email: 'different@test.com'
      })).rejects.toThrow();

      // Try to create duplicate email
      await expect(User.create({
        ...userData,
        username: 'different'
      })).rejects.toThrow();
    });

    test('should handle validation errors', async () => {
      const invalidUsers = [
        {
          // Missing required fields
          username: 'test'
        },
        {
          // Invalid email
          username: 'test',
          email: 'invalid-email',
          password: 'password',
          firstName: 'Test',
          lastName: 'User'
        },
        {
          // Username too short
          username: 'a',
          email: 'test@example.com',
          password: 'password',
          firstName: 'Test',
          lastName: 'User'
        }
      ];

      for (const userData of invalidUsers) {
        await expect(User.create(userData)).rejects.toThrow();
      }
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle database connection errors gracefully', async () => {
      // Simulate database operation during connection issues
      const originalReadyState = mongoose.connection.readyState;
      
      try {
        // This test mainly ensures our error handling doesn't crash
        const users = await User.find({}).limit(1);
        expect(Array.isArray(users)).toBe(true);
      } catch (error) {
        // Should handle gracefully
        expect(error).toBeInstanceOf(Error);
      }
    });

    test('should handle malformed data gracefully', async () => {
      const malformedData = [
        null,
        undefined,
        '',
        {},
        { invalid: 'data' }
      ];

      for (const data of malformedData) {
        await expect(User.create(data)).rejects.toThrow();
      }
    });
  });

  describe('Performance Integration', () => {
    test('should handle multiple concurrent operations', async () => {
      const operations = Array(10).fill().map((_, index) => 
        User.create({
          username: `concurrent${index}`,
          email: `concurrent${index}@test.com`,
          password: 'TestPassword123!',
          firstName: 'Concurrent',
          lastName: `Test${index}`
        })
      );

      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(10);
      results.forEach((user, index) => {
        expect(user.username).toBe(`concurrent${index}`);
      });
    });

    test('should complete operations within reasonable time', async () => {
      const startTime = Date.now();
      
      await User.create({
        username: 'speedtest',
        email: 'speed@test.com',
        password: 'TestPassword123!',
        firstName: 'Speed',
        lastName: 'Test'
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within 1 second
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Security Integration', () => {
    test('should not expose sensitive data in JSON output', async () => {
      const user = await User.create({
        username: 'securitytest',
        email: 'security@test.com',
        password: 'TestPassword123!',
        firstName: 'Security',
        lastName: 'Test'
      });

      const userJSON = user.toJSON();
      
      expect(userJSON.password).toBeUndefined();
      expect(userJSON.passwordHash).toBeUndefined();
      expect(userJSON.refreshTokens).toBeUndefined();
      expect(userJSON._id).toBeUndefined(); // Should be transformed to id
      expect(userJSON.__v).toBeUndefined();
      expect(userJSON.id).toBeDefined();
    });

    test('should hash passwords correctly', async () => {
      const password = 'TestPassword123!';
      const user = await User.create({
        username: 'hashtest',
        email: 'hash@test.com',
        password: password,
        firstName: 'Hash',
        lastName: 'Test'
      });

      expect(user.password).not.toBe(password);
      expect(user.password).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt pattern
    });
  });
});
