/**
 * Analytics Service
 * Handles user analytics and metrics collection
 */

import logger from '../utils/logger.js';
import { config } from '../config/env.js';

/**
 * Analytics service for tracking user behavior and system metrics
 */
class AnalyticsService {
  constructor() {
    this.metrics = new Map();
    this.enabled = config.analytics?.enabled || false;
  }

  /**
   * Track user event
   */
  trackEvent(userId, eventName, eventData = {}) {
    if (!this.enabled) return;

    try {
      const event = {
        userId,
        eventName,
        eventData,
        timestamp: new Date(),
        sessionId: eventData.sessionId || null
      };

      logger.info('Analytics event tracked', { event });
      this.storeEvent(event);
    } catch (error) {
      logger.error('Failed to track analytics event', { error, userId, eventName });
    }
  }

  /**
   * Track video viewing session
   */
  trackVideoSession(userId, videoId, sessionData) {
    this.trackEvent(userId, 'video_session', {
      videoId,
      duration: sessionData.duration,
      watchTime: sessionData.watchTime,
      completed: sessionData.completed,
      quality: sessionData.quality
    });
  }

  /**
   * Track room activity
   */
  trackRoomActivity(userId, roomId, activity) {
    this.trackEvent(userId, 'room_activity', {
      roomId,
      activity,
      participants: activity.participants || 0
    });
  }

  /**
   * Get user analytics summary
   */
  getUserAnalytics(userId) {
    try {
      const userEvents = this.getEventsByUser(userId);
      return {
        totalEvents: userEvents.length,
        videoSessions: userEvents.filter(e => e.eventName === 'video_session').length,
        roomActivities: userEvents.filter(e => e.eventName === 'room_activity').length,
        lastActivity: userEvents.length > 0 ? userEvents[userEvents.length - 1].timestamp : null
      };
    } catch (error) {
      logger.error('Failed to get user analytics', { error, userId });
      return {
        totalEvents: 0,
        videoSessions: 0,
        roomActivities: 0,
        lastActivity: null
      };
    }
  }

  /**
   * Get system metrics
   */
  getSystemMetrics() {
    try {
      const allEvents = Array.from(this.metrics.values()).flat();
      const now = new Date();
      const hour = 60 * 60 * 1000;
      const day = 24 * hour;

      const recentEvents = allEvents.filter(e => 
        now - new Date(e.timestamp) < hour
      );

      const dailyEvents = allEvents.filter(e => 
        now - new Date(e.timestamp) < day
      );

      return {
        eventsLastHour: recentEvents.length,
        eventsToday: dailyEvents.length,
        totalEvents: allEvents.length,
        uniqueUsers: new Set(allEvents.map(e => e.userId)).size
      };
    } catch (error) {
      logger.error('Failed to get system metrics', { error });
      return {
        eventsLastHour: 0,
        eventsToday: 0,
        totalEvents: 0,
        uniqueUsers: 0
      };
    }
  }

  /**
   * Store event in memory (in production, this would go to a database)
   */
  storeEvent(event) {
    if (!this.metrics.has(event.userId)) {
      this.metrics.set(event.userId, []);
    }
    this.metrics.get(event.userId).push(event);

    // Keep only last 1000 events per user to prevent memory issues
    const userEvents = this.metrics.get(event.userId);
    if (userEvents.length > 1000) {
      this.metrics.set(event.userId, userEvents.slice(-1000));
    }
  }

  /**
   * Get events by user
   */
  getEventsByUser(userId) {
    return this.metrics.get(userId) || [];
  }

  /**
   * Clear analytics data (for testing)
   */
  clearData() {
    this.metrics.clear();
  }

  /**
   * Export analytics data
   */
  exportData() {
    const data = {};
    for (const [userId, events] of this.metrics.entries()) {
      data[userId] = events;
    }
    return data;
  }

  /**
   * Generate analytics report
   */
  generateReport(options = {}) {
    try {
      const { reportType, startDate, endDate, filters, format = 'json' } = options;
      
      const allEvents = Array.from(this.metrics.values()).flat();
      
      // Filter events by date range if provided
      let filteredEvents = allEvents;
      if (startDate || endDate) {
        filteredEvents = allEvents.filter(event => {
          const eventDate = new Date(event.timestamp);
          if (startDate && eventDate < startDate) return false;
          if (endDate && eventDate > endDate) return false;
          return true;
        });
      }
      
      // Generate report based on type
      const report = {
        reportType: reportType || 'general',
        generatedAt: new Date().toISOString(),
        period: {
          startDate: startDate ? startDate.toISOString() : null,
          endDate: endDate ? endDate.toISOString() : null
        },
        data: {}
      };
      
      switch (reportType) {
        case 'video_performance':
          report.data = this.generateVideoPerformanceReport(filteredEvents);
          break;
        case 'user_engagement':
          report.data = this.generateUserEngagementReport(filteredEvents);
          break;
        case 'platform_overview':
          report.data = this.generatePlatformOverviewReport(filteredEvents);
          break;
        default:
          report.data = this.generateGeneralReport(filteredEvents);
      }
      
      return report;
    } catch (error) {
      logger.error('Failed to generate analytics report', { error, options });
      throw new Error('Report generation failed');
    }
  }

  /**
   * Generate video performance report
   */
  generateVideoPerformanceReport(events) {
    const videoEvents = events.filter(e => e.eventName === 'video_session');
    const videoStats = {};
    
    videoEvents.forEach(event => {
      const videoId = event.eventData.videoId;
      if (!videoStats[videoId]) {
        videoStats[videoId] = {
          totalViews: 0,
          totalWatchTime: 0,
          uniqueUsers: new Set(),
          completedViews: 0
        };
      }
      
      videoStats[videoId].totalViews++;
      videoStats[videoId].totalWatchTime += event.eventData.watchTime || 0;
      videoStats[videoId].uniqueUsers.add(event.userId);
      
      if (event.eventData.completed) {
        videoStats[videoId].completedViews++;
      }
    });
    
    // Convert sets to counts and calculate averages
    const result = {};
    for (const [videoId, stats] of Object.entries(videoStats)) {
      result[videoId] = {
        totalViews: stats.totalViews,
        uniqueViewers: stats.uniqueUsers.size,
        totalWatchTime: stats.totalWatchTime,
        averageWatchTime: stats.totalViews > 0 ? stats.totalWatchTime / stats.totalViews : 0,
        completionRate: stats.totalViews > 0 ? (stats.completedViews / stats.totalViews) * 100 : 0
      };
    }
    
    return result;
  }

  /**
   * Generate user engagement report
   */
  generateUserEngagementReport(events) {
    const userStats = {};
    
    events.forEach(event => {
      if (!userStats[event.userId]) {
        userStats[event.userId] = {
          totalEvents: 0,
          videoSessions: 0,
          roomActivities: 0,
          firstActivity: event.timestamp,
          lastActivity: event.timestamp
        };
      }
      
      const stats = userStats[event.userId];
      stats.totalEvents++;
      
      if (event.eventName === 'video_session') stats.videoSessions++;
      if (event.eventName === 'room_activity') stats.roomActivities++;
      
      if (new Date(event.timestamp) < new Date(stats.firstActivity)) {
        stats.firstActivity = event.timestamp;
      }
      if (new Date(event.timestamp) > new Date(stats.lastActivity)) {
        stats.lastActivity = event.timestamp;
      }
    });
    
    return {
      totalUsers: Object.keys(userStats).length,
      userBreakdown: userStats,
      aggregates: {
        averageEventsPerUser: Object.values(userStats).reduce((sum, u) => sum + u.totalEvents, 0) / Object.keys(userStats).length,
        averageVideoSessionsPerUser: Object.values(userStats).reduce((sum, u) => sum + u.videoSessions, 0) / Object.keys(userStats).length
      }
    };
  }

  /**
   * Generate platform overview report
   */
  generatePlatformOverviewReport(events) {
    const totalEvents = events.length;
    const uniqueUsers = new Set(events.map(e => e.userId)).size;
    const eventTypes = {};
    
    events.forEach(event => {
      eventTypes[event.eventName] = (eventTypes[event.eventName] || 0) + 1;
    });
    
    return {
      totalEvents,
      uniqueUsers,
      eventTypeBreakdown: eventTypes,
      averageEventsPerUser: totalEvents / Math.max(uniqueUsers, 1),
      timeRange: {
        earliest: events.length > 0 ? Math.min(...events.map(e => new Date(e.timestamp).getTime())) : null,
        latest: events.length > 0 ? Math.max(...events.map(e => new Date(e.timestamp).getTime())) : null
      }
    };
  }

  /**
   * Generate general report
   */
  generateGeneralReport(events) {
    return {
      summary: this.generatePlatformOverviewReport(events),
      videos: this.generateVideoPerformanceReport(events),
      users: this.generateUserEngagementReport(events)
    };
  }

  /**
   * Get AI-powered analytics insights
   */
  getAIAnalytics(options = {}) {
    try {
      const { videoId, period = '30d', insights = ['engagement', 'performance'] } = options;
      
      // Get base analytics data
      const allEvents = Array.from(this.metrics.values()).flat();
      let relevantEvents = allEvents;
      
      // Filter by video if specified
      if (videoId) {
        relevantEvents = allEvents.filter(event => 
          event.eventData && event.eventData.videoId === videoId
        );
      }
      
      // Filter by time period
      const now = new Date();
      const periodMs = this.parsePeriod(period);
      const cutoffDate = new Date(now.getTime() - periodMs);
      
      relevantEvents = relevantEvents.filter(event => 
        new Date(event.timestamp) >= cutoffDate
      );
      
      const aiInsights = {
        generatedAt: now.toISOString(),
        period,
        videoId: videoId || 'all',
        insights: {}
      };
      
      // Generate requested insights
      for (const insightType of insights) {
        switch (insightType) {
          case 'engagement':
            aiInsights.insights.engagement = this.generateEngagementInsights(relevantEvents);
            break;
          case 'performance':
            aiInsights.insights.performance = this.generatePerformanceInsights(relevantEvents);
            break;
          case 'predictions':
            aiInsights.insights.predictions = this.generatePredictionInsights(relevantEvents);
            break;
          case 'recommendations':
            aiInsights.insights.recommendations = this.generateRecommendationInsights(relevantEvents);
            break;
          default:
            logger.warn('Unknown AI insight type requested:', insightType);
        }
      }
      
      return aiInsights;
    } catch (error) {
      logger.error('Failed to generate AI analytics', { error, options });
      throw new Error('AI analytics generation failed');
    }
  }

  /**
   * Parse period string to milliseconds
   */
  parsePeriod(period) {
    const periodMap = {
      '1d': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000
    };
    
    return periodMap[period] || periodMap['30d'];
  }

  /**
   * Generate engagement insights
   */
  generateEngagementInsights(events) {
    const videoSessions = events.filter(e => e.eventName === 'video_session');
    const roomActivities = events.filter(e => e.eventName === 'room_activity');
    
    if (videoSessions.length === 0) {
      return {
        score: 0,
        trend: 'insufficient_data',
        insights: ['Not enough data to generate engagement insights']
      };
    }
    
    const avgWatchTime = videoSessions.reduce((sum, s) => sum + (s.eventData.watchTime || 0), 0) / videoSessions.length;
    const completionRate = videoSessions.filter(s => s.eventData.completed).length / videoSessions.length;
    const groupWatchRate = roomActivities.length / videoSessions.length;
    
    // Simple engagement scoring (0-100)
    const engagementScore = Math.min(100, 
      (completionRate * 40) + 
      (Math.min(avgWatchTime / 600, 1) * 30) + // Normalize to 10 minutes max
      (groupWatchRate * 30)
    );
    
    const insights = [];
    if (completionRate > 0.8) insights.push('High completion rate indicates engaging content');
    else if (completionRate < 0.3) insights.push('Low completion rate suggests content improvements needed');
    
    if (groupWatchRate > 0.3) insights.push('High group watching indicates social appeal');
    if (avgWatchTime < 60) insights.push('Short watch times may indicate accessibility issues');
    
    return {
      score: Math.round(engagementScore),
      completionRate: Math.round(completionRate * 100),
      averageWatchTime: Math.round(avgWatchTime),
      groupWatchRate: Math.round(groupWatchRate * 100),
      trend: engagementScore > 70 ? 'positive' : engagementScore > 40 ? 'neutral' : 'negative',
      insights
    };
  }

  /**
   * Generate performance insights
   */
  generatePerformanceInsights(events) {
    const videoSessions = events.filter(e => e.eventName === 'video_session');
    
    if (videoSessions.length === 0) {
      return {
        score: 0,
        insights: ['Not enough data to generate performance insights']
      };
    }
    
    const totalViews = videoSessions.length;
    const uniqueUsers = new Set(videoSessions.map(s => s.userId)).size;
    const totalWatchTime = videoSessions.reduce((sum, s) => sum + (s.eventData.watchTime || 0), 0);
    
    // Performance scoring based on views and engagement
    const performanceScore = Math.min(100, 
      Math.log10(totalViews + 1) * 25 + // Logarithmic view scaling
      (uniqueUsers / Math.max(totalViews, 1)) * 50 + // User diversity
      Math.min(totalWatchTime / 3600, 1) * 25 // Total watch time in hours
    );
    
    const insights = [];
    if (totalViews > 100) insights.push('Good view count indicates strong appeal');
    if (uniqueUsers / totalViews > 0.8) insights.push('High user diversity suggests broad appeal');
    if (totalWatchTime > 3600) insights.push('High total watch time shows strong engagement');
    
    return {
      score: Math.round(performanceScore),
      totalViews,
      uniqueUsers,
      totalWatchTimeHours: Math.round(totalWatchTime / 3600 * 10) / 10,
      insights
    };
  }

  /**
   * Generate prediction insights
   */
  generatePredictionInsights(events) {
    // Simple trend analysis for predictions
    const recentEvents = events.slice(-50); // Last 50 events
    const olderEvents = events.slice(-100, -50); // Previous 50 events
    
    const recentViews = recentEvents.filter(e => e.eventName === 'video_session').length;
    const olderViews = olderEvents.filter(e => e.eventName === 'video_session').length;
    
    const growthRate = olderViews > 0 ? ((recentViews - olderViews) / olderViews) : 0;
    
    return {
      viewGrowthRate: Math.round(growthRate * 100),
      trend: growthRate > 0.1 ? 'growing' : growthRate < -0.1 ? 'declining' : 'stable',
      prediction: growthRate > 0.2 ? 'expect_continued_growth' : 
                 growthRate < -0.2 ? 'may_need_promotion' : 'stable_performance',
      confidence: Math.min(95, events.length * 2) // Confidence based on data amount
    };
  }

  /**
   * Generate recommendation insights
   */
  generateRecommendationInsights(events) {
    const recommendations = [];
    
    const videoSessions = events.filter(e => e.eventName === 'video_session');
    const avgWatchTime = videoSessions.reduce((sum, s) => sum + (s.eventData.watchTime || 0), 0) / Math.max(videoSessions.length, 1);
    const completionRate = videoSessions.filter(s => s.eventData.completed).length / Math.max(videoSessions.length, 1);
    
    if (completionRate < 0.5) {
      recommendations.push({
        type: 'content_optimization',
        priority: 'high',
        suggestion: 'Consider improving content engagement to increase completion rates'
      });
    }
    
    if (avgWatchTime < 120) {
      recommendations.push({
        type: 'accessibility',
        priority: 'medium',
        suggestion: 'Short watch times may indicate need for better onboarding or content pacing'
      });
    }
    
    if (videoSessions.length > 50 && new Set(videoSessions.map(s => s.userId)).size < 20) {
      recommendations.push({
        type: 'audience_expansion',
        priority: 'medium',
        suggestion: 'High repeat viewing suggests strong appeal - consider broader promotion'
      });
    }
    
    return {
      recommendations,
      priorityActions: recommendations.filter(r => r.priority === 'high').length,
      totalSuggestions: recommendations.length
    };
  }

  /**
   * Get branching video analytics
   */
  getBranchingAnalytics(options = {}) {
    try {
      const { branchingVideoId, period = '30d', includePathAnalysis = true } = options;
      
      // Get all events related to branching videos
      const allEvents = Array.from(this.metrics.values()).flat();
      
      // Filter events for this branching video
      const branchingEvents = allEvents.filter(event => 
        event.eventData && 
        (event.eventData.branchingVideoId === branchingVideoId ||
         event.eventData.videoId === branchingVideoId)
      );
      
      // Filter by time period
      const now = new Date();
      const periodMs = this.parsePeriod(period);
      const cutoffDate = new Date(now.getTime() - periodMs);
      
      const relevantEvents = branchingEvents.filter(event => 
        new Date(event.timestamp) >= cutoffDate
      );
      
      const analytics = {
        branchingVideoId,
        period,
        generatedAt: now.toISOString(),
        summary: this.generateBranchingSummary(relevantEvents),
        engagement: this.generateBranchingEngagement(relevantEvents),
        pathAnalysis: includePathAnalysis ? this.generatePathAnalysis(relevantEvents) : null,
        decisionPoints: this.generateDecisionPointAnalytics(relevantEvents),
        userJourney: this.generateUserJourneyAnalytics(relevantEvents)
      };
      
      return analytics;
    } catch (error) {
      logger.error('Failed to generate branching analytics', { error, options });
      throw new Error('Branching analytics generation failed');
    }
  }

  /**
   * Generate branching video summary
   */
  generateBranchingSummary(events) {
    const totalViews = events.filter(e => e.eventName === 'video_session').length;
    const uniqueUsers = new Set(events.map(e => e.userId)).size;
    const choiceEvents = events.filter(e => e.eventName === 'choice_made');
    const completionEvents = events.filter(e => e.eventData && e.eventData.completed);
    
    return {
      totalViews,
      uniqueUsers,
      totalChoicesMade: choiceEvents.length,
      completionRate: totalViews > 0 ? (completionEvents.length / totalViews) * 100 : 0,
      averageChoicesPerSession: totalViews > 0 ? choiceEvents.length / totalViews : 0,
      engagementScore: this.calculateBranchingEngagementScore(events)
    };
  }

  /**
   * Generate branching engagement metrics
   */
  generateBranchingEngagement(events) {
    const videoSessions = events.filter(e => e.eventName === 'video_session');
    const choiceEvents = events.filter(e => e.eventName === 'choice_made');
    
    if (videoSessions.length === 0) {
      return {
        averageSessionTime: 0,
        choiceEngagementRate: 0,
        dropoffRate: 0,
        insights: ['Insufficient data for engagement analysis']
      };
    }
    
    const avgSessionTime = videoSessions.reduce((sum, s) => sum + (s.eventData.watchTime || 0), 0) / videoSessions.length;
    const choiceEngagementRate = (choiceEvents.length / videoSessions.length) * 100;
    const dropoffEvents = events.filter(e => e.eventName === 'session_abandoned');
    const dropoffRate = (dropoffEvents.length / videoSessions.length) * 100;
    
    const insights = [];
    if (choiceEngagementRate > 80) insights.push('High choice engagement indicates compelling decision points');
    if (dropoffRate < 20) insights.push('Low dropoff rate shows good user retention');
    if (avgSessionTime > 300) insights.push('Long session times suggest immersive content');
    
    return {
      averageSessionTime: Math.round(avgSessionTime),
      choiceEngagementRate: Math.round(choiceEngagementRate),
      dropoffRate: Math.round(dropoffRate),
      interactionRate: Math.round((choiceEvents.length / Math.max(videoSessions.length * 5, 1)) * 100), // Assuming 5 avg decision points
      insights
    };
  }

  /**
   * Generate path analysis
   */
  generatePathAnalysis(events) {
    const choiceEvents = events.filter(e => e.eventName === 'choice_made');
    const pathCounts = {};
    const decisionStats = {};
    
    // Group choices by user sessions to create paths
    const sessionPaths = {};
    
    choiceEvents.forEach(event => {
      const sessionId = event.eventData.sessionId || event.userId;
      if (!sessionPaths[sessionId]) {
        sessionPaths[sessionId] = [];
      }
      sessionPaths[sessionId].push({
        decisionPoint: event.eventData.decisionPoint || 'unknown',
        choice: event.eventData.choice || 'unknown',
        timestamp: event.timestamp
      });
    });
    
    // Analyze paths
    Object.values(sessionPaths).forEach(path => {
      path.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const pathKey = path.map(p => `${p.decisionPoint}:${p.choice}`).join('->');
      pathCounts[pathKey] = (pathCounts[pathKey] || 0) + 1;
      
      // Track decision point statistics
      path.forEach(decision => {
        const dpKey = decision.decisionPoint;
        if (!decisionStats[dpKey]) {
          decisionStats[dpKey] = { choices: {}, totalDecisions: 0 };
        }
        decisionStats[dpKey].choices[decision.choice] = (decisionStats[dpKey].choices[decision.choice] || 0) + 1;
        decisionStats[dpKey].totalDecisions++;
      });
    });
    
    // Find most popular paths
    const sortedPaths = Object.entries(pathCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([path, count]) => ({ path, count, percentage: (count / Object.keys(sessionPaths).length) * 100 }));
    
    return {
      totalUniquePaths: Object.keys(pathCounts).length,
      totalSessions: Object.keys(sessionPaths).length,
      mostPopularPaths: sortedPaths,
      decisionPointStats: decisionStats,
      pathDiversity: Object.keys(pathCounts).length / Math.max(Object.keys(sessionPaths).length, 1)
    };
  }

  /**
   * Generate decision point analytics
   */
  generateDecisionPointAnalytics(events) {
    const choiceEvents = events.filter(e => e.eventName === 'choice_made');
    const decisionPoints = {};
    
    choiceEvents.forEach(event => {
      const dpId = event.eventData.decisionPoint || 'unknown';
      const choice = event.eventData.choice || 'unknown';
      
      if (!decisionPoints[dpId]) {
        decisionPoints[dpId] = {
          totalChoices: 0,
          choices: {},
          averageDecisionTime: 0,
          abandonmentRate: 0
        };
      }
      
      decisionPoints[dpId].totalChoices++;
      decisionPoints[dpId].choices[choice] = (decisionPoints[dpId].choices[choice] || 0) + 1;
      
      if (event.eventData.decisionTime) {
        const currentAvg = decisionPoints[dpId].averageDecisionTime;
        const count = decisionPoints[dpId].totalChoices;
        decisionPoints[dpId].averageDecisionTime = ((currentAvg * (count - 1)) + event.eventData.decisionTime) / count;
      }
    });
    
    // Calculate choice percentages
    Object.keys(decisionPoints).forEach(dpId => {
      const dp = decisionPoints[dpId];
      const total = dp.totalChoices;
      
      dp.choicePercentages = {};
      Object.keys(dp.choices).forEach(choice => {
        dp.choicePercentages[choice] = (dp.choices[choice] / total) * 100;
      });
    });
    
    return decisionPoints;
  }

  /**
   * Generate user journey analytics
   */
  generateUserJourneyAnalytics(events) {
    const userJourneys = {};
    
    events.forEach(event => {
      if (!userJourneys[event.userId]) {
        userJourneys[event.userId] = {
          events: [],
          totalTime: 0,
          choicesMade: 0,
          completed: false
        };
      }
      
      userJourneys[event.userId].events.push(event);
      
      if (event.eventName === 'choice_made') {
        userJourneys[event.userId].choicesMade++;
      }
      
      if (event.eventName === 'video_session' && event.eventData.completed) {
        userJourneys[event.userId].completed = true;
      }
      
      if (event.eventData && event.eventData.watchTime) {
        userJourneys[event.userId].totalTime += event.eventData.watchTime;
      }
    });
    
    const journeyStats = Object.values(userJourneys);
    const totalUsers = journeyStats.length;
    
    return {
      totalUsers,
      averageJourneyTime: journeyStats.reduce((sum, j) => sum + j.totalTime, 0) / Math.max(totalUsers, 1),
      averageChoicesPerUser: journeyStats.reduce((sum, j) => sum + j.choicesMade, 0) / Math.max(totalUsers, 1),
      completionRate: (journeyStats.filter(j => j.completed).length / Math.max(totalUsers, 1)) * 100,
      userSegments: {
        quickDeciders: journeyStats.filter(j => j.choicesMade > 0 && j.totalTime < 300).length,
        engaged: journeyStats.filter(j => j.totalTime > 600 && j.choicesMade >= 3).length,
        browsers: journeyStats.filter(j => j.totalTime > 60 && j.choicesMade < 2).length
      }
    };
  }

  /**
   * Calculate branching engagement score
   */
  calculateBranchingEngagementScore(events) {
    const videoSessions = events.filter(e => e.eventName === 'video_session').length;
    const choiceEvents = events.filter(e => e.eventName === 'choice_made').length;
    const completions = events.filter(e => e.eventData && e.eventData.completed).length;
    
    if (videoSessions === 0) return 0;
    
    const choiceRate = choiceEvents / videoSessions;
    const completionRate = completions / videoSessions;
    
    // Weighted score: 60% choice engagement, 40% completion rate
    return Math.round((choiceRate * 60) + (completionRate * 40));
  }
}

// Create singleton instance
export const analyticsService = new AnalyticsService();

export default analyticsService;
