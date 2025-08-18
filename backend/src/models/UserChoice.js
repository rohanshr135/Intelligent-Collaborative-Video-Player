import mongoose from 'mongoose';

const userChoiceSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  userId: {
    type: String,
    ref: 'User',
    default: null
  },
  decisionPointId: {
    type: String,
    required: true,
    ref: 'DecisionPoint'
  },
  choiceMade: {
    type: String,
    required: true,
    trim: true
  },
  sessionId: {
    type: String,
    ref: 'SyncSession',
    default: null
  },
  deviceId: {
    type: String,
    default: null
  },
  decisionTime: {
    type: Number, // milliseconds taken to make the decision
    default: null
  },
  wasTimeout: {
    type: Boolean,
    default: false
  },
  previousChoices: [{
    decisionPointId: {
      type: String,
      ref: 'DecisionPoint'
    },
    choice: String,
    timestamp: Date
  }],
  metadata: {
    userAgent: {
      type: String,
      default: null
    },
    ipAddress: {
      type: String,
      default: null
    },
    viewportSize: {
      width: Number,
      height: Number
    },
    deviceType: {
      type: String,
      enum: ['desktop', 'tablet', 'mobile', 'tv', 'unknown'],
      default: 'unknown'
    },
    referrer: {
      type: String,
      default: null
    }
  },
  analytics: {
    timeSpentOnQuestion: {
      type: Number, // seconds
      default: 0
    },
    hoverEvents: [{
      choice: String,
      duration: Number, // milliseconds
      timestamp: Date
    }],
    clickEvents: [{
      choice: String,
      timestamp: Date,
      wasAccidental: Boolean
    }]
  },
  isValid: {
    type: Boolean,
    default: true
  },
  validationNotes: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      ret.timestamp = ret.createdAt; // Alias for compatibility
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for performance
userChoiceSchema.index({ userId: 1, createdAt: -1 });
userChoiceSchema.index({ decisionPointId: 1, createdAt: -1 });
userChoiceSchema.index({ sessionId: 1 });
userChoiceSchema.index({ deviceId: 1 });
userChoiceSchema.index({ choiceMade: 1 });
userChoiceSchema.index({ isValid: 1 });

// Compound index for user path tracking
userChoiceSchema.index({ userId: 1, sessionId: 1, createdAt: 1 });

// Virtual for anonymized user identifier
userChoiceSchema.virtual('anonymizedUserId').get(function() {
  if (this.userId) {
    return this.userId.slice(-8); // Last 8 characters
  }
  return this.deviceId ? this.deviceId.slice(-8) : 'anonymous';
});

// Virtual for choice context
userChoiceSchema.virtual('choiceContext').get(function() {
  return {
    isGuest: !this.userId,
    isGroupSession: !!this.sessionId,
    pathLength: this.previousChoices.length,
    isReplay: this.previousChoices.some(choice => 
      choice.decisionPointId === this.decisionPointId
    )
  };
});

// Method to add previous choice to path
userChoiceSchema.methods.addToPreviousChoices = function(decisionPointId, choice) {
  this.previousChoices.push({
    decisionPointId,
    choice,
    timestamp: new Date()
  });
  
  // Keep only last 50 choices to prevent unbounded growth
  if (this.previousChoices.length > 50) {
    this.previousChoices = this.previousChoices.slice(-50);
  }
  
  return this;
};

// Method to get user's choice path
userChoiceSchema.methods.getChoicePath = function() {
  return this.previousChoices.map(choice => ({
    decisionPoint: choice.decisionPointId,
    choice: choice.choice,
    timestamp: choice.timestamp
  })).concat([{
    decisionPoint: this.decisionPointId,
    choice: this.choiceMade,
    timestamp: this.createdAt
  }]);
};

// Method to validate choice against decision point
userChoiceSchema.methods.validateChoice = async function() {
  try {
    const DecisionPoint = mongoose.model('DecisionPoint');
    const decisionPoint = await DecisionPoint.findById(this.decisionPointId);
    
    if (!decisionPoint) {
      this.isValid = false;
      this.validationNotes = 'Decision point not found';
      return false;
    }
    
    const availableChoices = Object.keys(decisionPoint.choices);
    if (!availableChoices.includes(this.choiceMade)) {
      this.isValid = false;
      this.validationNotes = 'Choice not available in decision point';
      return false;
    }
    
    this.isValid = true;
    this.validationNotes = null;
    return true;
  } catch (error) {
    this.isValid = false;
    this.validationNotes = error.message;
    return false;
  }
};

// Method to record hover event
userChoiceSchema.methods.recordHoverEvent = function(choice, duration) {
  this.analytics.hoverEvents.push({
    choice,
    duration,
    timestamp: new Date()
  });
  
  // Keep only last 20 hover events
  if (this.analytics.hoverEvents.length > 20) {
    this.analytics.hoverEvents = this.analytics.hoverEvents.slice(-20);
  }
  
  return this;
};

// Method to record click event
userChoiceSchema.methods.recordClickEvent = function(choice, wasAccidental = false) {
  this.analytics.clickEvents.push({
    choice,
    timestamp: new Date(),
    wasAccidental
  });
  
  // Keep only last 10 click events
  if (this.analytics.clickEvents.length > 10) {
    this.analytics.clickEvents = this.analytics.clickEvents.slice(-10);
  }
  
  return this;
};

// Static method to get user's viewing path
userChoiceSchema.statics.getUserViewingPath = async function(userId, branchingVideoId) {
  const BranchingVideo = mongoose.model('BranchingVideo');
  const DecisionPoint = mongoose.model('DecisionPoint');
  
  // Get all decision points for the branching video
  const decisionPoints = await DecisionPoint.find({ 
    branchingVideoId,
    isActive: true 
  }).sort({ timestamp: 1 });
  
  // Get user's choices for these decision points
  const choices = await this.find({
    userId,
    decisionPointId: { $in: decisionPoints.map(dp => dp._id) },
    isValid: true
  }).sort({ createdAt: 1 });
  
  return {
    userId,
    branchingVideoId,
    decisionPoints: decisionPoints.length,
    choicesMade: choices.length,
    path: choices.map(choice => ({
      decisionPoint: choice.decisionPointId,
      choice: choice.choiceMade,
      timestamp: choice.createdAt,
      decisionTime: choice.decisionTime
    }))
  };
};

// Pre-save middleware
userChoiceSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Validate the choice against the decision point
    await this.validateChoice();
  }
  
  next();
});

export const UserChoice = mongoose.model('UserChoice', userChoiceSchema);
export default UserChoice;
