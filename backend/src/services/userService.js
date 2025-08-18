import User from '../models/User.js';
import UserSession from '../models/UserSession.js';
import ViewHistory from '../models/ViewHistory.js';
import encryptionUtils from '../utils/encryptionUtils.js';
import generalUtils from '../utils/generalUtils.js';
import logger from '../utils/logger.js';
import { promisify } from 'util';
import crypto from 'crypto';

const scrypt = promisify(crypto.scrypt);

/**
 * User Service - Handles user management, authentication, profiles, and activity tracking
 */
export class UserService {
  constructor() {
    this.activeSessions = new Map(); // Cache for active user sessions
    this.passwordCache = new Map(); // Cache for password verification
    this.recentActivity = new Map(); // Track recent user activity
    
    // Cleanup sessions every 30 minutes
    setInterval(() => this.cleanupSessions(), 30 * 60 * 1000);
    
    // Clear password cache every hour for security
    setInterval(() => this.passwordCache.clear(), 60 * 60 * 1000);
  }

  /**
   * Register a new user
   * @param {Object} userData - user registration data
   * @param {Object} options - registration options
   * @returns {Promise<Object>} created user
   */
  async registerUser(userData, options = {}) {
    try {
      logger.info('Registering new user:', {
        username: userData.username,
        email: userData.email
      });

      // Validate required fields
      if (!userData.username || !userData.email || !userData.password) {
        throw new Error('Username, email, and password are required');
      }

      // Validate email format
      if (!generalUtils.isValidEmail(userData.email)) {
        throw new Error('Invalid email format');
      }

      // Validate username format
      if (!this.isValidUsername(userData.username)) {
        throw new Error('Username must be 3-30 characters long and contain only letters, numbers, and underscores');
      }

      // Validate password strength
      if (!this.isStrongPassword(userData.password)) {
        throw new Error('Password must be at least 8 characters long and contain uppercase, lowercase, numbers, and special characters');
      }

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [
          { email: userData.email.toLowerCase() },
          { username: userData.username.toLowerCase() }
        ]
      });

      if (existingUser) {
        if (existingUser.email === userData.email.toLowerCase()) {
          throw new Error('Email already registered');
        }
        if (existingUser.username === userData.username.toLowerCase()) {
          throw new Error('Username already taken');
        }
      }

      // Hash password
      const hashedPassword = await encryptionUtils.hashPassword(userData.password);

      // Generate verification token
      const verificationToken = encryptionUtils.generateSecureToken();
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Prepare user data
      const newUserData = {
        username: userData.username.toLowerCase().trim(),
        email: userData.email.toLowerCase().trim(),
        password: hashedPassword,
        
        // Profile information
        firstName: userData.firstName?.trim() || '',
        lastName: userData.lastName?.trim() || '',
        displayName: userData.displayName?.trim() || userData.username,
        bio: userData.bio?.trim() || '',
        
        // Account settings
        isEmailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
        
        // Preferences
        preferences: {
          theme: 'dark',
          language: 'en',
          autoplay: true,
          notifications: {
            email: true,
            push: false,
            marketing: false
          },
          privacy: {
            profilePublic: false,
            showActivity: false,
            allowMessaging: true
          }
        },
        
        // Security
        twoFactorEnabled: false,
        lastPasswordChange: new Date(),
        
        // Status
        isActive: true,
        accountType: 'free',
        
        // Metadata
        registrationIP: options.ipAddress || '',
        userAgent: options.userAgent || '',
        referrer: options.referrer || '',
        
        // Timestamps
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const user = new User(newUserData);
      await user.save();

      // Send verification email (implement based on your email service)
      if (options.sendVerificationEmail !== false) {
        await this.sendVerificationEmail(user);
      }

      // Remove sensitive data from response
      const userResponse = this.sanitizeUserData(user);

      logger.info('User registered successfully:', {
        userId: user._id,
        username: user.username,
        email: user.email
      });

      return userResponse;

    } catch (error) {
      logger.error('User registration failed:', {
        username: userData.username,
        email: userData.email,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Authenticate user login
   * @param {String} identifier - username or email
   * @param {String} password - user password
   * @param {Object} options - login options
   * @returns {Promise<Object>} authentication result
   */
  async authenticateUser(identifier, password, options = {}) {
    try {
      logger.info('User authentication attempt:', {
        identifier,
        ipAddress: options.ipAddress
      });

      if (!identifier || !password) {
        throw new Error('Username/email and password are required');
      }

      // Find user by username or email
      const user = await User.findOne({
        $or: [
          { email: identifier.toLowerCase() },
          { username: identifier.toLowerCase() }
        ],
        isActive: true
      }).select('+password +emailVerificationToken +twoFactorSecret');

      if (!user) {
        // Prevent user enumeration by using consistent timing
        await encryptionUtils.hashPassword('dummy-password');
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isValidPassword = await encryptionUtils.verifyPassword(password, user.password);
      if (!isValidPassword) {
        await this.logFailedLogin(user._id, options);
        throw new Error('Invalid credentials');
      }

      // Check if account is locked
      if (user.lockoutUntil && user.lockoutUntil > new Date()) {
        throw new Error('Account temporarily locked due to too many failed login attempts');
      }

      // Check email verification if required
      if (!user.isEmailVerified && options.requireEmailVerification) {
        throw new Error('Please verify your email address before logging in');
      }

      // Check 2FA if enabled
      if (user.twoFactorEnabled && !options.twoFactorToken) {
        return {
          requiresTwoFactor: true,
          userId: user._id,
          message: 'Two-factor authentication required'
        };
      }

      if (user.twoFactorEnabled && options.twoFactorToken) {
        const isValidToken = await this.verifyTwoFactorToken(user, options.twoFactorToken);
        if (!isValidToken) {
          throw new Error('Invalid two-factor authentication token');
        }
      }

      // Update last login
      await User.findByIdAndUpdate(user._id, {
        lastLoginAt: new Date(),
        loginCount: (user.loginCount || 0) + 1,
        lastLoginIP: options.ipAddress || '',
        failedLoginAttempts: 0,
        lockoutUntil: null
      });

      // Create session
      const session = await this.createUserSession(user, options);

      // Remove sensitive data
      const userResponse = this.sanitizeUserData(user);

      logger.info('User authenticated successfully:', {
        userId: user._id,
        username: user.username,
        sessionId: session.sessionId
      });

      return {
        user: userResponse,
        session,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken
      };

    } catch (error) {
      logger.error('User authentication failed:', {
        identifier,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update user profile
   * @param {String} userId - user ID
   * @param {Object} updates - profile updates
   * @param {Object} options - update options
   * @returns {Promise<Object>} updated user
   */
  async updateUserProfile(userId, updates, options = {}) {
    try {
      logger.info('Updating user profile:', {
        userId,
        updates: Object.keys(updates)
      });

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate and sanitize updates
      const allowedUpdates = [
        'firstName', 'lastName', 'displayName', 'bio', 'avatar',
        'preferences', 'timezone', 'language'
      ];

      const sanitizedUpdates = {};
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key)) {
          if (key === 'displayName' && value) {
            sanitizedUpdates[key] = value.trim().substring(0, 50);
          } else if (key === 'bio' && value) {
            sanitizedUpdates[key] = value.trim().substring(0, 500);
          } else if (key === 'preferences' && typeof value === 'object') {
            // Merge with existing preferences
            sanitizedUpdates[key] = {
              ...user.preferences,
              ...value
            };
          } else {
            sanitizedUpdates[key] = value;
          }
        }
      }

      sanitizedUpdates.updatedAt = new Date();

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        sanitizedUpdates,
        { new: true, runValidators: true }
      );

      const userResponse = this.sanitizeUserData(updatedUser);

      logger.info('User profile updated successfully:', {
        userId,
        updatedFields: Object.keys(sanitizedUpdates)
      });

      return userResponse;

    } catch (error) {
      logger.error('User profile update failed:', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Change user password
   * @param {String} userId - user ID
   * @param {String} currentPassword - current password
   * @param {String} newPassword - new password
   * @returns {Promise<Boolean>} success status
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      logger.info('Password change request:', { userId });

      const user = await User.findById(userId).select('+password');
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isValidPassword = await encryptionUtils.verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
        throw new Error('Current password is incorrect');
      }

      // Validate new password
      if (!this.isStrongPassword(newPassword)) {
        throw new Error('New password does not meet security requirements');
      }

      // Check if new password is different from current
      const isSamePassword = await encryptionUtils.verifyPassword(newPassword, user.password);
      if (isSamePassword) {
        throw new Error('New password must be different from current password');
      }

      // Hash new password
      const hashedPassword = await encryptionUtils.hashPassword(newPassword);

      // Update password
      await User.findByIdAndUpdate(userId, {
        password: hashedPassword,
        lastPasswordChange: new Date(),
        updatedAt: new Date()
      });

      // Invalidate all user sessions except current one
      await this.invalidateUserSessions(userId, { excludeCurrent: true });

      logger.info('Password changed successfully:', { userId });

      return true;

    } catch (error) {
      logger.error('Password change failed:', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Track video view history
   * @param {String} userId - user ID
   * @param {String} videoId - video ID
   * @param {Object} viewData - view tracking data
   * @returns {Promise<Object>} view history record
   */
  async trackVideoView(userId, videoId, viewData) {
    try {
      const {
        watchTime = 0,
        totalDuration = 0,
        lastPosition = 0,
        completed = false,
        quality = 'auto',
        deviceType = 'unknown',
        sessionId = null
      } = viewData;

      // Check for existing view record for this session
      let viewRecord = await ViewHistory.findOne({
        user: userId,
        video: videoId,
        sessionId: sessionId
      });

      if (viewRecord) {
        // Update existing record
        viewRecord.watchTime = Math.max(viewRecord.watchTime, watchTime);
        viewRecord.lastPosition = lastPosition;
        viewRecord.completed = completed || viewRecord.completed;
        viewRecord.completionPercentage = Math.max(
          viewRecord.completionPercentage,
          totalDuration > 0 ? (watchTime / totalDuration) * 100 : 0
        );
        viewRecord.lastWatchedAt = new Date();
        viewRecord.updatedAt = new Date();

        await viewRecord.save();
      } else {
        // Create new view record
        const viewHistoryData = {
          user: userId,
          video: videoId,
          sessionId,
          watchTime,
          totalDuration,
          lastPosition,
          completed,
          completionPercentage: totalDuration > 0 ? (watchTime / totalDuration) * 100 : 0,
          quality,
          deviceType,
          firstWatchedAt: new Date(),
          lastWatchedAt: new Date(),
          viewCount: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        viewRecord = new ViewHistory(viewHistoryData);
        await viewRecord.save();
      }

      // Update user's recent activity
      this.updateRecentActivity(userId, 'video_watch', {
        videoId,
        watchTime,
        lastPosition
      });

      return viewRecord;

    } catch (error) {
      logger.error('Video view tracking failed:', {
        userId,
        videoId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's video watch history
   * @param {String} userId - user ID
   * @param {Object} options - query options
   * @returns {Promise<Object>} watch history with pagination
   */
  async getUserWatchHistory(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = '-lastWatchedAt',
        includeCompleted = true,
        includeIncomplete = true
      } = options;

      // Build filter
      const filter = { user: userId };
      
      if (!includeCompleted || !includeIncomplete) {
        if (includeCompleted && !includeIncomplete) {
          filter.completed = true;
        } else if (!includeCompleted && includeIncomplete) {
          filter.completed = false;
        }
      }

      // Execute query with pagination
      const skip = (page - 1) * limit;
      
      const [history, total] = await Promise.all([
        ViewHistory.find(filter)
          .populate('video', 'title duration thumbnail')
          .sort(sortBy)
          .skip(skip)
          .limit(limit)
          .lean(),
        ViewHistory.countDocuments(filter)
      ]);

      // Add formatted fields
      const formattedHistory = history.map(record => ({
        ...record,
        formattedWatchTime: generalUtils.formatDuration(record.watchTime),
        formattedLastPosition: generalUtils.formatDuration(record.lastPosition),
        formattedTotalDuration: generalUtils.formatDuration(record.totalDuration),
        watchProgress: record.totalDuration > 0 ? 
          Math.round((record.watchTime / record.totalDuration) * 100) : 0
      }));

      return {
        history: formattedHistory,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      };

    } catch (error) {
      logger.error('Watch history retrieval failed:', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user statistics and analytics
   * @param {String} userId - user ID
   * @returns {Promise<Object>} user statistics
   */
  async getUserStatistics(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get watch statistics
      const watchStats = await ViewHistory.aggregate([
        { $match: { user: user._id } },
        {
          $group: {
            _id: null,
            totalWatchTime: { $sum: '$watchTime' },
            totalVideos: { $sum: 1 },
            completedVideos: {
              $sum: { $cond: [{ $eq: ['$completed', true] }, 1, 0] }
            },
            averageCompletion: { $avg: '$completionPercentage' }
          }
        }
      ]);

      const stats = watchStats[0] || {
        totalWatchTime: 0,
        totalVideos: 0,
        completedVideos: 0,
        averageCompletion: 0
      };

      // Get recent activity
      const recentViews = await ViewHistory.find({ user: userId })
        .sort('-lastWatchedAt')
        .limit(10)
        .populate('video', 'title thumbnail')
        .lean();

      // Calculate streaks and achievements
      const achievements = await this.calculateUserAchievements(userId, stats);

      return {
        userId,
        profile: {
          username: user.username,
          displayName: user.displayName,
          joinedAt: user.createdAt,
          lastActive: user.lastLoginAt
        },
        watchStats: {
          totalWatchTime: stats.totalWatchTime,
          formattedWatchTime: generalUtils.formatDuration(stats.totalWatchTime),
          totalVideos: stats.totalVideos,
          completedVideos: stats.completedVideos,
          completionRate: stats.totalVideos > 0 ? 
            Math.round((stats.completedVideos / stats.totalVideos) * 100) : 0,
          averageCompletion: Math.round(stats.averageCompletion)
        },
        recentActivity: recentViews.map(view => ({
          videoId: view.video._id,
          title: view.video.title,
          thumbnail: view.video.thumbnail,
          lastWatched: view.lastWatchedAt,
          progress: view.completionPercentage
        })),
        achievements
      };

    } catch (error) {
      logger.error('User statistics retrieval failed:', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create user session
   * @param {Object} user - user object
   * @param {Object} options - session options
   * @returns {Promise<Object>} session data
   */
  async createUserSession(user, options = {}) {
    try {
      const sessionId = generalUtils.generateUUID();
      const accessToken = encryptionUtils.generateSecureToken();
      const refreshToken = encryptionUtils.generateSecureToken();

      const sessionData = {
        sessionId,
        user: user._id,
        accessToken,
        refreshToken,
        
        // Session metadata
        ipAddress: options.ipAddress || '',
        userAgent: options.userAgent || '',
        deviceType: options.deviceType || 'unknown',
        
        // Timestamps
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      };

      const session = new UserSession(sessionData);
      await session.save();

      // Cache session
      this.activeSessions.set(sessionId, {
        ...sessionData,
        userId: user._id.toString()
      });

      return {
        sessionId,
        accessToken,
        refreshToken,
        expiresAt: sessionData.expiresAt
      };

    } catch (error) {
      logger.error('Session creation failed:', {
        userId: user._id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate user session
   * @param {String} sessionId - session ID
   * @param {String} accessToken - access token
   * @returns {Promise<Object>} session validation result
   */
  async validateSession(sessionId, accessToken) {
    try {
      // Check cache first
      let session = this.activeSessions.get(sessionId);

      if (!session) {
        // Check database
        const dbSession = await UserSession.findOne({
          sessionId,
          accessToken,
          expiresAt: { $gt: new Date() }
        }).populate('user');

        if (!dbSession) {
          return { valid: false, reason: 'Session not found or expired' };
        }

        session = dbSession;
        
        // Cache the session
        this.activeSessions.set(sessionId, {
          sessionId: dbSession.sessionId,
          userId: dbSession.user._id.toString(),
          accessToken: dbSession.accessToken,
          refreshToken: dbSession.refreshToken,
          expiresAt: dbSession.expiresAt
        });
      }

      // Validate access token
      if (session.accessToken !== accessToken) {
        return { valid: false, reason: 'Invalid access token' };
      }

      // Check expiration
      if (new Date() > session.expiresAt) {
        await this.invalidateSession(sessionId);
        return { valid: false, reason: 'Session expired' };
      }

      // Update last activity
      await this.updateSessionActivity(sessionId);

      return {
        valid: true,
        userId: session.userId,
        sessionId
      };

    } catch (error) {
      logger.error('Session validation failed:', {
        sessionId,
        error: error.message
      });
      return { valid: false, reason: 'Validation error' };
    }
  }

  /**
   * Invalidate user session
   * @param {String} sessionId - session ID
   * @returns {Promise<Boolean>} success status
   */
  async invalidateSession(sessionId) {
    try {
      await UserSession.findOneAndDelete({ sessionId });
      this.activeSessions.delete(sessionId);
      
      logger.info('Session invalidated:', { sessionId });
      return true;

    } catch (error) {
      logger.error('Session invalidation failed:', {
        sessionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Invalidate all user sessions
   * @param {String} userId - user ID
   * @param {Object} options - invalidation options
   * @returns {Promise<Number>} number of sessions invalidated
   */
  async invalidateUserSessions(userId, options = {}) {
    try {
      const filter = { user: userId };
      
      if (options.excludeCurrent && options.currentSessionId) {
        filter.sessionId = { $ne: options.currentSessionId };
      }

      const result = await UserSession.deleteMany(filter);

      // Remove from cache
      for (const [sessionId, session] of this.activeSessions) {
        if (session.userId === userId) {
          if (!options.excludeCurrent || sessionId !== options.currentSessionId) {
            this.activeSessions.delete(sessionId);
          }
        }
      }

      logger.info('User sessions invalidated:', {
        userId,
        count: result.deletedCount
      });

      return result.deletedCount;

    } catch (error) {
      logger.error('User session invalidation failed:', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update session activity timestamp
   * @param {String} sessionId - session ID
   */
  async updateSessionActivity(sessionId) {
    try {
      await UserSession.findOneAndUpdate(
        { sessionId },
        { lastActivity: new Date() }
      );

      // Update cache
      const cachedSession = this.activeSessions.get(sessionId);
      if (cachedSession) {
        cachedSession.lastActivity = new Date();
      }

    } catch (error) {
      logger.error('Session activity update failed:', {
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * Update user's recent activity
   * @param {String} userId - user ID
   * @param {String} activityType - type of activity
   * @param {Object} activityData - activity data
   */
  updateRecentActivity(userId, activityType, activityData) {
    const activity = {
      type: activityType,
      data: activityData,
      timestamp: new Date()
    };

    let userActivities = this.recentActivity.get(userId) || [];
    userActivities.unshift(activity);

    // Keep only last 20 activities
    if (userActivities.length > 20) {
      userActivities = userActivities.slice(0, 20);
    }

    this.recentActivity.set(userId, userActivities);
  }

  /**
   * Send email verification
   * @param {Object} user - user object
   * @returns {Promise<Boolean>} success status
   */
  async sendVerificationEmail(user) {
    try {
      // TODO: Implement email sending logic
      logger.info('Email verification sent:', {
        userId: user._id,
        email: user.email
      });
      return true;

    } catch (error) {
      logger.error('Email verification send failed:', {
        userId: user._id,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Verify email address
   * @param {String} token - verification token
   * @returns {Promise<Object>} verification result
   */
  async verifyEmail(token) {
    try {
      const user = await User.findOne({
        emailVerificationToken: token,
        emailVerificationExpires: { $gt: new Date() }
      });

      if (!user) {
        throw new Error('Invalid or expired verification token');
      }

      await User.findByIdAndUpdate(user._id, {
        isEmailVerified: true,
        emailVerificationToken: undefined,
        emailVerificationExpires: undefined,
        updatedAt: new Date()
      });

      logger.info('Email verified successfully:', {
        userId: user._id,
        email: user.email
      });

      return { success: true, userId: user._id };

    } catch (error) {
      logger.error('Email verification failed:', {
        token,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate user achievements
   * @param {String} userId - user ID
   * @param {Object} stats - user statistics
   * @returns {Promise<Array>} achievements
   */
  async calculateUserAchievements(userId, stats) {
    const achievements = [];

    // Watch time achievements
    if (stats.totalWatchTime >= 3600) { // 1 hour
      achievements.push({
        id: 'first_hour',
        title: 'First Hour',
        description: 'Watched 1 hour of content',
        unlockedAt: new Date()
      });
    }

    if (stats.totalWatchTime >= 36000) { // 10 hours
      achievements.push({
        id: 'binge_watcher',
        title: 'Binge Watcher',
        description: 'Watched 10 hours of content',
        unlockedAt: new Date()
      });
    }

    // Completion achievements
    if (stats.completedVideos >= 1) {
      achievements.push({
        id: 'completionist',
        title: 'Completionist',
        description: 'Completed your first video',
        unlockedAt: new Date()
      });
    }

    if (stats.completedVideos >= 10) {
      achievements.push({
        id: 'dedicated_viewer',
        title: 'Dedicated Viewer',
        description: 'Completed 10 videos',
        unlockedAt: new Date()
      });
    }

    return achievements;
  }

  /**
   * Log failed login attempt
   * @param {String} userId - user ID
   * @param {Object} options - login context
   */
  async logFailedLogin(userId, options) {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      const failedAttempts = (user.failedLoginAttempts || 0) + 1;
      const updateData = {
        failedLoginAttempts: failedAttempts,
        lastFailedLogin: new Date()
      };

      // Lock account after 5 failed attempts
      if (failedAttempts >= 5) {
        updateData.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      }

      await User.findByIdAndUpdate(userId, updateData);

    } catch (error) {
      logger.error('Failed login logging failed:', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Verify two-factor authentication token
   * @param {Object} user - user object
   * @param {String} token - 2FA token
   * @returns {Promise<Boolean>} token validity
   */
  async verifyTwoFactorToken(user, token) {
    // TODO: Implement 2FA token verification
    // This would typically use a library like 'otplib' or 'speakeasy'
    return true;
  }

  /**
   * Validate username format
   * @param {String} username - username to validate
   * @returns {Boolean} is valid
   */
  isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,30}$/.test(username);
  }

  /**
   * Validate password strength
   * @param {String} password - password to validate
   * @returns {Boolean} is strong
   */
  isStrongPassword(password) {
    if (password.length < 8) return false;
    
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    return hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
  }

  /**
   * Remove sensitive data from user object
   * @param {Object} user - user object
   * @returns {Object} sanitized user data
   */
  sanitizeUserData(user) {
    const userObj = user.toObject ? user.toObject() : user;
    
    // Remove sensitive fields
    delete userObj.password;
    delete userObj.emailVerificationToken;
    delete userObj.twoFactorSecret;
    delete userObj.failedLoginAttempts;
    delete userObj.lockoutUntil;
    
    return userObj;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupSessions() {
    try {
      // Remove expired sessions from database
      const result = await UserSession.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      // Clean up cache
      for (const [sessionId, session] of this.activeSessions) {
        if (new Date() > session.expiresAt) {
          this.activeSessions.delete(sessionId);
        }
      }

      if (result.deletedCount > 0) {
        logger.info('Cleaned up expired sessions:', {
          count: result.deletedCount
        });
      }

    } catch (error) {
      logger.error('Session cleanup failed:', error);
    }
  }

  /**
   * Get service statistics
   * @returns {Object} service statistics
   */
  getServiceStats() {
    return {
      activeSessions: this.activeSessions.size,
      passwordCacheSize: this.passwordCache.size,
      recentActivityTracked: this.recentActivity.size
    };
  }
}

// Create singleton instance
const userService = new UserService();

export default userService;
