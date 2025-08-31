import { VideoAnalytics } from '../models/VideoAnalytics.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { CollaborativeNote } from '../models/CollaborativeNote.js';
import { BranchingPoint } from '../models/BranchingPoint.js';
import logger from '../utils/logger.js';

/**
 * Track a user interaction event
 */
export const trackEvent = async (req, res) => {
  try {
    const { roomCode, userId, eventType, timestamp, metadata } = req.body;
    
    if (!roomCode || !userId || !eventType || timestamp === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: roomCode, userId, eventType, timestamp' 
      });
    }

    // Find or create analytics document for this room
    let analytics = await VideoAnalytics.findOne({ roomCode });
    
    if (!analytics) {
      analytics = new VideoAnalytics({
        roomCode,
        totalViews: 0,
        uniqueViewers: [],
        watchTimeData: [],
        interactionEvents: [],
        engagementMetrics: {
          averageWatchTime: 0,
          completionRate: 0,
          replaySegments: [],
          dropOffPoints: []
        }
      });
    }
    
    // Add user to unique viewers if not already present
    if (!analytics.uniqueViewers.includes(userId)) {
      analytics.uniqueViewers.push(userId);
      analytics.totalViews++;
    }
    
    // Track the interaction event
    const event = {
      userId,
      eventType,
      timestamp,
      metadata: metadata || {}
    };
    
    analytics.interactionEvents.push(event);
    
    // Update specific metrics based on event type
    await updateMetricsForEvent(analytics, event);
    
    // Keep only recent events (last 1000) to prevent document from growing too large
    if (analytics.interactionEvents.length > 1000) {
      analytics.interactionEvents = analytics.interactionEvents.slice(-1000);
    }
    
    await analytics.save();
    
    logger.info(`📊 Event tracked: ${eventType} in room ${roomCode} by ${userId} at ${timestamp}s`);
    
    res.json({
      success: true,
      message: 'Event tracked successfully'
    });
  } catch (error) {
    logger.error(`❌ Error tracking event: ${error.message}`);
    res.status(500).json({ error: 'Failed to track event' });
  }
};

/**
 * Get analytics data for a room
 */
export const getAnalytics = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { detailed = false } = req.query;
    
    const analytics = await VideoAnalytics.findOne({ roomCode }).lean();
    
    if (!analytics) {
      return res.json({
        roomCode,
        totalViews: 0,
        uniqueViewers: 0,
        averageWatchTime: 0,
        completionRate: 0,
        engagementMetrics: {
          averageWatchTime: 0,
          completionRate: 0,
          replaySegments: [],
          dropOffPoints: []
        }
      });
    }
    
    // Calculate real-time metrics
    const realTimeMetrics = await calculateRealTimeMetrics(roomCode);
    
    const response = {
      roomCode,
      totalViews: analytics.totalViews,
      uniqueViewers: analytics.uniqueViewers.length,
      engagementMetrics: analytics.engagementMetrics,
      ...realTimeMetrics
    };
    
    if (detailed) {
      response.watchTimeData = analytics.watchTimeData;
      response.recentEvents = analytics.interactionEvents.slice(-50);
    }
    
    res.json(response);
  } catch (error) {
    logger.error(`❌ Error fetching analytics: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

/**
 * Get engagement heatmap data
 */
export const getHeatmap = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { duration } = req.query;
    
    if (!duration) {
      return res.status(400).json({ error: 'Video duration is required' });
    }

    const analytics = await VideoAnalytics.findOne({ roomCode });
    
    if (!analytics) {
      return res.json({ heatmap: [] });
    }
    
    // Create heatmap segments (10-second intervals)
    const segmentDuration = 10;
    const totalSegments = Math.ceil(parseFloat(duration) / segmentDuration);
    const heatmap = new Array(totalSegments).fill(0);
    
    // Count interactions in each segment
    analytics.interactionEvents.forEach(event => {
      const segmentIndex = Math.floor(event.timestamp / segmentDuration);
      if (segmentIndex < totalSegments) {
        heatmap[segmentIndex]++;
      }
    });
    
    // Normalize to 0-100 scale
    const maxValue = Math.max(...heatmap, 1);
    const normalizedHeatmap = heatmap.map((value, index) => ({
      startTime: index * segmentDuration,
      endTime: Math.min((index + 1) * segmentDuration, parseFloat(duration)),
      intensity: Math.round((value / maxValue) * 100)
    }));
    
    res.json({
      heatmap: normalizedHeatmap,
      segmentDuration,
      totalInteractions: analytics.interactionEvents.length
    });
  } catch (error) {
    logger.error(`❌ Error generating heatmap: ${error.message}`);
    res.status(500).json({ error: 'Failed to generate heatmap' });
  }
};

/**
 * Get user-specific analytics
 */
export const getUserAnalytics = async (req, res) => {
  try {
    const { roomCode, userId } = req.params;
    
    const analytics = await VideoAnalytics.findOne({ roomCode });
    
    if (!analytics) {
      return res.json({
        totalEvents: 0,
        watchTime: 0,
        interactions: []
      });
    }
    
    // Filter events for specific user
    const userEvents = analytics.interactionEvents.filter(event => event.userId === userId);
    
    // Calculate user watch time
    const playEvents = userEvents.filter(e => e.eventType === 'play');
    const pauseEvents = userEvents.filter(e => e.eventType === 'pause');
    
    let totalWatchTime = 0;
    let lastPlayTime = null;
    
    userEvents.sort((a, b) => a.timestamp - b.timestamp).forEach(event => {
      if (event.eventType === 'play') {
        lastPlayTime = event.timestamp;
      } else if (event.eventType === 'pause' && lastPlayTime !== null) {
        totalWatchTime += event.timestamp - lastPlayTime;
        lastPlayTime = null;
      }
    });
    
    // Get user's collaborative data
    const [chatMessages, notes, branchingChoices] = await Promise.all([
      ChatMessage.countDocuments({ roomCode, userId }),
      CollaborativeNote.countDocuments({ roomCode, userId }),
      BranchingPoint.countDocuments({ 
        roomCode, 
        'choices.selectedBy': userId 
      })
    ]);
    
    res.json({
      userId,
      totalEvents: userEvents.length,
      watchTime: totalWatchTime,
      interactions: {
        chatMessages,
        notes,
        branchingChoices
      },
      recentActivity: userEvents.slice(-20)
    });
  } catch (error) {
    logger.error(`❌ Error fetching user analytics: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch user analytics' });
  }
};

/**
 * Export analytics data
 */
export const exportAnalytics = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { format = 'json', includeEvents = false } = req.query;
    
    const analytics = await VideoAnalytics.findOne({ roomCode }).lean();
    
    if (!analytics) {
      return res.status(404).json({ error: 'No analytics data found for this room' });
    }
    
    // Get collaborative data
    const [chatStats, notesStats, branchingStats] = await Promise.all([
      ChatMessage.aggregate([
        { $match: { roomCode } },
        { $group: { _id: null, total: { $sum: 1 }, users: { $addToSet: '$userId' } } }
      ]),
      CollaborativeNote.aggregate([
        { $match: { roomCode } },
        { $group: { _id: null, total: { $sum: 1 }, users: { $addToSet: '$userId' } } }
      ]),
      BranchingPoint.aggregate([
        { $match: { roomCode } },
        { $group: { _id: null, total: { $sum: 1 } } }
      ])
    ]);
    
    const exportData = {
      roomCode,
      exportedAt: new Date(),
      analytics: {
        totalViews: analytics.totalViews,
        uniqueViewers: analytics.uniqueViewers.length,
        engagementMetrics: analytics.engagementMetrics
      },
      collaborativeStats: {
        chatMessages: chatStats[0]?.total || 0,
        chatUsers: chatStats[0]?.users?.length || 0,
        notes: notesStats[0]?.total || 0,
        noteUsers: notesStats[0]?.users?.length || 0,
        branchingPoints: branchingStats[0]?.total || 0
      }
    };
    
    if (includeEvents === 'true') {
      exportData.events = analytics.interactionEvents;
    }
    
    if (format === 'json') {
      res.json(exportData);
    } else if (format === 'csv') {
      let csvContent = 'Metric,Value\n';
      csvContent += `Total Views,${exportData.analytics.totalViews}\n`;
      csvContent += `Unique Viewers,${exportData.analytics.uniqueViewers}\n`;
      csvContent += `Average Watch Time,${exportData.analytics.engagementMetrics.averageWatchTime}\n`;
      csvContent += `Completion Rate,${exportData.analytics.engagementMetrics.completionRate}\n`;
      csvContent += `Chat Messages,${exportData.collaborativeStats.chatMessages}\n`;
      csvContent += `Notes,${exportData.collaborativeStats.notes}\n`;
      csvContent += `Branching Points,${exportData.collaborativeStats.branchingPoints}\n`;
      
      res.type('text/csv').send(csvContent);
    } else {
      res.status(400).json({ error: 'Invalid format. Supported formats: json, csv' });
    }
  } catch (error) {
    logger.error(`❌ Error exporting analytics: ${error.message}`);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
};

/**
 * Get real-time dashboard data
 */
export const getDashboard = async (req, res) => {
  try {
    const { roomCode } = req.params;
    
    // Get current analytics
    const analytics = await VideoAnalytics.findOne({ roomCode });
    
    // Get recent activity (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const [recentChat, recentNotes, recentBranching] = await Promise.all([
      ChatMessage.countDocuments({ 
        roomCode, 
        timestamp: { $gte: twentyFourHoursAgo } 
      }),
      CollaborativeNote.countDocuments({ 
        roomCode, 
        createdAt: { $gte: twentyFourHoursAgo } 
      }),
      BranchingPoint.countDocuments({ 
        roomCode, 
        createdAt: { $gte: twentyFourHoursAgo } 
      })
    ]);
    
    // Calculate engagement trend (comparing last 24h to previous 24h)
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    
    const previousChat = await ChatMessage.countDocuments({ 
      roomCode, 
      timestamp: { $gte: fortyEightHoursAgo, $lt: twentyFourHoursAgo } 
    });
    
    const chatTrend = previousChat > 0 ? 
      ((recentChat - previousChat) / previousChat * 100).toFixed(1) : 
      (recentChat > 0 ? 100 : 0);
    
    res.json({
      roomCode,
      currentViewers: analytics?.uniqueViewers.length || 0,
      totalViews: analytics?.totalViews || 0,
      recentActivity: {
        last24Hours: {
          chatMessages: recentChat,
          notes: recentNotes,
          branchingPoints: recentBranching
        },
        trends: {
          chatTrend: `${chatTrend >= 0 ? '+' : ''}${chatTrend}%`
        }
      },
      engagementMetrics: analytics?.engagementMetrics || {
        averageWatchTime: 0,
        completionRate: 0,
        replaySegments: [],
        dropOffPoints: []
      }
    });
  } catch (error) {
    logger.error(`❌ Error fetching dashboard data: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

// Helper functions

async function updateMetricsForEvent(analytics, event) {
  const { eventType, timestamp, metadata } = event;
  
  // Update watch time data
  if (eventType === 'play' || eventType === 'pause') {
    analytics.watchTimeData.push({
      timestamp,
      eventType,
      userId: event.userId
    });
  }
  
  // Track replay segments
  if (eventType === 'seek' && metadata.seekBackward) {
    const existingSegment = analytics.engagementMetrics.replaySegments.find(
      segment => Math.abs(segment.timestamp - timestamp) < 10
    );
    
    if (existingSegment) {
      existingSegment.count++;
    } else {
      analytics.engagementMetrics.replaySegments.push({
        timestamp,
        count: 1
      });
    }
  }
  
  // Track drop-off points (when users pause or leave)
  if (eventType === 'pause' || eventType === 'ended') {
    const existingDropOff = analytics.engagementMetrics.dropOffPoints.find(
      point => Math.abs(point.timestamp - timestamp) < 30
    );
    
    if (existingDropOff) {
      existingDropOff.count++;
    } else {
      analytics.engagementMetrics.dropOffPoints.push({
        timestamp,
        count: 1
      });
    }
  }
  
  // Recalculate average metrics
  await recalculateEngagementMetrics(analytics);
}

async function recalculateEngagementMetrics(analytics) {
  // Calculate average watch time
  const watchSessions = {};
  
  analytics.watchTimeData.forEach(data => {
    if (!watchSessions[data.userId]) {
      watchSessions[data.userId] = { totalTime: 0, lastPlay: null };
    }
    
    if (data.eventType === 'play') {
      watchSessions[data.userId].lastPlay = data.timestamp;
    } else if (data.eventType === 'pause' && watchSessions[data.userId].lastPlay !== null) {
      watchSessions[data.userId].totalTime += data.timestamp - watchSessions[data.userId].lastPlay;
      watchSessions[data.userId].lastPlay = null;
    }
  });
  
  const totalWatchTime = Object.values(watchSessions).reduce((sum, session) => sum + session.totalTime, 0);
  analytics.engagementMetrics.averageWatchTime = totalWatchTime / Math.max(analytics.uniqueViewers.length, 1);
  
  // Calculate completion rate (simplified - based on 'ended' events)
  const completionEvents = analytics.interactionEvents.filter(e => e.eventType === 'ended').length;
  analytics.engagementMetrics.completionRate = (completionEvents / Math.max(analytics.totalViews, 1)) * 100;
}

async function calculateRealTimeMetrics(roomCode) {
  // Get recent activity counts
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const [recentChat, recentNotes] = await Promise.all([
    ChatMessage.countDocuments({ 
      roomCode, 
      timestamp: { $gte: oneHourAgo } 
    }),
    CollaborativeNote.countDocuments({ 
      roomCode, 
      createdAt: { $gte: oneHourAgo } 
    })
  ]);
  
  return {
    recentActivity: {
      lastHour: {
        chatMessages: recentChat,
        notes: recentNotes
      }
    }
  };
}
