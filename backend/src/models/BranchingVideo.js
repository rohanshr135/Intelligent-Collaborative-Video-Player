import mongoose from 'mongoose';

const branchingVideoSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  parentVideoId: {
    type: String,
    required: true,
    ref: 'Video'
  },
  branchStructure: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function(v) {
        return v && typeof v === 'object';
      },
      message: 'Branch structure must be a valid object'
    }
  },
  createdBy: {
    type: String,
    required: true,
    ref: 'User'
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date,
    default: null
  },
  version: {
    type: Number,
    default: 1
  },
  category: {
    type: String,
    default: 'interactive'
  },
  tags: [{
    type: String,
    trim: true
  }],
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  estimatedPlaytime: {
    type: Number, // minutes
    default: null
  },
  completionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  analytics: {
    totalViews: {
      type: Number,
      default: 0
    },
    uniqueViewers: {
      type: Number,
      default: 0
    },
    averageCompletionTime: {
      type: Number,
      default: 0
    },
    mostPopularPath: {
      type: [String],
      default: []
    },
    abandonmentPoints: [{
      timestamp: Number,
      count: Number
    }]
  },
  settings: {
    allowSkipping: {
      type: Boolean,
      default: true
    },
    showProgress: {
      type: Boolean,
      default: true
    },
    enableAnalytics: {
      type: Boolean,
      default: true
    },
    maxReplayCount: {
      type: Number,
      default: null
    }
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
branchingVideoSchema.index({ parentVideoId: 1 });
branchingVideoSchema.index({ createdBy: 1, createdAt: -1 });
branchingVideoSchema.index({ isPublished: 1, isActive: 1 });
branchingVideoSchema.index({ category: 1 });
branchingVideoSchema.index({ tags: 1 });
branchingVideoSchema.index({ 'analytics.totalViews': -1 });

// Virtual for decision point count
branchingVideoSchema.virtual('decisionPointCount', {
  ref: 'DecisionPoint',
  localField: '_id',
  foreignField: 'branchingVideoId',
  count: true
});

// Virtual for formatted completion rate
branchingVideoSchema.virtual('formattedCompletionRate').get(function() {
  return `${this.completionRate.toFixed(1)}%`;
});

// Method to validate branch structure
branchingVideoSchema.methods.validateBranchStructure = function() {
  try {
    const structure = this.branchStructure;
    
    // Check if structure has required properties
    if (!structure.startPoint || !structure.branches) {
      return { valid: false, error: 'Missing required properties: startPoint, branches' };
    }
    
    // Validate branches format
    for (const [timestamp, branch] of Object.entries(structure.branches)) {
      if (!branch.choices || !Array.isArray(branch.choices)) {
        return { valid: false, error: `Invalid choices format at timestamp ${timestamp}` };
      }
      
      for (const choice of branch.choices) {
        if (!choice.label || !choice.nextVideoId) {
          return { valid: false, error: `Invalid choice format at timestamp ${timestamp}` };
        }
      }
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

// Method to get next video options at timestamp
branchingVideoSchema.methods.getChoicesAtTimestamp = function(timestamp) {
  const structure = this.branchStructure;
  
  if (!structure.branches || !structure.branches[timestamp]) {
    return null;
  }
  
  return structure.branches[timestamp];
};

// Method to increment view count
branchingVideoSchema.methods.incrementView = function(isUniqueViewer = false) {
  this.analytics.totalViews += 1;
  
  if (isUniqueViewer) {
    this.analytics.uniqueViewers += 1;
  }
  
  return this.save();
};

// Method to update completion analytics
branchingVideoSchema.methods.updateCompletionAnalytics = function(completionTime, choicePath) {
  // Update average completion time
  const currentAvg = this.analytics.averageCompletionTime;
  const viewCount = this.analytics.totalViews;
  this.analytics.averageCompletionTime = ((currentAvg * (viewCount - 1)) + completionTime) / viewCount;
  
  // Update completion rate
  if (completionTime > 0) {
    this.completionRate = ((this.completionRate * (viewCount - 1)) + 100) / viewCount;
  }
  
  // Update most popular path
  if (choicePath && choicePath.length > 0) {
    this.analytics.mostPopularPath = choicePath;
  }
  
  return this.save();
};

// Pre-save middleware
branchingVideoSchema.pre('save', function(next) {
  if (this.isModified('isPublished') && this.isPublished && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

export const BranchingVideo = mongoose.model('BranchingVideo', branchingVideoSchema);
export default BranchingVideo;
