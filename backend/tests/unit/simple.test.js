import { describe, test, expect } from '@jest/globals';
import { config } from '../../src/config/env.js';

describe('Simple Setup Test', () => {
  test('should have test environment configured', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.JWT_SECRET.length).toBeGreaterThan(0);
  });

  test('should load configuration', () => {
    expect(config).toBeDefined();
    expect(config.jwt).toBeDefined();
    expect(config.jwt.secret).toBeDefined();
  });

  test('should perform basic JavaScript operations', () => {
    const result = 2 + 2;
    expect(result).toBe(4);
  });
});
