import mongoose from 'mongoose';

const sceneMarkerSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  videoId: {
    type: String,
    required: true,
    ref: 'Video'
  },
  timestamp: {
    type: Number,
    required: true,
    min: 0 // seconds
  },
  label: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },
  markerType: {
    type: String,
    enum: ['chapter', 'important', 'edit', 'ai_detected', 'bookmark', 'note', 'highlight'],
    required: true,
    default: 'bookmark'
  },
  createdBy: {
    type: String,
    required: true,
    ref: 'User'
  },
  confidenceScore: {
    type: Number,
    min: 0,
    max: 1,
    default: null // Only for AI-detected markers
  },
  color: {
    type: String,
    default: '#3B82F6', // Blue
    match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
  },
  icon: {
    type: String,
    default: 'bookmark',
    enum: ['bookmark', 'star', 'flag', 'note', 'chapter', 'highlight', 'edit', 'ai']
  },
  metadata: {
    aiModel: {
      type: String,
      default: null
    },
    detectionMethod: {
      type: String,
      enum: ['manual', 'transcript', 'visual', 'audio', 'motion', 'scene_change'],
      default: 'manual'
    },
    keywords: [{
      type: String,
      trim: true
    }],
    emotions: [{
      emotion: {
        type: String,
        enum: ['happy', 'sad', 'angry', 'surprised', 'neutral', 'excited', 'calm']
      },
      confidence: {
        type: Number,
        min: 0,
        max: 1
      }
    }],
    transcriptText: {
      type: String,
      default: null
    },
    audioFeatures: {
      volume: Number,
      pitch: Number,
      tempo: Number,
      energy: Number
    },
    visualFeatures: {
      brightness: Number,
      contrast: Number,
      colorDominance: [String],
      motionIntensity: Number
    }
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'shared'],
    default: 'private'
  },
  sharedWith: [{
    type: String,
    ref: 'User'
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
    bookmarks: {
      type: Number,
      default: 0
    }
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  parentMarkerId: {
    type: String,
    ref: 'SceneMarker',
    default: null // For hierarchical markers
  },
  duration: {
    type: Number,
    default: null // For markers that span a duration
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
sceneMarkerSchema.index({ videoId: 1, timestamp: 1 });
sceneMarkerSchema.index({ createdBy: 1, createdAt: -1 });
sceneMarkerSchema.index({ markerType: 1 });
sceneMarkerSchema.index({ visibility: 1 });
sceneMarkerSchema.index({ tags: 1 });
sceneMarkerSchema.index({ isActive: 1 });
sceneMarkerSchema.index({ 'interactions.views': -1 });

// Text index for search
sceneMarkerSchema.index({ 
  label: 'text', 
  description: 'text', 
  'metadata.keywords': 'text',
  'metadata.transcriptText': 'text'
});

// Compound index for video timeline queries
sceneMarkerSchema.index({ videoId: 1, timestamp: 1, isActive: 1 });

// Virtual for formatted timestamp
sceneMarkerSchema.virtual('formattedTimestamp').get(function() {
  const hours = Math.floor(this.timestamp / 3600);
  const minutes = Math.floor((this.timestamp % 3600) / 60);
  const seconds = Math.floor(this.timestamp % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Virtual for engagement score
sceneMarkerSchema.virtual('engagementScore').get(function() {
  const total = this.interactions.views + this.interactions.likes + this.interactions.bookmarks;
  const negative = this.interactions.dislikes;
  return Math.max(total - negative, 0);
});

// Virtual for marker range (if duration is set)
sceneMarkerSchema.virtual('timeRange').get(function() {
  if (!this.duration) {
    return { start: this.timestamp, end: this.timestamp };
  }
  return {
    start: this.timestamp,
    end: this.timestamp + this.duration
  };
});

// Method to check if marker is AI-generated
sceneMarkerSchema.methods.isAIGenerated = function() {
  return this.markerType === 'ai_detected' || 
         (this.metadata && this.metadata.detectionMethod !== 'manual');
};

// Method to get confidence level as text
sceneMarkerSchema.methods.getConfidenceLevel = function() {
  if (!this.confidenceScore) return 'unknown';
  
  if (this.confidenceScore >= 0.8) return 'high';
  if (this.confidenceScore >= 0.6) return 'medium';
  if (this.confidenceScore >= 0.4) return 'low';
  return 'very_low';
};

// Method to increment view count
sceneMarkerSchema.methods.incrementViews = function() {
  this.interactions.views += 1;
  return this.save();
};

// Method to toggle like
sceneMarkerSchema.methods.toggleLike = function(isLike = true) {
  if (isLike) {
    this.interactions.likes += 1;
  } else {
    this.interactions.dislikes += 1;
  }
  return this.save();
};

// Method to add bookmark
sceneMarkerSchema.methods.addBookmark = function() {
  this.interactions.bookmarks += 1;
  return this.save();
};

// Method to check if user can edit marker
sceneMarkerSchema.methods.canEdit = function(userId) {
  return this.createdBy === userId || 
         this.sharedWith.includes(userId) ||
         this.visibility === 'public';
};

// Method to share with user
sceneMarkerSchema.methods.shareWithUser = function(userId) {
  if (!this.sharedWith.includes(userId)) {
    this.sharedWith.push(userId);
  }
  return this.save();
};

// Method to get similar markers
sceneMarkerSchema.methods.findSimilarMarkers = async function(limit = 5) {
  const pipeline = [
    {
      $match: {
        _id: { $ne: this._id },
        videoId: this.videoId,
        isActive: true,
        $or: [
          { markerType: this.markerType },
          { tags: { $in: this.tags } },
          { 'metadata.keywords': { $in: this.metadata.keywords || [] } }
        ]
      }
    },
    {
      $addFields: {
        timestampDiff: { $abs: { $subtract: ['$timestamp', this.timestamp] } },
        tagOverlap: {
          $size: {
            $setIntersection: ['$tags', this.tags]
          }
        }
      }
    },
    {
      $sort: {
        tagOverlap: -1,
        timestampDiff: 1
      }
    },
    { $limit: limit }
  ];
  
  return this.constructor.aggregate(pipeline);
};

// Static method to get markers for video timeline
sceneMarkerSchema.statics.getVideoTimeline = async function(videoId, options = {}) {
  const {
    markerTypes = [],
    userId = null,
    includePrivate = false,
    startTime = 0,
    endTime = null
  } = options;
  
  const match = {
    videoId,
    isActive: true,
    timestamp: { $gte: startTime }
  };
  
  if (endTime) {
    match.timestamp.$lte = endTime;
  }
  
  if (markerTypes.length > 0) {
    match.markerType = { $in: markerTypes };
  }
  
  if (!includePrivate) {
    match.$or = [
      { visibility: 'public' },
      { createdBy: userId },
      { sharedWith: userId }
    ];
  }
  
  return this.find(match)
    .sort({ timestamp: 1 })
    .populate('createdBy', 'username avatarUrl')
    .lean();
};

// Static method to get popular markers
sceneMarkerSchema.statics.getPopularMarkers = async function(videoId, limit = 10) {
  return this.find({
    videoId,
    visibility: 'public',
    isActive: true
  })
  .sort({ 
    'interactions.views': -1,
    'interactions.likes': -1,
    'interactions.bookmarks': -1
  })
  .limit(limit)
  .populate('createdBy', 'username avatarUrl')
  .lean();
};

// Static method to get AI-suggested markers
sceneMarkerSchema.statics.getAISuggestedMarkers = async function(videoId, minConfidence = 0.6) {
  return this.find({
    videoId,
    markerType: 'ai_detected',
    confidenceScore: { $gte: minConfidence },
    isActive: true
  })
  .sort({ confidenceScore: -1, timestamp: 1 })
  .lean();
};

// Pre-save middleware
sceneMarkerSchema.pre('save', function(next) {
  // Validate marker type and set appropriate defaults
  if (this.markerType === 'ai_detected' && !this.confidenceScore) {
    this.confidenceScore = 0.5; // Default medium confidence
  }
  
  // Set appropriate icon based on marker type
  if (this.isNew && this.icon === 'bookmark') {
    const iconMap = {
      'chapter': 'chapter',
      'important': 'star',
      'edit': 'edit',
      'ai_detected': 'ai',
      'highlight': 'highlight',
      'note': 'note'
    };
    this.icon = iconMap[this.markerType] || 'bookmark';
  }
  
  // Clean up tags
  if (this.tags && this.tags.length > 0) {
    this.tags = this.tags
      .map(tag => tag.toLowerCase().trim())
      .filter(tag => tag.length > 0)
      .slice(0, 10); // Limit to 10 tags
  }
  
  next();
});

export const SceneMarker = mongoose.model('SceneMarker', sceneMarkerSchema);
export default SceneMarker;
