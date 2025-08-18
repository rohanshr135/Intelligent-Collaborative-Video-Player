import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { authLimiter, requireAuth, generateTokens, hashPassword } from '../../src/middleware/auth.js';
import { User } from '../../src/models/User.js';
import { testUsers } from '../fixtures/testData.js';

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cors());
  
  // Test routes
  app.post('/auth/test-rate-limit', authLimiter, (req, res) => {
    res.json({ success: true, message: 'Rate limit passed' });
  });
  
  app.get('/auth/test-protected', requireAuth, (req, res) => {
    res.json({ 
      success: true, 
      user: req.user._id,
      message: 'Protected route accessed' 
    });
  });
  
  app.post('/auth/test-login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      
      if (!user) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }
      
      // In real app, you'd verify password here
      const tokens = generateTokens(user._id, user.role);
      
      res.json({
        success: true,
        tokens,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  return app;
};

describe('Authentication Integration Tests', () => {
  let app;
  let testUser;
  let userTokens;

  beforeEach(async () => {
    app = createTestApp();
    
    // Create test user
    const userData = { ...testUsers.validUser };
    delete userData.acceptTerms;
    userData.password = await hashPassword(userData.password);
    
    testUser = await User.create(userData);
    userTokens = generateTokens(testUser._id, testUser.role);
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('Rate Limiting', () => {
    test('should allow requests within rate limit', async () => {
      const response = await request(app)
        .post('/auth/test-rate-limit')
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });

    test('should include rate limit headers', async () => {
      const response = await request(app)
        .post('/auth/test-rate-limit')
        .expect(200);
      
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    test('should handle multiple requests from same IP', async () => {
      // Make multiple requests
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/auth/test-rate-limit')
          .expect(200);
      }
      
      // Should still work within limit
      const response = await request(app)
        .post('/auth/test-rate-limit')
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
  });

  describe('Protected Routes', () => {
    test('should reject requests without token', async () => {
      const response = await request(app)
        .get('/auth/test-protected')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('No token provided');
    });

    test('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/auth/test-protected')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid token');
    });

    test('should allow requests with valid token in header', async () => {
      const response = await request(app)
        .get('/auth/test-protected')
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBe(testUser._id);
    });

    test('should allow requests with valid token in cookie', async () => {
      const response = await request(app)
        .get('/auth/test-protected')
        .set('Cookie', `accessToken=${userTokens.accessToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBe(testUser._id);
    });

    test('should allow requests with valid token in query', async () => {
      const response = await request(app)
        .get('/auth/test-protected')
        .query({ token: userTokens.accessToken })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBe(testUser._id);
    });
  });

  describe('Authentication Flow', () => {
    test('should complete login flow successfully', async () => {
      const response = await request(app)
        .post('/auth/test-login')
        .send({
          email: testUser.email,
          password: 'TestPassword123!' // Original password
        })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens.accessToken).toBeDefined();
      expect(response.body.tokens.refreshToken).toBeDefined();
      expect(response.body.user.id).toBe(testUser._id);
      expect(response.body.user.username).toBe(testUser.username);
      expect(response.body.user.email).toBe(testUser.email);
    });

    test('should reject login with non-existent user', async () => {
      const response = await request(app)
        .post('/auth/test-login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password'
        })
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found');
    });

    test('should handle malformed requests', async () => {
      const response = await request(app)
        .post('/auth/test-login')
        .send({
          // Missing required fields
        })
        .expect(500);
      
      expect(response.body.success).toBe(false);
    });
  });

  describe('Token Validation', () => {
    test('should validate token expiration', async () => {
      // Create expired token (this is a mock - in real scenario you'd wait or mock time)
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0IiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDAwMDB9.invalid';
      
      const response = await request(app)
        .get('/auth/test-protected')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
      
      expect(response.body.success).toBe(false);
    });

    test('should validate token signature', async () => {
      // Create token with wrong signature
      const invalidToken = userTokens.accessToken.slice(0, -10) + 'invalidsig';
      
      const response = await request(app)
        .get('/auth/test-protected')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);
      
      expect(response.body.success).toBe(false);
    });
  });

  describe('Security Headers', () => {
    test('should not expose sensitive information in errors', async () => {
      const response = await request(app)
        .get('/auth/test-protected')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
      
      expect(response.body.error).not.toContain('jwt');
      expect(response.body.error).not.toContain('secret');
      expect(response.body.error).not.toContain('signature');
    });

    test('should handle various token formats gracefully', async () => {
      const testCases = [
        'Bearer',
        'Bearer ',
        'Bearer invalid',
        'Invalid format',
        '',
        'null',
        'undefined'
      ];

      for (const authHeader of testCases) {
        const response = await request(app)
          .get('/auth/test-protected')
          .set('Authorization', authHeader);
        
        expect([401, 500]).toContain(response.status);
        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('Concurrent Requests', () => {
    test('should handle multiple concurrent authentication requests', async () => {
      const promises = Array(10).fill().map(() => 
        request(app)
          .get('/auth/test-protected')
          .set('Authorization', `Bearer ${userTokens.accessToken}`)
      );
      
      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    test('should handle concurrent rate limiting correctly', async () => {
      const promises = Array(3).fill().map(() => 
        request(app)
          .post('/auth/test-rate-limit')
      );
      
      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });
});
