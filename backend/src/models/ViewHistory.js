import mongoose from 'mongoose';

const viewHistorySchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  userId: {
    type: String,
    ref: 'User',
    default: null
  },
  videoId: {
    type: String,
    required: true,
    ref: 'Video'
  },
  watchDuration: {
    type: Number,
    required: true,
    min: 0 // seconds
  },
  lastPosition: {
    type: Number,
    required: true,
    min: 0 // seconds
  },
  completed: {
    type: Boolean,
    default: false
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  deviceInfo: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      userAgent: null,
      platform: null,
      browser: null,
      screenResolution: null,
      deviceType: 'unknown'
    }
  },
  sessionId: {
    type: String,
    ref: 'SyncSession',
    default: null
  },
  watchedSegments: [{
    start: {
      type: Number,
      required: true
    },
    end: {
      type: Number,
      required: true
    },
    watchedAt: {
      type: Date,
      default: Date.now
    }
  }],
  interactions: [{
    type: {
      type: String,
      enum: ['play', 'pause', 'seek', 'volume', 'fullscreen', 'speed', 'quality'],
      required: true
    },
    timestamp: {
      type: Number,
      required: true
    },
    value: mongoose.Schema.Types.Mixed,
    occurredAt: {
      type: Date,
      default: Date.now
    }
  }],
  playbackSettings: {
    volume: {
      type: Number,
      default: 1.0,
      min: 0,
      max: 1
    },
    playbackRate: {
      type: Number,
      default: 1.0,
      min: 0.25,
      max: 3.0
    },
    quality: {
      type: String,
      default: 'auto'
    },
    subtitles: {
      enabled: {
        type: Boolean,
        default: false
      },
      language: {
        type: String,
        default: 'en'
      }
    }
  },
  analytics: {
    pauseCount: {
      type: Number,
      default: 0
    },
    seekCount: {
      type: Number,
      default: 0
    },
    replayCount: {
      type: Number,
      default: 0
    },
    averagePlaybackRate: {
      type: Number,
      default: 1.0
    },
    engagementScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  referrer: {
    type: String,
    default: null
  },
  watchSource: {
    type: String,
    enum: ['direct', 'shared', 'embed', 'search', 'recommendation'],
    default: 'direct'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for performance
viewHistorySchema.index({ userId: 1, lastUpdated: -1 });
viewHistorySchema.index({ videoId: 1, createdAt: -1 });
viewHistorySchema.index({ userId: 1, videoId: 1 }, { unique: true, sparse: true });
viewHistorySchema.index({ completed: 1 });
viewHistorySchema.index({ sessionId: 1 });
viewHistorySchema.index({ startedAt: -1 });
viewHistorySchema.index({ 'analytics.engagementScore': -1 });

// Virtual for completion percentage
viewHistorySchema.virtual('completionPercentage').get(function() {
  if (!this.populated('videoId') && !this.videoId.duration) {
    return 0;
  }
  const videoDuration = this.videoId.duration || this.lastPosition + 60; // Fallback estimate
  return Math.min((this.lastPosition / videoDuration) * 100, 100);
});

// Virtual for watch ratio
viewHistorySchema.virtual('watchRatio').get(function() {
  if (!this.populated('videoId') && !this.videoId.duration) {
    return 0;
  }
  const videoDuration = this.videoId.duration || this.watchDuration + 60; // Fallback estimate
  return Math.min(this.watchDuration / videoDuration, 1);
});

// Virtual for total watched time from segments
viewHistorySchema.virtual('totalWatchedTime').get(function() {
  if (!this.watchedSegments || this.watchedSegments.length === 0) {
    return this.watchDuration;
  }
  
  return this.watchedSegments.reduce((total, segment) => {
    return total + (segment.end - segment.start);
  }, 0);
});

// Method to update watch progress
viewHistorySchema.methods.updateProgress = function(currentPosition, isPlaying = false) {
  const previousPosition = this.lastPosition;
  this.lastPosition = currentPosition;
  this.lastUpdated = new Date();
  
  // Update watch duration if moving forward
  if (currentPosition > previousPosition) {
    this.watchDuration += (currentPosition - previousPosition);
  }
  
  // Add watched segment
  if (currentPosition > previousPosition && currentPosition - previousPosition <= 30) {
    this.addWatchedSegment(previousPosition, currentPosition);
  }
  
  // Check if completed (90% threshold)
  if (this.populated('videoId') && this.videoId.duration) {
    const completionThreshold = this.videoId.duration * 0.9;
    if (currentPosition >= completionThreshold && !this.completed) {
      this.completed = true;
      this.analytics.engagementScore = this.calculateEngagementScore();
    }
  }
  
  return this;
};

// Method to add watched segment
viewHistorySchema.methods.addWatchedSegment = function(start, end) {
  // Merge overlapping segments
  const newSegment = { start, end, watchedAt: new Date() };
  
  // Check for overlaps and merge
  let merged = false;
  for (let i = 0; i < this.watchedSegments.length; i++) {
    const segment = this.watchedSegments[i];
    
    if (start <= segment.end && end >= segment.start) {
      // Overlapping segments, merge them
      segment.start = Math.min(segment.start, start);
      segment.end = Math.max(segment.end, end);
      segment.watchedAt = new Date();
      merged = true;
      break;
    }
  }
  
  if (!merged) {
    this.watchedSegments.push(newSegment);
  }
  
  // Keep segments sorted by start time
  this.watchedSegments.sort((a, b) => a.start - b.start);
  
  // Limit to last 100 segments to prevent unbounded growth
  if (this.watchedSegments.length > 100) {
    this.watchedSegments = this.watchedSegments.slice(-100);
  }
  
  return this;
};

// Method to record interaction
viewHistorySchema.methods.recordInteraction = function(type, timestamp, value = null) {
  this.interactions.push({
    type,
    timestamp,
    value,
    occurredAt: new Date()
  });
  
  // Update analytics based on interaction type
  switch (type) {
    case 'pause':
      this.analytics.pauseCount++;
      break;
    case 'seek':
      this.analytics.seekCount++;
      break;
    case 'speed':
      if (value) {
        const currentAvg = this.analytics.averagePlaybackRate;
        const interactionCount = this.interactions.filter(i => i.type === 'speed').length;
        this.analytics.averagePlaybackRate = ((currentAvg * (interactionCount - 1)) + value) / interactionCount;
      }
      break;
  }
  
  // Limit interactions to last 200 to prevent unbounded growth
  if (this.interactions.length > 200) {
    this.interactions = this.interactions.slice(-200);
  }
  
  this.lastUpdated = new Date();
  return this;
};

// Method to calculate engagement score
viewHistorySchema.methods.calculateEngagementScore = function() {
  let score = 0;
  
  // Base score from completion percentage
  score += this.completionPercentage * 0.4;
  
  // Interaction engagement (more interactions = higher engagement, but with diminishing returns)
  const interactionScore = Math.min(this.interactions.length * 2, 20);
  score += interactionScore;
  
  // Penalize excessive pausing (might indicate disinterest)
  const pausePenalty = Math.min(this.analytics.pauseCount * 2, 15);
  score = Math.max(score - pausePenalty, 0);
  
  // Bonus for completion
  if (this.completed) {
    score += 15;
  }
  
  // Normalize to 0-100 range
  return Math.min(Math.round(score), 100);
};

// Method to get watch statistics
viewHistorySchema.methods.getWatchStatistics = function() {
  return {
    totalWatchTime: this.totalWatchedTime,
    completionPercentage: this.completionPercentage,
    watchRatio: this.watchRatio,
    engagementScore: this.analytics.engagementScore,
    interactions: {
      total: this.interactions.length,
      pauses: this.analytics.pauseCount,
      seeks: this.analytics.seekCount,
      replays: this.analytics.replayCount
    },
    playbackSettings: this.playbackSettings,
    watchedSegments: this.watchedSegments.length,
    sessionDuration: this.lastUpdated.getTime() - this.startedAt.getTime()
  };
};

// Static method to get user's watch summary
viewHistorySchema.statics.getUserWatchSummary = async function(userId, limit = 10) {
  const pipeline = [
    { $match: { userId, isActive: true } },
    { $sort: { lastUpdated: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'videos',
        localField: 'videoId',
        foreignField: '_id',
        as: 'video'
      }
    },
    { $unwind: '$video' },
    {
      $project: {
        videoId: 1,
        videoTitle: '$video.title',
        lastPosition: 1,
        watchDuration: 1,
        completed: 1,
        completionPercentage: {
          $multiply: [
            { $divide: ['$lastPosition', '$video.duration'] },
            100
          ]
        },
        lastUpdated: 1,
        engagementScore: '$analytics.engagementScore'
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Pre-save middleware
viewHistorySchema.pre('save', function(next) {
  // Update engagement score if this is a significant update
  if (this.isModified('lastPosition') || this.isModified('interactions')) {
    this.analytics.engagementScore = this.calculateEngagementScore();
  }
  
  // Update lastUpdated timestamp
  this.lastUpdated = new Date();
  
  next();
});

export const ViewHistory = mongoose.model('ViewHistory', viewHistorySchema);
export default ViewHistory;
