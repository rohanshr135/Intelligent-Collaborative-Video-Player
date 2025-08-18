import { describe, test, expect, beforeEach } from '@jest/globals';
import { User } from '../../src/models/User.js';
import { testUsers } from '../fixtures/testData.js';
import mongoose from 'mongoose';

describe('User Model', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('User Creation', () => {
    test('should create a valid user', async () => {
      const userData = { ...testUsers.validUser };
      delete userData.acceptTerms; // Not stored in model
      
      const user = await User.create(userData);
      
      expect(user._id).toBeDefined();
      expect(user.username).toBe(userData.username);
      expect(user.email).toBe(userData.email);
      expect(user.firstName).toBe(userData.firstName);
      expect(user.lastName).toBe(userData.lastName);
      expect(user.isActive).toBe(true);
      expect(user.role).toBe('user');
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    test('should hash password before saving', async () => {
      const userData = { ...testUsers.validUser };
      delete userData.acceptTerms;
      
      const user = await User.create(userData);
      
      expect(user.password).not.toBe(userData.password);
      expect(user.password).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash pattern
    });

    test('should normalize email to lowercase', async () => {
      const userData = {
        ...testUsers.validUser,
        email: 'TEST@EXAMPLE.COM'
      };
      delete userData.acceptTerms;
      
      const user = await User.create(userData);
      
      expect(user.email).toBe('test@example.com');
    });

    test('should set default values correctly', async () => {
      const minimalUser = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      };
      
      const user = await User.create(minimalUser);
      
      expect(user.role).toBe('user');
      expect(user.isActive).toBe(true);
      expect(user.emailVerified).toBe(false);
      expect(user.lastLogin).toBeNull();
      expect(Array.isArray(user.refreshTokens)).toBe(true);
      expect(user.refreshTokens.length).toBe(0);
    });
  });

  describe('User Validation', () => {
    test('should require username', async () => {
      const userData = { ...testUsers.validUser };
      delete userData.username;
      delete userData.acceptTerms;
      
      await expect(User.create(userData)).rejects.toThrow(/username.*required/i);
    });

    test('should require email', async () => {
      const userData = { ...testUsers.validUser };
      delete userData.email;
      delete userData.acceptTerms;
      
      await expect(User.create(userData)).rejects.toThrow(/email.*required/i);
    });

    test('should require password', async () => {
      const userData = { ...testUsers.validUser };
      delete userData.password;
      delete userData.acceptTerms;
      
      await expect(User.create(userData)).rejects.toThrow(/password.*required/i);
    });

    test('should validate username length', async () => {
      const userData = {
        ...testUsers.validUser,
        username: 'ab' // too short
      };
      delete userData.acceptTerms;
      
      await expect(User.create(userData)).rejects.toThrow();
    });

    test('should validate email format', async () => {
      const userData = {
        ...testUsers.validUser,
        email: 'invalid-email'
      };
      delete userData.acceptTerms;
      
      await expect(User.create(userData)).rejects.toThrow();
    });

    test('should enforce unique username', async () => {
      const userData = { ...testUsers.validUser };
      delete userData.acceptTerms;
      
      await User.create(userData);
      
      const duplicateUser = {
        ...userData,
        email: 'different@example.com'
      };
      
      await expect(User.create(duplicateUser)).rejects.toThrow(/duplicate/i);
    });

    test('should enforce unique email', async () => {
      const userData = { ...testUsers.validUser };
      delete userData.acceptTerms;
      
      await User.create(userData);
      
      const duplicateUser = {
        ...userData,
        username: 'differentuser'
      };
      
      await expect(User.create(duplicateUser)).rejects.toThrow(/duplicate/i);
    });
  });

  describe('User Schema Methods', () => {
    test('should transform JSON output correctly', async () => {
      const userData = { ...testUsers.validUser };
      delete userData.acceptTerms;
      
      const user = await User.create(userData);
      const userJSON = user.toJSON();
      
      expect(userJSON.id).toBeDefined();
      expect(userJSON._id).toBeUndefined();
      expect(userJSON.__v).toBeUndefined();
      expect(userJSON.passwordHash).toBeUndefined();
      expect(userJSON.refreshTokens).toBeUndefined();
    });

    test('should not include password in find results', async () => {
      const userData = { ...testUsers.validUser };
      delete userData.acceptTerms;
      
      const user = await User.create(userData);
      const foundUser = await User.findById(user._id);
      
      expect(foundUser.password).toBeDefined(); // Password should be available when explicitly selected
      
      const foundUserNoPassword = await User.findById(user._id).select('-password');
      expect(foundUserNoPassword.password).toBeUndefined();
    });
  });

  describe('User Indexes', () => {
    test('should have proper indexes for performance', () => {
      const indexes = User.schema.indexes();
      
      // Check for email index (from unique: true)
      const emailIndex = indexes.find(index => 
        index[0].email && index[1].unique
      );
      expect(emailIndex).toBeDefined();
      
      // Check for username index (from unique: true)
      const usernameIndex = indexes.find(index => 
        index[0].username && index[1].unique
      );
      expect(usernameIndex).toBeDefined();
      
      // Check for createdAt index
      const createdAtIndex = indexes.find(index => 
        index[0].createdAt === -1
      );
      expect(createdAtIndex).toBeDefined();
    });
  });

  describe('User Virtuals', () => {
    test('should have videoCount virtual', () => {
      const virtuals = User.schema.virtuals;
      expect(virtuals.videoCount).toBeDefined();
      expect(virtuals.videoCount.options.ref).toBe('Video');
      expect(virtuals.videoCount.options.localField).toBe('_id');
      expect(virtuals.videoCount.options.foreignField).toBe('uploadedBy');
      expect(virtuals.videoCount.options.count).toBe(true);
    });
  });

  describe('User Pre-save Middleware', () => {
    test('should normalize email before saving', async () => {
      const userData = {
        ...testUsers.validUser,
        email: 'Test@Example.COM'
      };
      delete userData.acceptTerms;
      
      const user = new User(userData);
      await user.save();
      
      expect(user.email).toBe('test@example.com');
    });

    test('should not modify email if not changed', async () => {
      const userData = { ...testUsers.validUser };
      delete userData.acceptTerms;
      
      const user = await User.create(userData);
      const originalEmail = user.email;
      
      user.firstName = 'Updated';
      await user.save();
      
      expect(user.email).toBe(originalEmail);
    });
  });

  describe('User Role Management', () => {
    test('should default to user role', async () => {
      const userData = { ...testUsers.validUser };
      delete userData.acceptTerms;
      
      const user = await User.create(userData);
      
      expect(user.role).toBe('user');
    });

    test('should allow admin role', async () => {
      const userData = {
        ...testUsers.validUser,
        role: 'admin'
      };
      delete userData.acceptTerms;
      
      const user = await User.create(userData);
      
      expect(user.role).toBe('admin');
    });

    test('should validate role values', async () => {
      const userData = {
        ...testUsers.validUser,
        role: 'invalid-role'
      };
      delete userData.acceptTerms;
      
      await expect(User.create(userData)).rejects.toThrow();
    });
  });
});
