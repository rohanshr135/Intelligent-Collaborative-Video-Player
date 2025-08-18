import BranchingVideo from '../models/BranchingVideo.js';
import UserChoice from '../models/UserChoice.js';
import generalUtils from '../utils/generalUtils.js';
import logger from '../utils/logger.js';
import { EventEmitter } from 'events';

/**
 * Branching Service - Manages interactive branching video content
 * Handles decision points, user choices, narrative paths, and story progression
 */
export class BranchingService extends EventEmitter {
  constructor() {
    super();
    this.activeBranches = new Map(); // Cache for active branching videos
    this.userSessions = new Map(); // Track user progress through branches
    this.analytics = new Map(); // Analytics for decision points
    
    // Cleanup sessions every 30 minutes
    setInterval(() => this.cleanupSessions(), 30 * 60 * 1000);
  }

  /**
   * Create a new branching video structure
   * @param {String} videoId - parent video ID
   * @param {Object} branchStructure - branching definition
   * @param {String} userId - creator user ID
   * @param {Object} options - additional options
   * @returns {Promise<Object>} created branching video
   */
  async createBranching(videoId, branchStructure, userId, options = {}) {
    try {
      logger.info('Creating branching video:', {
        videoId,
        userId,
        decisionPoints: branchStructure.decisionPoints?.length || 0
      });

      // Validate branching structure
      this.validateBranchStructure(branchStructure);

      const branchingId = generalUtils.generateUUID();

      // Prepare branching data
      const branchingData = {
        _id: branchingId,
        parentVideo: videoId,
        title: options.title || `Branching Story - ${Date.now()}`,
        description: options.description || '',
        createdBy: userId,
        
        // Branching structure
        branchStructure: this.normalizeBranchStructure(branchStructure),
        
        // Metadata
        version: 1,
        totalDecisionPoints: branchStructure.decisionPoints?.length || 0,
        totalPaths: this.calculateTotalPaths(branchStructure),
        estimatedDuration: this.calculateEstimatedDuration(branchStructure),
        
        // Settings
        allowRestart: options.allowRestart !== false,
        showProgress: options.showProgress !== false,
        trackChoices: options.trackChoices !== false,
        requireCompletion: options.requireCompletion || false,
        
        // Access control
        isPublic: options.isPublic || false,
        requireAuth: options.requireAuth !== false,
        
        // Status
        isPublished: false,
        isDraft: true,
        
        // Analytics
        totalViews: 0,
        totalCompletions: 0,
        averageCompletionTime: 0,
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const branchingVideo = new BranchingVideo(branchingData);
      await branchingVideo.save();

      // Cache the branching video
      this.activeBranches.set(branchingId, branchingVideo);

      // Initialize analytics for decision points
      this.initializeAnalytics(branchingId, branchStructure);

      logger.info('Branching video created successfully:', {
        branchingId,
        videoId,
        totalDecisionPoints: branchingData.totalDecisionPoints,
        totalPaths: branchingData.totalPaths
      });

      return branchingVideo;

    } catch (error) {
      logger.error('Branching video creation failed:', {
        videoId,
        userId,
        error: error.message
      });
      throw new Error(`Failed to create branching video: ${error.message}`);
    }
  }

  /**
   * Start a branching session for a user
   * @param {String} branchingId - branching video ID
   * @param {String} userId - user ID
   * @param {String} sessionId - sync session ID (optional)
   * @param {Object} options - session options
   * @returns {Promise<Object>} session data
   */
  async startBranchingSession(branchingId, userId, sessionId = null, options = {}) {
    try {
      logger.info('Starting branching session:', {
        branchingId,
        userId,
        sessionId
      });

      // Get branching video
      const branchingVideo = await this.getBranching(branchingId);
      if (!branchingVideo) {
        throw new Error('Branching video not found');
      }

      if (!branchingVideo.isPublished && branchingVideo.createdBy.toString() !== userId) {
        throw new Error('Access denied to unpublished branching video');
      }

      // Create session tracking
      const userSessionId = generalUtils.generateUUID();
      const sessionData = {
        sessionId: userSessionId,
        branchingId,
        userId,
        syncSessionId: sessionId,
        
        // Progress tracking
        currentPath: 'main',
        visitedDecisionPoints: [],
        choiceHistory: [],
        currentTimestamp: 0,
        
        // Path state
        availablePaths: ['main'],
        completedPaths: [],
        totalChoicesMade: 0,
        
        // Session metadata
        startedAt: new Date(),
        lastActivity: new Date(),
        deviceInfo: options.deviceInfo || {},
        
        // Status
        isActive: true,
        isCompleted: false,
        completionPercentage: 0
      };

      // Store session
      this.userSessions.set(userSessionId, sessionData);

      // Update analytics
      await this.updateBranchingAnalytics(branchingId, 'session_started');

      // Emit session start event
      this.emit('session-started', {
        sessionId: userSessionId,
        branchingId,
        userId,
        branchingVideo
      });

      logger.info('Branching session started:', {
        userSessionId,
        branchingId,
        userId
      });

      return {
        sessionId: userSessionId,
        branchingVideo,
        sessionData,
        nextDecisionPoint: this.getNextDecisionPoint(branchingVideo.branchStructure, sessionData)
      };

    } catch (error) {
      logger.error('Branching session start failed:', {
        branchingId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Record a user choice at a decision point
   * @param {String} userSessionId - user session ID
   * @param {String} decisionPointId - decision point ID
   * @param {String} choiceMade - choice identifier
   * @param {Object} context - additional context
   * @returns {Promise<Object>} choice result and next state
   */
  async recordUserChoice(userSessionId, decisionPointId, choiceMade, context = {}) {
    try {
      logger.info('Recording user choice:', {
        userSessionId,
        decisionPointId,
        choiceMade
      });

      // Get user session
      const sessionData = this.userSessions.get(userSessionId);
      if (!sessionData || !sessionData.isActive) {
        throw new Error('Session not found or inactive');
      }

      // Get branching video
      const branchingVideo = await this.getBranching(sessionData.branchingId);
      if (!branchingVideo) {
        throw new Error('Branching video not found');
      }

      // Find decision point in structure
      const decisionPoint = this.findDecisionPoint(
        branchingVideo.branchStructure,
        decisionPointId
      );

      if (!decisionPoint) {
        throw new Error('Decision point not found');
      }

      // Validate choice
      const choice = decisionPoint.choices.find(c => c.id === choiceMade);
      if (!choice) {
        throw new Error('Invalid choice for decision point');
      }

      // Check if choice already made for this decision point
      const existingChoice = sessionData.choiceHistory.find(
        c => c.decisionPointId === decisionPointId
      );

      if (existingChoice && !decisionPoint.allowChange) {
        throw new Error('Choice already made for this decision point');
      }

      // Record choice in database
      const choiceRecord = {
        user: sessionData.userId,
        branchingVideo: sessionData.branchingId,
        decisionPointId,
        choiceMade,
        choiceLabel: choice.label,
        timestamp: context.timestamp || 0,
        sessionId: userSessionId,
        syncSessionId: sessionData.syncSessionId,
        
        // Context data
        timeSpentDeciding: context.timeSpentDeciding || 0,
        deviceInfo: context.deviceInfo || sessionData.deviceInfo,
        
        // Choice metadata
        isRevision: !!existingChoice,
        previousChoice: existingChoice?.choiceMade || null,
        
        // Timestamps
        madeAt: new Date(),
        createdAt: new Date()
      };

      const userChoice = new UserChoice(choiceRecord);
      await userChoice.save();

      // Update session data
      if (existingChoice) {
        // Update existing choice
        const choiceIndex = sessionData.choiceHistory.findIndex(
          c => c.decisionPointId === decisionPointId
        );
        sessionData.choiceHistory[choiceIndex] = {
          decisionPointId,
          choiceMade,
          timestamp: context.timestamp || 0,
          madeAt: new Date()
        };
      } else {
        // Add new choice
        sessionData.choiceHistory.push({
          decisionPointId,
          choiceMade,
          timestamp: context.timestamp || 0,
          madeAt: new Date()
        });
        sessionData.totalChoicesMade++;
      }

      // Update visited decision points
      if (!sessionData.visitedDecisionPoints.includes(decisionPointId)) {
        sessionData.visitedDecisionPoints.push(decisionPointId);
      }

      // Determine next path/state
      const nextState = this.calculateNextState(
        branchingVideo.branchStructure,
        sessionData,
        choice
      );

      // Update session state
      sessionData.currentPath = nextState.path;
      sessionData.lastActivity = new Date();
      sessionData.completionPercentage = this.calculateCompletionPercentage(
        branchingVideo.branchStructure,
        sessionData
      );

      // Check if session is completed
      if (nextState.isCompleted) {
        sessionData.isCompleted = true;
        sessionData.completedAt = new Date();
        await this.updateBranchingAnalytics(sessionData.branchingId, 'session_completed');
      }

      // Update analytics for decision point
      await this.updateDecisionPointAnalytics(
        sessionData.branchingId,
        decisionPointId,
        choiceMade
      );

      // Emit choice event
      this.emit('choice-made', {
        sessionId: userSessionId,
        choice: userChoice,
        nextState,
        sessionData
      });

      logger.info('User choice recorded successfully:', {
        userSessionId,
        decisionPointId,
        choiceMade,
        nextPath: nextState.path,
        isCompleted: nextState.isCompleted
      });

      return {
        choice: userChoice,
        nextState,
        sessionData,
        nextDecisionPoint: nextState.nextDecisionPoint
      };

    } catch (error) {
      logger.error('User choice recording failed:', {
        userSessionId,
        decisionPointId,
        choiceMade,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get branching video by ID
   * @param {String} branchingId - branching video ID
   * @param {Boolean} includeAnalytics - whether to include analytics
   * @returns {Promise<Object>} branching video data
   */
  async getBranching(branchingId, includeAnalytics = false) {
    try {
      // Check cache first
      let branchingVideo = this.activeBranches.get(branchingId);

      if (!branchingVideo) {
        // Fetch from database
        branchingVideo = await BranchingVideo.findById(branchingId)
          .populate('parentVideo', 'title duration thumbnail')
          .lean();

        if (branchingVideo) {
          this.activeBranches.set(branchingId, branchingVideo);
        }
      }

      if (!branchingVideo) {
        return null;
      }

      if (includeAnalytics) {
        const analytics = await this.getBranchingAnalytics(branchingId);
        branchingVideo.analytics = analytics;
      }

      return branchingVideo;

    } catch (error) {
      logger.error('Branching video retrieval failed:', {
        branchingId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update branching video structure
   * @param {String} branchingId - branching video ID
   * @param {Object} updatedStructure - new structure
   * @param {String} userId - user making the update
   * @returns {Promise<Object>} updated branching video
   */
  async updateBranching(branchingId, updatedStructure, userId) {
    try {
      logger.info('Updating branching video:', {
        branchingId,
        userId
      });

      const branchingVideo = await BranchingVideo.findById(branchingId);
      if (!branchingVideo) {
        throw new Error('Branching video not found');
      }

      // Check permissions
      if (branchingVideo.createdBy.toString() !== userId) {
        throw new Error('Access denied');
      }

      // Validate new structure
      this.validateBranchStructure(updatedStructure);

      // Update structure
      const normalizedStructure = this.normalizeBranchStructure(updatedStructure);
      
      const updateData = {
        branchStructure: normalizedStructure,
        version: branchingVideo.version + 1,
        totalDecisionPoints: updatedStructure.decisionPoints?.length || 0,
        totalPaths: this.calculateTotalPaths(updatedStructure),
        estimatedDuration: this.calculateEstimatedDuration(updatedStructure),
        updatedAt: new Date()
      };

      const updatedBranching = await BranchingVideo.findByIdAndUpdate(
        branchingId,
        updateData,
        { new: true }
      );

      // Update cache
      this.activeBranches.set(branchingId, updatedBranching);

      // Re-initialize analytics for new structure
      this.initializeAnalytics(branchingId, normalizedStructure);

      logger.info('Branching video updated successfully:', {
        branchingId,
        version: updateData.version,
        totalDecisionPoints: updateData.totalDecisionPoints
      });

      return updatedBranching;

    } catch (error) {
      logger.error('Branching video update failed:', {
        branchingId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Publish branching video
   * @param {String} branchingId - branching video ID
   * @param {String} userId - publisher user ID
   * @returns {Promise<Object>} published branching video
   */
  async publishBranching(branchingId, userId) {
    try {
      const branchingVideo = await BranchingVideo.findById(branchingId);
      if (!branchingVideo) {
        throw new Error('Branching video not found');
      }

      if (branchingVideo.createdBy.toString() !== userId) {
        throw new Error('Access denied');
      }

      // Validate structure before publishing
      this.validateBranchStructure(branchingVideo.branchStructure);

      const updateData = {
        isPublished: true,
        isDraft: false,
        publishedAt: new Date(),
        updatedAt: new Date()
      };

      const publishedBranching = await BranchingVideo.findByIdAndUpdate(
        branchingId,
        updateData,
        { new: true }
      );

      // Update cache
      this.activeBranches.set(branchingId, publishedBranching);

      logger.info('Branching video published:', {
        branchingId,
        userId
      });

      return publishedBranching;

    } catch (error) {
      logger.error('Branching video publish failed:', {
        branchingId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user session data
   * @param {String} userSessionId - user session ID
   * @returns {Object} session data
   */
  getUserSession(userSessionId) {
    return this.userSessions.get(userSessionId);
  }

  /**
   * Get user choice history
   * @param {String} userId - user ID
   * @param {String} branchingId - branching video ID (optional)
   * @returns {Promise<Array>} choice history
   */
  async getUserChoiceHistory(userId, branchingId = null) {
    try {
      const filter = { user: userId };
      if (branchingId) {
        filter.branchingVideo = branchingId;
      }

      const choices = await UserChoice.find(filter)
        .populate('branchingVideo', 'title')
        .sort('-createdAt')
        .lean();

      return choices;

    } catch (error) {
      logger.error('User choice history retrieval failed:', {
        userId,
        branchingId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get branching analytics
   * @param {String} branchingId - branching video ID
   * @returns {Promise<Object>} analytics data
   */
  async getBranchingAnalytics(branchingId) {
    try {
      const branchingVideo = await BranchingVideo.findById(branchingId);
      if (!branchingVideo) {
        throw new Error('Branching video not found');
      }

      // Get choice statistics
      const choiceStats = await UserChoice.aggregate([
        { $match: { branchingVideo: branchingVideo._id } },
        {
          $group: {
            _id: {
              decisionPointId: '$decisionPointId',
              choiceMade: '$choiceMade'
            },
            count: { $sum: 1 },
            averageDecisionTime: { $avg: '$timeSpentDeciding' }
          }
        }
      ]);

      // Calculate path analytics
      const pathAnalytics = await this.calculatePathAnalytics(branchingId);

      // Get completion statistics
      const completionStats = await this.calculateCompletionStats(branchingId);

      return {
        branchingId,
        overview: {
          totalViews: branchingVideo.totalViews,
          totalCompletions: branchingVideo.totalCompletions,
          completionRate: branchingVideo.totalViews > 0 
            ? (branchingVideo.totalCompletions / branchingVideo.totalViews) * 100 
            : 0,
          averageCompletionTime: branchingVideo.averageCompletionTime
        },
        decisionPoints: this.formatDecisionPointAnalytics(choiceStats),
        paths: pathAnalytics,
        completion: completionStats,
        lastUpdated: new Date()
      };

    } catch (error) {
      logger.error('Branching analytics retrieval failed:', {
        branchingId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate branching structure
   * @param {Object} structure - branching structure to validate
   * @throws {Error} if structure is invalid
   */
  validateBranchStructure(structure) {
    if (!structure || typeof structure !== 'object') {
      throw new Error('Branching structure must be an object');
    }

    if (!structure.decisionPoints || !Array.isArray(structure.decisionPoints)) {
      throw new Error('Branching structure must have decisionPoints array');
    }

    for (const [index, point] of structure.decisionPoints.entries()) {
      if (!point.id || !point.timestamp || !point.choices) {
        throw new Error(`Decision point ${index} missing required fields (id, timestamp, choices)`);
      }

      if (!Array.isArray(point.choices) || point.choices.length < 2) {
        throw new Error(`Decision point ${index} must have at least 2 choices`);
      }

      for (const [choiceIndex, choice] of point.choices.entries()) {
        if (!choice.id || !choice.label) {
          throw new Error(`Choice ${choiceIndex} in decision point ${index} missing required fields`);
        }
      }
    }
  }

  /**
   * Normalize branching structure
   * @param {Object} structure - raw branching structure
   * @returns {Object} normalized structure
   */
  normalizeBranchStructure(structure) {
    return {
      ...structure,
      decisionPoints: structure.decisionPoints.map(point => ({
        id: point.id,
        title: point.title || '',
        description: point.description || '',
        timestamp: Number(point.timestamp),
        timeLimit: point.timeLimit || 30,
        allowChange: point.allowChange !== false,
        choices: point.choices.map(choice => ({
          id: choice.id,
          label: choice.label,
          description: choice.description || '',
          nextPath: choice.nextPath || 'main',
          nextTimestamp: choice.nextTimestamp || point.timestamp,
          effects: choice.effects || {},
          conditions: choice.conditions || {}
        }))
      }))
    };
  }

  /**
   * Calculate total possible paths in branching structure
   * @param {Object} structure - branching structure
   * @returns {Number} total paths
   */
  calculateTotalPaths(structure) {
    // Simplified calculation - could be more sophisticated
    return Math.pow(2, structure.decisionPoints?.length || 0);
  }

  /**
   * Calculate estimated duration for branching video
   * @param {Object} structure - branching structure
   * @returns {Number} estimated duration in seconds
   */
  calculateEstimatedDuration(structure) {
    if (!structure.decisionPoints || structure.decisionPoints.length === 0) {
      return 0;
    }

    const lastDecisionPoint = Math.max(
      ...structure.decisionPoints.map(point => point.timestamp)
    );

    return lastDecisionPoint + 60; // Add buffer time
  }

  /**
   * Initialize analytics for branching video
   * @param {String} branchingId - branching video ID
   * @param {Object} structure - branching structure
   */
  initializeAnalytics(branchingId, structure) {
    const analytics = {
      sessions: 0,
      completions: 0,
      decisionPoints: {}
    };

    for (const point of structure.decisionPoints) {
      analytics.decisionPoints[point.id] = {
        views: 0,
        choices: {}
      };

      for (const choice of point.choices) {
        analytics.decisionPoints[point.id].choices[choice.id] = {
          count: 0,
          percentage: 0
        };
      }
    }

    this.analytics.set(branchingId, analytics);
  }

  /**
   * Find decision point in structure
   * @param {Object} structure - branching structure
   * @param {String} decisionPointId - decision point ID
   * @returns {Object} decision point or null
   */
  findDecisionPoint(structure, decisionPointId) {
    return structure.decisionPoints?.find(point => point.id === decisionPointId) || null;
  }

  /**
   * Calculate next state after choice
   * @param {Object} structure - branching structure
   * @param {Object} sessionData - current session data
   * @param {Object} choice - made choice
   * @returns {Object} next state
   */
  calculateNextState(structure, sessionData, choice) {
    const nextPath = choice.nextPath || 'main';
    const nextTimestamp = choice.nextTimestamp || sessionData.currentTimestamp;

    // Find next decision point on the path
    const nextDecisionPoint = this.getNextDecisionPoint(structure, {
      ...sessionData,
      currentPath: nextPath,
      currentTimestamp: nextTimestamp
    });

    // Check if this completes the branching video
    const isCompleted = !nextDecisionPoint || 
      sessionData.visitedDecisionPoints.length >= structure.decisionPoints.length;

    return {
      path: nextPath,
      timestamp: nextTimestamp,
      nextDecisionPoint,
      isCompleted
    };
  }

  /**
   * Get next decision point for session
   * @param {Object} structure - branching structure
   * @param {Object} sessionData - session data
   * @returns {Object} next decision point or null
   */
  getNextDecisionPoint(structure, sessionData) {
    if (!structure.decisionPoints) return null;

    // Find unvisited decision points
    const unvisitedPoints = structure.decisionPoints.filter(
      point => !sessionData.visitedDecisionPoints.includes(point.id) &&
               point.timestamp >= sessionData.currentTimestamp
    );

    if (unvisitedPoints.length === 0) return null;

    // Return the earliest unvisited decision point
    return unvisitedPoints.sort((a, b) => a.timestamp - b.timestamp)[0];
  }

  /**
   * Calculate completion percentage for session
   * @param {Object} structure - branching structure
   * @param {Object} sessionData - session data
   * @returns {Number} completion percentage (0-100)
   */
  calculateCompletionPercentage(structure, sessionData) {
    if (!structure.decisionPoints || structure.decisionPoints.length === 0) {
      return 100;
    }

    return Math.round(
      (sessionData.visitedDecisionPoints.length / structure.decisionPoints.length) * 100
    );
  }

  /**
   * Update branching analytics
   * @param {String} branchingId - branching video ID
   * @param {String} eventType - type of event
   */
  async updateBranchingAnalytics(branchingId, eventType) {
    try {
      const updateData = { updatedAt: new Date() };

      switch (eventType) {
        case 'session_started':
          updateData.$inc = { totalViews: 1 };
          break;
        case 'session_completed':
          updateData.$inc = { totalCompletions: 1 };
          break;
      }

      await BranchingVideo.findByIdAndUpdate(branchingId, updateData);

    } catch (error) {
      logger.error('Analytics update failed:', {
        branchingId,
        eventType,
        error: error.message
      });
    }
  }

  /**
   * Update decision point analytics
   * @param {String} branchingId - branching video ID
   * @param {String} decisionPointId - decision point ID
   * @param {String} choiceMade - choice made
   */
  async updateDecisionPointAnalytics(branchingId, decisionPointId, choiceMade) {
    try {
      const analytics = this.analytics.get(branchingId);
      if (analytics && analytics.decisionPoints[decisionPointId]) {
        analytics.decisionPoints[decisionPointId].views++;
        if (analytics.decisionPoints[decisionPointId].choices[choiceMade]) {
          analytics.decisionPoints[decisionPointId].choices[choiceMade].count++;
        }
      }

    } catch (error) {
      logger.error('Decision point analytics update failed:', {
        branchingId,
        decisionPointId,
        choiceMade,
        error: error.message
      });
    }
  }

  /**
   * Calculate path analytics
   * @param {String} branchingId - branching video ID
   * @returns {Promise<Object>} path analytics
   */
  async calculatePathAnalytics(branchingId) {
    // This would analyze which paths are most/least taken
    // Simplified implementation
    return {
      mostPopularPath: 'main',
      leastPopularPath: 'alternate',
      pathCompletionRates: {}
    };
  }

  /**
   * Calculate completion statistics
   * @param {String} branchingId - branching video ID
   * @returns {Promise<Object>} completion stats
   */
  async calculateCompletionStats(branchingId) {
    // This would analyze completion patterns
    // Simplified implementation
    return {
      averageChoicesPerSession: 0,
      mostCommonDropoffPoint: null,
      completionTimeDistribution: {}
    };
  }

  /**
   * Format decision point analytics
   * @param {Array} choiceStats - raw choice statistics
   * @returns {Object} formatted analytics
   */
  formatDecisionPointAnalytics(choiceStats) {
    const formatted = {};

    for (const stat of choiceStats) {
      const { decisionPointId, choiceMade } = stat._id;
      
      if (!formatted[decisionPointId]) {
        formatted[decisionPointId] = {
          totalViews: 0,
          choices: {}
        };
      }

      formatted[decisionPointId].totalViews += stat.count;
      formatted[decisionPointId].choices[choiceMade] = {
        count: stat.count,
        averageDecisionTime: stat.averageDecisionTime
      };
    }

    // Calculate percentages
    for (const pointId in formatted) {
      const point = formatted[pointId];
      for (const choiceId in point.choices) {
        point.choices[choiceId].percentage = 
          (point.choices[choiceId].count / point.totalViews) * 100;
      }
    }

    return formatted;
  }

  /**
   * Clean up inactive sessions
   */
  cleanupSessions() {
    try {
      const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours

      for (const [sessionId, sessionData] of this.userSessions) {
        if (sessionData.lastActivity < cutoffTime) {
          this.userSessions.delete(sessionId);
        }
      }

      logger.info('Cleaned up inactive branching sessions');

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
      activeBranches: this.activeBranches.size,
      activeSessions: this.userSessions.size,
      trackedAnalytics: this.analytics.size
    };
  }
}

// Create singleton instance
const branchingService = new BranchingService();

export default branchingService;
