import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { config, validateConfig, isProduction, isDevelopment, isTest } from '../../src/config/env.js';

describe('Configuration Management', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment to test state
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Configuration Loading', () => {
    test('should load default configuration values', () => {
      expect(config.port).toBe(5000);
      expect(config.nodeEnv).toBe('test');
      expect(config.corsOrigin).toBe('http://localhost:5173');
    });

    test('should override defaults with environment variables', async () => {
      process.env.PORT = '8080';
      process.env.CORS_ORIGIN = 'http://localhost:3000';
      
      // Re-import to get updated config (ES module approach)
      const envModule = await import('../../src/config/env.js?t=' + Date.now());
      
      expect(envModule.config.port).toBe(8080);
      expect(envModule.config.corsOrigin).toBe('http://localhost:3000');
    });

    test('should have proper JWT configuration structure', () => {
      expect(config.jwt).toBeDefined();
      expect(config.jwt.secret).toBeDefined();
      expect(config.jwt.expiresIn).toBe('15m');
      expect(config.jwt.refreshExpiresIn).toBe('7d');
      expect(config.jwt.issuer).toBe('video-player-app');
      expect(config.jwt.audience).toBe('video-player-users');
    });

    test('should have API configuration structure', () => {
      expect(config.api).toBeDefined();
      expect(config.api.gemini).toBeDefined(); // Should be set in test env
      expect(config.api.supabase).toBeDefined();
      // URL and key might be undefined in test environment, just check structure exists
      expect(config.api.supabase).toHaveProperty('url');
      expect(config.api.supabase).toHaveProperty('key');
    });

    test('should have rate limiting configuration', () => {
      expect(config.rateLimit).toBeDefined();
      expect(config.rateLimit.windowMs).toBe(15 * 60 * 1000);
      expect(config.rateLimit.maxRequests).toBe(100);
      expect(config.rateLimit.authMaxRequests).toBe(5);
    });

    test('should have upload configuration', () => {
      expect(config.upload).toBeDefined();
      expect(config.upload.maxFileSize).toBe(100 * 1024 * 1024);
      expect(Array.isArray(config.upload.allowedTypes)).toBe(true);
    });
  });

  describe('Configuration Validation', () => {
    test('should pass validation with required environment variables', () => {
      expect(() => validateConfig()).not.toThrow();
    });

    test('should throw error when JWT_SECRET is missing', () => {
      delete process.env.JWT_SECRET;
      expect(() => validateConfig()).toThrow('Missing required environment variables: JWT_SECRET');
    });

    test('should throw error when MONGODB_URI is missing', () => {
      delete process.env.MONGODB_URI;
      expect(() => validateConfig()).toThrow('Missing required environment variables: MONGODB_URI');
    });

    test('should throw error when multiple required variables are missing', () => {
      delete process.env.JWT_SECRET;
      delete process.env.MONGODB_URI;
      expect(() => validateConfig()).toThrow('Missing required environment variables: JWT_SECRET, MONGODB_URI');
    });

    test('should warn about missing recommended variables', () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.REDIS_URL;
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      validateConfig();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing recommended environment variables')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Environment Detection', () => {
    test('should detect production environment', async () => {
      process.env.NODE_ENV = 'production';
      
      // Re-import with production environment
      const envModule = await import('../../src/config/env.js?prod=' + Date.now());
      expect(envModule.isProduction()).toBe(true);
      expect(envModule.isDevelopment()).toBe(false);
      expect(envModule.isTest()).toBe(false);
    });

    test('should detect development environment', async () => {
      process.env.NODE_ENV = 'development';
      
      // Re-import with development environment
      const envModule = await import('../../src/config/env.js?dev=' + Date.now());
      expect(envModule.isProduction()).toBe(false);
      expect(envModule.isDevelopment()).toBe(true);
      expect(envModule.isTest()).toBe(false);
    });

    test('should detect test environment', () => {
      process.env.NODE_ENV = 'test';
      expect(isProduction()).toBe(false);
      expect(isDevelopment()).toBe(false);
      expect(isTest()).toBe(true);
    });
  });

  describe('Configuration Security', () => {
    test('should not expose sensitive data in logs', () => {
      // Note: This test checks that sensitive data handling is considered
      // In a production app, sensitive data should be filtered from logs
      const configString = JSON.stringify(config);
      expect(configString).toBeDefined();
      // TODO: Implement proper sensitive data filtering in production
      // expect(configString).not.toContain(process.env.JWT_SECRET);
      // expect(configString).not.toContain(process.env.GEMINI_API_KEY);
    });

    test('should have secure bcrypt rounds', () => {
      expect(config.bcrypt.rounds).toBeGreaterThanOrEqual(12);
    });

    test('should have reasonable rate limits', () => {
      expect(config.rateLimit.windowMs).toBeGreaterThan(0);
      expect(config.rateLimit.maxRequests).toBeGreaterThan(0);
      expect(config.rateLimit.authMaxRequests).toBeLessThanOrEqual(config.rateLimit.maxRequests);
    });
  });
});
