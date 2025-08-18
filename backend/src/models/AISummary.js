import mongoose from 'mongoose';

const aiSummarySchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  videoId: {
    type: String,
    required: true,
    ref: 'Video'
  },
  startTimestamp: {
    type: Number,
    required: true,
    min: 0 // seconds
  },
  endTimestamp: {
    type: Number,
    required: true,
    min: 0 // seconds
  },
  summaryText: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  summaryType: {
    type: String,
    enum: ['pause', 'segment', 'full', 'chapter', 'highlight', 'auto'],
    required: true,
    default: 'segment'
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  modelUsed: {
    type: String,
    default: 'gemini-pro'
  },
  cacheExpires: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  },
  language: {
    type: String,
    default: 'en',
    match: /^[a-z]{2}$/
  },
  wordCount: {
    type: Number,
    default: 0
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: null
  },
  metadata: {
    promptUsed: {
      type: String,
      default: null
    },
    processingTime: {
      type: Number, // milliseconds
      default: null
    },
    tokenCount: {
      input: Number,
      output: Number,
      total: Number
    },
    keyTopics: [{
      topic: String,
      relevance: {
        type: Number,
        min: 0,
        max: 1
      }
    }],
    sentiment: {
      type: String,
      enum: ['positive', 'negative', 'neutral', 'mixed'],
      default: 'neutral'
    },
    sentimentScore: {
      type: Number,
      min: -1,
      max: 1,
      default: 0
    },
    readabilityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    }
  },
  sourceTranscript: {
    type: String,
    default: null
  },
  bulletPoints: [{
    type: String,
    trim: true
  }],
  keyQuotes: [{
    text: {
      type: String,
      required: true
    },
    timestamp: {
      type: Number,
      required: true
    },
    speaker: {
      type: String,
      default: null
    },
    importance: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5
    }
  }],
  relatedSummaries: [{
    type: String,
    ref: 'AISummary'
  }],
  interactions: {
    views: {
      type: Number,
      default: 0
    },
    likes: {
      type: Number,
      default: 0
    },
    dislikes: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  generatedFor: {
    type: String,
    ref: 'User',
    default: null
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
aiSummarySchema.index({ videoId: 1, startTimestamp: 1, endTimestamp: 1 });
aiSummarySchema.index({ summaryType: 1 });
aiSummarySchema.index({ generatedAt: -1 });
aiSummarySchema.index({ cacheExpires: 1 }, { expireAfterSeconds: 0 });
aiSummarySchema.index({ modelUsed: 1 });
aiSummarySchema.index({ isActive: 1, isPublic: 1 });
aiSummarySchema.index({ 'interactions.views': -1 });

// Text index for search
aiSummarySchema.index({ 
  summaryText: 'text', 
  bulletPoints: 'text',
  'keyQuotes.text': 'text',
  'metadata.keyTopics.topic': 'text'
});

// Compound index for cache lookups
aiSummarySchema.index({ 
  videoId: 1, 
  summaryType: 1, 
  startTimestamp: 1, 
  endTimestamp: 1,
  isActive: 1 
});

// Virtual for duration covered
aiSummarySchema.virtual('duration').get(function() {
  return this.endTimestamp - this.startTimestamp;
});

// Virtual for formatted time range
aiSummarySchema.virtual('timeRange').get(function() {
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };
  
  return {
    start: formatTime(this.startTimestamp),
    end: formatTime(this.endTimestamp),
    duration: formatTime(this.duration)
  };
});

// Virtual for engagement score
aiSummarySchema.virtual('engagementScore').get(function() {
  const total = this.interactions.views + this.interactions.likes + this.interactions.shares;
  const negative = this.interactions.dislikes;
  return Math.max(total - negative, 0);
});

// Virtual for cache status
aiSummarySchema.virtual('cacheStatus').get(function() {
  const now = new Date();
  if (now > this.cacheExpires) return 'expired';
  
  const hoursUntilExpiry = (this.cacheExpires.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilExpiry < 24) return 'expiring_soon';
  
  return 'valid';
});

// Method to check if summary is expired
aiSummarySchema.methods.isExpired = function() {
  return new Date() > this.cacheExpires;
};

// Method to extend cache expiration
aiSummarySchema.methods.extendCache = function(additionalDays = 7) {
  this.cacheExpires = new Date(Date.now() + additionalDays * 24 * 60 * 60 * 1000);
  return this.save();
};

// Method to extract bullet points from summary
aiSummarySchema.methods.extractBulletPoints = function() {
  if (this.bulletPoints && this.bulletPoints.length > 0) {
    return this.bulletPoints;
  }
  
  // Extract from summary text
  const lines = this.summaryText.split('\n');
  const bullets = lines
    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().startsWith('*'))
    .map(line => line.trim().replace(/^[-•*]\s*/, ''))
    .filter(line => line.length > 0);
  
  if (bullets.length > 0) {
    this.bulletPoints = bullets;
    this.save();
  }
  
  return bullets;
};

// Method to add key quote
aiSummarySchema.methods.addKeyQuote = function(text, timestamp, speaker = null, importance = 0.5) {
  const quote = {
    text: text.trim(),
    timestamp,
    speaker,
    importance
  };
  
  this.keyQuotes.push(quote);
  
  // Keep only top 10 quotes by importance
  if (this.keyQuotes.length > 10) {
    this.keyQuotes.sort((a, b) => b.importance - a.importance);
    this.keyQuotes = this.keyQuotes.slice(0, 10);
  }
  
  return this.save();
};

// Method to increment view count
aiSummarySchema.methods.incrementViews = function() {
  this.interactions.views += 1;
  return this.save();
};

// Method to toggle like/dislike
aiSummarySchema.methods.toggleReaction = function(isLike = true) {
  if (isLike) {
    this.interactions.likes += 1;
  } else {
    this.interactions.dislikes += 1;
  }
  return this.save();
};

// Method to calculate readability score
aiSummarySchema.methods.calculateReadability = function() {
  const text = this.summaryText;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const syllables = words.reduce((count, word) => {
    return count + this.countSyllables(word);
  }, 0);
  
  if (sentences.length === 0 || words.length === 0) return 0;
  
  // Flesch Reading Ease Score
  const score = 206.835 - (1.015 * (words.length / sentences.length)) - (84.6 * (syllables / words.length));
  
  this.metadata.readabilityScore = Math.max(0, Math.min(100, score));
  return this.metadata.readabilityScore;
};

// Helper method to count syllables
aiSummarySchema.methods.countSyllables = function(word) {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;
  
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
};

// Static method to find overlapping summaries
aiSummarySchema.statics.findOverlapping = async function(videoId, startTime, endTime) {
  return this.find({
    videoId,
    isActive: true,
    $or: [
      {
        $and: [
          { startTimestamp: { $lte: startTime } },
          { endTimestamp: { $gte: startTime } }
        ]
      },
      {
        $and: [
          { startTimestamp: { $lte: endTime } },
          { endTimestamp: { $gte: endTime } }
        ]
      },
      {
        $and: [
          { startTimestamp: { $gte: startTime } },
          { endTimestamp: { $lte: endTime } }
        ]
      }
    ]
  }).sort({ startTimestamp: 1 });
};

// Static method to get summary for specific timestamp
aiSummarySchema.statics.getSummaryAtTimestamp = async function(videoId, timestamp, summaryType = 'pause') {
  return this.findOne({
    videoId,
    summaryType,
    startTimestamp: { $lte: timestamp },
    endTimestamp: { $gte: timestamp },
    isActive: true,
    cacheExpires: { $gt: new Date() }
  }).sort({ generatedAt: -1 });
};

// Static method to cleanup expired summaries
aiSummarySchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    cacheExpires: { $lt: new Date() },
    isActive: true
  });
  
  return result.deletedCount;
};

// Pre-save middleware
aiSummarySchema.pre('save', function(next) {
  // Calculate word count
  if (this.isModified('summaryText')) {
    this.wordCount = this.summaryText.split(/\s+/).filter(word => word.length > 0).length;
  }
  
  // Validate timestamp order
  if (this.startTimestamp >= this.endTimestamp) {
    return next(new Error('Start timestamp must be less than end timestamp'));
  }
  
  // Set default cache expiration based on summary type
  if (this.isNew && !this.cacheExpires) {
    const expirationMap = {
      'pause': 1, // 1 day
      'segment': 7, // 7 days
      'full': 30, // 30 days
      'chapter': 14, // 14 days
      'highlight': 7, // 7 days
      'auto': 3 // 3 days
    };
    
    const days = expirationMap[this.summaryType] || 7;
    this.cacheExpires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
  
  next();
});

export const AISummary = mongoose.model('AISummary', aiSummarySchema);
