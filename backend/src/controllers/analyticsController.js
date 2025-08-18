import analyticsService from '../services/analyticsService.js';
import logger from '../utils/logger.js';

/**
 * Track video view event
 */
export const trackView = async (req, res) => {
  try {
    const { videoId, userId, sessionId, timestamp, duration } = req.body;
    
    await analyticsService.trackVideoView({
      videoId,
      userId,
      sessionId,
      timestamp,
      duration
    });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error tracking view:', error);
    res.status(500).json({ error: 'Failed to track view' });
  }
};

/**
 * Track user interaction event
 */
export const trackInteraction = async (req, res) => {
  try {
    const { type, videoId, userId, timestamp, metadata } = req.body;
    
    await analyticsService.trackInteraction({
      type,
      videoId,
      userId,
      timestamp,
      metadata
    });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error tracking interaction:', error);
    res.status(500).json({ error: 'Failed to track interaction' });
  }
};

/**
 * Get video analytics
 */
export const getVideoAnalytics = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { startDate, endDate } = req.query;
    
    const analytics = await analyticsService.getVideoAnalytics(videoId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });
    
    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching video analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

/**
 * Get user analytics dashboard
 */
export const getUserAnalytics = async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = '30d' } = req.query;
    
    const analytics = await analyticsService.getUserAnalytics(userId, period);
    
    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching user analytics:', error);
    res.status(500).json({ error: 'Failed to fetch user analytics' });
  }
};

/**
 * Get platform-wide analytics (admin only)
 */
export const getPlatformAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, metrics } = req.query;
    
    const analytics = await analyticsService.getPlatformAnalytics({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      metrics: metrics ? metrics.split(',') : undefined
    });
    
    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching platform analytics:', error);
    res.status(500).json({ error: 'Failed to fetch platform analytics' });
  }
};

/**
 * Get real-time analytics
 */
export const getRealTimeAnalytics = async (req, res) => {
  try {
    const realTimeData = await analyticsService.getRealTimeAnalytics();
    
    res.json(realTimeData);
  } catch (error) {
    logger.error('Error fetching real-time analytics:', error);
    res.status(500).json({ error: 'Failed to fetch real-time analytics' });
  }
};

/**
 * Export analytics data
 */
export const exportAnalytics = async (req, res) => {
  try {
    const { type, format, startDate, endDate, filters } = req.body;
    
    const exportResult = await analyticsService.exportAnalytics({
      type,
      format,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      filters
    });
    
    if (format === 'download' && exportResult.downloadUrl) {
      res.redirect(exportResult.downloadUrl);
    } else {
      res.json(exportResult);
    }
  } catch (error) {
    logger.error('Error exporting analytics:', error);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
};

/**
 * Generate analytics report
 */
export const generateReport = async (req, res) => {
  try {
    const { reportType, startDate, endDate, filters, format = 'json' } = req.body;
    
    const report = await analyticsService.generateReport({
      reportType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      filters,
      format
    });
    
    res.json(report);
  } catch (error) {
    logger.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
};

/**
 * Get AI-powered analytics insights
 */
export const getAIAnalytics = async (req, res) => {
  try {
    const { videoId, period = '30d', insights = ['engagement', 'performance'] } = req.query;
    
    const aiAnalytics = await analyticsService.getAIAnalytics({
      videoId,
      period,
      insights: Array.isArray(insights) ? insights : insights.split(',')
    });
    
    res.json(aiAnalytics);
  } catch (error) {
    logger.error('Error fetching AI analytics:', error);
    res.status(500).json({ error: 'Failed to fetch AI analytics' });
  }
};

/**
 * Get branching video analytics
 */
export const getBranchingAnalytics = async (req, res) => {
  try {
    const { branchingVideoId } = req.params;
    const { period = '30d', includePathAnalysis = true } = req.query;
    
    const branchingAnalytics = await analyticsService.getBranchingAnalytics({
      branchingVideoId,
      period,
      includePathAnalysis: includePathAnalysis === 'true'
    });
    
    res.json(branchingAnalytics);
  } catch (error) {
    logger.error('Error fetching branching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch branching analytics' });
  }
};

/**
 * Get dashboard data
 */
export const getDashboardData = async (req, res) => {
  try {
    const { userId } = req.query;
    const { period = '30d' } = req.query;
    
    // Get comprehensive dashboard data
    const [
      userAnalytics,
      videoAnalytics, 
      engagementAnalytics,
      systemAnalytics
    ] = await Promise.all([
      analyticsService.getUserAnalytics({ userId, period }),
      analyticsService.getVideoAnalytics({ userId, period }),
      analyticsService.getEngagementAnalytics({ userId, period }),
      analyticsService.getSystemAnalytics({ period })
    ]);
    
    const dashboardData = {
      user: userAnalytics,
      videos: videoAnalytics,
      engagement: engagementAnalytics,
      system: systemAnalytics,
      generatedAt: new Date().toISOString(),
      period
    };
    
    res.json({
      success: true,
      data: dashboardData,
      error: null
    });
  } catch (error) {
    logger.error('Error fetching dashboard data:', error);
    res.status(500).json({ 
      success: false,
      data: null,
      error: 'Failed to fetch dashboard data' 
    });
  }
};

/**
 * Get view history
 */
export const getViewHistory = async (req, res) => {
  try {
    const { userId } = req.query;
    const { period = '30d', limit = 50 } = req.query;
    
    const viewHistory = await analyticsService.getViewHistory({
      userId,
      period,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      data: viewHistory,
      error: null
    });
  } catch (error) {
    logger.error('Error fetching view history:', error);
    res.status(500).json({ 
      success: false,
      data: null,
      error: 'Failed to fetch view history' 
    });
  }
};

/**
 * Get engagement analytics
 */
export const getEngagementAnalytics = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { period = '30d' } = req.query;
    
    const engagement = await analyticsService.getEngagementAnalytics({
      videoId,
      period
    });
    
    res.json({
      success: true,
      data: engagement,
      error: null
    });
  } catch (error) {
    logger.error('Error fetching engagement analytics:', error);
    res.status(500).json({ 
      success: false,
      data: null,
      error: 'Failed to fetch engagement analytics' 
    });
  }
};

/**
 * Get popularity analytics
 */
export const getPopularityAnalytics = async (req, res) => {
  try {
    const { userId } = req.query;
    const { period = '30d', limit = 20 } = req.query;
    
    const popularity = await analyticsService.getPopularityAnalytics({
      userId,
      period,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      data: popularity,
      error: null
    });
  } catch (error) {
    logger.error('Error fetching popularity analytics:', error);
    res.status(500).json({ 
      success: false,
      data: null,
      error: 'Failed to fetch popularity analytics' 
    });
  }
};

/**
 * Get performance analytics
 */
export const getPerformanceAnalytics = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { period = '30d' } = req.query;
    
    const performance = await analyticsService.getPerformanceAnalytics({
      videoId,
      period
    });
    
    res.json({
      success: true,
      data: performance,
      error: null
    });
  } catch (error) {
    logger.error('Error fetching performance analytics:', error);
    res.status(500).json({ 
      success: false,
      data: null,
      error: 'Failed to fetch performance analytics' 
    });
  }
};

/**
 * Get sync analytics
 */
export const getSyncAnalytics = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.query;
    const { period = '30d' } = req.query;
    
    const syncAnalytics = await analyticsService.getSyncAnalytics({
      sessionId,
      userId,
      period
    });
    
    res.json({
      success: true,
      data: syncAnalytics,
      error: null
    });
  } catch (error) {
    logger.error('Error fetching sync analytics:', error);
    res.status(500).json({ 
      success: false,
      data: null,
      error: 'Failed to fetch sync analytics' 
    });
  }
};

/**
 * Get system analytics
 */
export const getSystemAnalytics = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    const systemAnalytics = await analyticsService.getSystemAnalytics({
      period
    });
    
    res.json({
      success: true,
      data: systemAnalytics,
      error: null
    });
  } catch (error) {
    logger.error('Error fetching system analytics:', error);
    res.status(500).json({ 
      success: false,
      data: null,
      error: 'Failed to fetch system analytics' 
    });
  }
};

/**
 * Get reports
 */
export const getReports = async (req, res) => {
  try {
    const { userId } = req.query;
    const { status, limit = 20 } = req.query;
    
    const reports = await analyticsService.getReports({
      userId,
      status,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      data: reports,
      error: null
    });
  } catch (error) {
    logger.error('Error fetching reports:', error);
    res.status(500).json({ 
      success: false,
      data: null,
      error: 'Failed to fetch reports' 
    });
  }
};

/**
 * Schedule report
 */
export const scheduleReport = async (req, res) => {
  try {
    const { type, schedule, recipients, userId } = req.body;
    
    const scheduledReport = await analyticsService.scheduleReport({
      type,
      schedule,
      recipients,
      userId
    });
    
    res.json({
      success: true,
      data: scheduledReport,
      error: null
    });
  } catch (error) {
    logger.error('Error scheduling report:', error);
    res.status(500).json({ 
      success: false,
      data: null,
      error: 'Failed to schedule report' 
    });
  }
};
