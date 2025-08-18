import mongoose from 'mongoose';

const syncParticipantSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  sessionId: {
    type: String,
    required: true,
    ref: 'SyncSession'
  },
  userId: {
    type: String,
    ref: 'User',
    default: null
  },
  deviceId: {
    type: String,
    required: true
  },
  deviceName: {
    type: String,
    trim: true,
    maxlength: 100,
    default: 'Unknown Device'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  lastHeartbeat: {
    type: Date,
    default: Date.now
  },
  isController: {
    type: Boolean,
    default: false
  },
  lagOffset: {
    type: Number,
    default: 0 // milliseconds
  },
  isActive: {
    type: Boolean,
    default: true
  },
  connectionInfo: {
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    platform: {
      type: String,
      default: null
    },
    browser: {
      type: String,
      default: null
    }
  },
  permissions: {
    canControl: {
      type: Boolean,
      default: false
    },
    canChat: {
      type: Boolean,
      default: true
    },
    canReact: {
      type: Boolean,
      default: true
    }
  },
  syncMetrics: {
    averageLatency: {
      type: Number,
      default: 0
    },
    jitter: {
      type: Number,
      default: 0
    },
    packetsLost: {
      type: Number,
      default: 0
    },
    lastSyncTime: {
      type: Date,
      default: null
    }
  },
  nickname: {
    type: String,
    trim: true,
    maxlength: 50,
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
syncParticipantSchema.index({ sessionId: 1, isActive: 1 });
syncParticipantSchema.index({ deviceId: 1 });
syncParticipantSchema.index({ userId: 1 });
syncParticipantSchema.index({ lastHeartbeat: -1 });
syncParticipantSchema.index({ isController: 1 });

// Compound index for unique device per session
syncParticipantSchema.index({ sessionId: 1, deviceId: 1 }, { unique: true });

// Virtual for session duration
syncParticipantSchema.virtual('sessionDuration').get(function() {
  if (!this.joinedAt) return 0;
  const endTime = this.isActive ? new Date() : this.updatedAt;
  return Math.floor((endTime.getTime() - this.joinedAt.getTime()) / 1000);
});

// Virtual for connection status
syncParticipantSchema.virtual('connectionStatus').get(function() {
  const now = new Date();
  const heartbeatAge = now.getTime() - this.lastHeartbeat.getTime();
  
  if (heartbeatAge < 5000) return 'connected';      // < 5 seconds
  if (heartbeatAge < 30000) return 'unstable';     // < 30 seconds
  return 'disconnected';                            // > 30 seconds
});

// Method to update heartbeat
syncParticipantSchema.methods.updateHeartbeat = function(syncMetrics = {}) {
  this.lastHeartbeat = new Date();
  
  if (syncMetrics.latency) {
    this.syncMetrics.averageLatency = (this.syncMetrics.averageLatency + syncMetrics.latency) / 2;
  }
  
  if (syncMetrics.jitter) {
    this.syncMetrics.jitter = syncMetrics.jitter;
  }
  
  this.syncMetrics.lastSyncTime = new Date();
  
  return this.save();
};

// Method to check if participant is online
syncParticipantSchema.methods.isOnline = function() {
  const heartbeatAge = Date.now() - this.lastHeartbeat.getTime();
  return this.isActive && heartbeatAge < 30000; // 30 seconds threshold
};

// Method to promote to controller
syncParticipantSchema.methods.promoteToController = function() {
  this.isController = true;
  this.permissions.canControl = true;
  return this.save();
};

// Method to revoke controller status
syncParticipantSchema.methods.revokeController = function() {
  this.isController = false;
  this.permissions.canControl = false;
  return this.save();
};

// Pre-save middleware
syncParticipantSchema.pre('save', function(next) {
  // Auto-generate nickname if not provided
  if (this.isNew && !this.nickname) {
    if (this.userId) {
      // Will be populated from User model
      this.nickname = 'User';
    } else {
      this.nickname = `Guest-${this.deviceName || 'Device'}`;
    }
  }
  
  next();
});

const SyncParticipant = mongoose.model('SyncParticipant', syncParticipantSchema);

export { SyncParticipant };
export default SyncParticipant;
