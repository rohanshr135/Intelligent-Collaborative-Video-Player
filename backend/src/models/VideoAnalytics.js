import mongoose from 'mongoose';

const videoAnalyticsSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    index: true
  },
  videoId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  sessionStart: {
    type: Date,
    default: Date.now
  },
  sessionEnd: Date,
  totalWatchTime: {
    type: Number,
    default: 0
  },
  playCount: {
    type: Number,
    default: 0
  },
  pauseCount: {
    type: Number,
    default: 0
  },
  seekCount: {
    type: Number,
    default: 0
  },
  branchChoices: [{
    branchId: String,
    choiceId: String,
    timestamp: Date
  }],
  notesAdded: {
    type: Number,
    default: 0
  },
  chatMessages: {
    type: Number,
    default: 0
  },
  summaryRequests: {
    type: Number,
    default: 0
  },
  watchPositions: [{
    timestamp: Number,
    watchedAt: Date
  }],
  completionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  }
}, {
  timestamps: true
});

// Compound indexes
videoAnalyticsSchema.index({ roomCode: 1, userId: 1, sessionStart: -1 });
videoAnalyticsSchema.index({ videoId: 1, sessionStart: -1 });

export const VideoAnalytics = mongoose.model('VideoAnalytics', videoAnalyticsSchema);
