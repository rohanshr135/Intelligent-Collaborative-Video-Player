import { jest } from '@jest/globals';

// Global test setup

beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.CORS_ORIGIN = 'http://localhost:3000';
});

afterAll(async () => {
  // Cleanup - minimal for tests
  try {
    // Any cleanup code can go here
  } catch (error) {
    // Ignore cleanup errors in test environment
    console.warn('Test cleanup warning:', error.message);
  }
});

beforeEach(async () => {
  // Reset any test state before each test
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  warn: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
};
