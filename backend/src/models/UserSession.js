/**
 * UserSession Model
 * Represents user login sessions and authentication state
 */

import mongoose from 'mongoose';

const userSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sessionToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  refreshToken: {
    type: String,
    required: true,
    index: true
  },
  deviceInfo: {
    userAgent: String,
    ipAddress: String,
    platform: String,
    browser: String
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }
  },
  loginLocation: {
    country: String,
    city: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  metadata: {
    loginMethod: {
      type: String,
      enum: ['password', 'oauth', 'apiKey'],
      default: 'password'
    },
    twoFactorUsed: {
      type: Boolean,
      default: false
    },
    isRemembered: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  collection: 'user_sessions'
});

// Compound indexes for performance
userSessionSchema.index({ userId: 1, isActive: 1 });
userSessionSchema.index({ sessionToken: 1, isActive: 1 });
userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Instance methods
userSessionSchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

userSessionSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

userSessionSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

userSessionSchema.methods.extend = function(additionalTime = 7 * 24 * 60 * 60 * 1000) {
  this.expiresAt = new Date(Date.now() + additionalTime);
  return this.save();
};

// Static methods
userSessionSchema.statics.findActiveSession = function(sessionToken) {
  return this.findOne({
    sessionToken,
    isActive: true,
    expiresAt: { $gt: new Date() }
  }).populate('userId', 'username email role');
};

userSessionSchema.statics.deactivateUserSessions = function(userId) {
  return this.updateMany(
    { userId, isActive: true },
    { isActive: false }
  );
};

userSessionSchema.statics.cleanupExpiredSessions = function() {
  return this.deleteMany({
    $or: [
      { expiresAt: { $lt: new Date() } },
      { isActive: false }
    ]
  });
};

userSessionSchema.statics.getUserActiveSessions = function(userId) {
  return this.find({
    userId,
    isActive: true,
    expiresAt: { $gt: new Date() }
  }).sort({ lastActivity: -1 });
};

// Pre-save middleware
userSessionSchema.pre('save', function(next) {
  if (this.isNew) {
    // Set default expiration if not provided
    if (!this.expiresAt) {
      this.expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days
    }
  }
  next();
});

// Virtual for session age
userSessionSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

// Virtual for time until expiration
userSessionSchema.virtual('timeUntilExpiry').get(function() {
  return this.expiresAt.getTime() - Date.now();
});

// Transform output
userSessionSchema.set('toJSON', {
  transform: function(doc, ret) {
    delete ret.sessionToken;
    delete ret.refreshToken;
    delete ret.__v;
    return ret;
  }
});

export const UserSession = mongoose.model('UserSession', userSessionSchema);
export default UserSession;
