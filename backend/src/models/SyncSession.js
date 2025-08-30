import mongoose from 'mongoose';

const syncSessionSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  sessionName: {
    type: String,
    trim: true,
    maxlength: 100,
    default: null
  },
  videoId: {
    type: String,
    required: true,
    ref: 'Video'
  },
  hostUserId: {
    type: String,
    required: true,
    ref: 'User'
  },
  currentTimestamp: {
    type: Number,
    default: 0,
    min: 0
  },
  isPlaying: {
    type: Boolean,
    default: false
  },
  playbackRate: {
    type: Number,
    default: 1.0,
    min: 0.25,
    max: 3.0
  },
  expiresAt: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  qrCodeData: {
    type: String,
    default: null
  },
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      allowGuests: true,
      maxParticipants: 10,
      requirePassword: false,
      password: null,
      syncTolerance: 250, // ms
      lagCompensation: true,
      chatEnabled: true,
      reactionsEnabled: true
    }
  },
  sessionCode: {
    type: String,
    unique: true,
    sparse: true
  },
  participantCount: {
    type: Number,
    default: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  sessionType: {
    type: String,
    enum: ['public', 'private', 'scheduled'],
    default: 'private'
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
syncSessionSchema.index({ videoId: 1, isActive: 1 });
syncSessionSchema.index({ hostUserId: 1, createdAt: -1 });
syncSessionSchema.index({ isActive: 1, lastActivity: -1 });

// Virtual for formatted session duration
syncSessionSchema.virtual('sessionDuration').get(function() {
  if (!this.createdAt) return 0;
  return Math.floor((Date.now() - this.createdAt.getTime()) / 1000);
});

// Virtual for active participants
syncSessionSchema.virtual('activeParticipants', {
  ref: 'SyncParticipant',
  localField: '_id',
  foreignField: 'sessionId',
  match: { isActive: true }
});

// Method to generate session code
syncSessionSchema.methods.generateSessionCode = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  this.sessionCode = result;
  return result;
};

// Method to check if session is expired
syncSessionSchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

// Method to update last activity
syncSessionSchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

// Pre-save middleware
syncSessionSchema.pre('save', function(next) {
  if (this.isNew && !this.sessionCode) {
    this.generateSessionCode();
  }
  
  // Set default expiration to 24 hours if not set
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  
  next();
});

export const SyncSession = mongoose.model('SyncSession', syncSessionSchema);
