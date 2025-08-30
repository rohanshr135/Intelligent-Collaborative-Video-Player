import mongoose from 'mongoose';

const decisionPointSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  branchingVideoId: {
    type: String,
    required: true,
    ref: 'BranchingVideo'
  },
  timestamp: {
    type: Number,
    required: true,
    min: 0 // seconds
  },
  questionText: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  choices: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function(v) {
        return v && typeof v === 'object' && Object.keys(v).length > 0;
      },
      message: 'Choices must be a non-empty object'
    }
  },
  timeoutSeconds: {
    type: Number,
    default: 10,
    min: 1,
    max: 300
  },
  defaultChoice: {
    type: String,
    default: null
  },
  displayStyle: {
    type: String,
    enum: ['overlay', 'pause', 'sidebar', 'bottom'],
    default: 'overlay'
  },
  transitionEffect: {
    type: String,
    enum: ['fade', 'slide', 'zoom', 'none'],
    default: 'fade'
  },
  analytics: {
    totalInteractions: {
      type: Number,
      default: 0
    },
    choiceStats: {
      type: Map,
      of: {
        count: Number,
        percentage: Number
      },
      default: new Map()
    },
    averageDecisionTime: {
      type: Number,
      default: 0
    },
    timeoutCount: {
      type: Number,
      default: 0
    }
  },
  metadata: {
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium'
    },
    tags: [{
      type: String,
      trim: true
    }],
    category: {
      type: String,
      default: 'story'
    },
    consequences: {
      type: String,
      maxlength: 1000,
      default: ''
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
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
decisionPointSchema.index({ branchingVideoId: 1, order: 1 });
decisionPointSchema.index({ isActive: 1 });
decisionPointSchema.index({ 'metadata.category': 1 });

// Compound unique index to prevent duplicate decision points at same timestamp
decisionPointSchema.index({ branchingVideoId: 1, timestamp: 1 }, { unique: true });

// Virtual for user choice count
decisionPointSchema.virtual('choiceCount', {
  ref: 'UserChoice',
  localField: '_id',
  foreignField: 'decisionPointId',
  count: true
});

// Virtual for formatted timestamp
decisionPointSchema.virtual('formattedTimestamp').get(function() {
  const minutes = Math.floor(this.timestamp / 60);
  const seconds = Math.floor(this.timestamp % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Method to validate choices structure
decisionPointSchema.methods.validateChoices = function() {
  try {
    const choices = this.choices;
    
    if (!choices || typeof choices !== 'object') {
      return { valid: false, error: 'Choices must be an object' };
    }
    
    const choiceKeys = Object.keys(choices);
    if (choiceKeys.length < 2) {
      return { valid: false, error: 'Must have at least 2 choices' };
    }
    
    for (const [key, value] of Object.entries(choices)) {
      if (!value.label || !value.nextVideoId) {
        return { valid: false, error: `Choice '${key}' must have label and nextVideoId` };
      }
    }
    
    // Validate default choice exists
    if (this.defaultChoice && !choices[this.defaultChoice]) {
      return { valid: false, error: 'Default choice must be one of the available choices' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

// Method to record choice analytics
decisionPointSchema.methods.recordChoice = function(choice, decisionTime = null) {
  this.analytics.totalInteractions += 1;
  
  // Update choice statistics
  if (!this.analytics.choiceStats.has(choice)) {
    this.analytics.choiceStats.set(choice, { count: 0, percentage: 0 });
  }
  
  const choiceData = this.analytics.choiceStats.get(choice);
  choiceData.count += 1;
  this.analytics.choiceStats.set(choice, choiceData);
  
  // Recalculate percentages
  this.analytics.choiceStats.forEach((data, key) => {
    data.percentage = (data.count / this.analytics.totalInteractions) * 100;
    this.analytics.choiceStats.set(key, data);
  });
  
  // Update average decision time
  if (decisionTime) {
    const currentAvg = this.analytics.averageDecisionTime;
    const interactions = this.analytics.totalInteractions;
    this.analytics.averageDecisionTime = ((currentAvg * (interactions - 1)) + decisionTime) / interactions;
  }
  
  return this.save();
};

// Method to record timeout
decisionPointSchema.methods.recordTimeout = function() {
  this.analytics.timeoutCount += 1;
  this.analytics.totalInteractions += 1;
  
  // If there's a default choice, record it
  if (this.defaultChoice) {
    this.recordChoice(this.defaultChoice, this.timeoutSeconds * 1000);
  }
  
  return this.save();
};

// Method to get choice statistics
decisionPointSchema.methods.getChoiceStatistics = function() {
  const stats = {};
  
  this.analytics.choiceStats.forEach((data, choice) => {
    stats[choice] = {
      count: data.count,
      percentage: data.percentage.toFixed(1)
    };
  });
  
  return {
    totalInteractions: this.analytics.totalInteractions,
    choices: stats,
    averageDecisionTime: this.analytics.averageDecisionTime,
    timeoutRate: ((this.analytics.timeoutCount / this.analytics.totalInteractions) * 100).toFixed(1)
  };
};

// Pre-save middleware
decisionPointSchema.pre('save', function(next) {
  // Validate choices before saving
  const validation = this.validateChoices();
  if (!validation.valid) {
    return next(new Error(validation.error));
  }
  
  next();
});

export const DecisionPoint = mongoose.model('DecisionPoint', decisionPointSchema);
