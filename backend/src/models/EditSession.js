/**
 * EditSession Model
 * Represents collaborative editing sessions for video synchronization
 */

import mongoose from 'mongoose';

const editSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SyncRoom',
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastActivity: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['owner', 'editor', 'viewer'],
      default: 'viewer'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  editingState: {
    currentTime: {
      type: Number,
      default: 0
    },
    playbackRate: {
      type: Number,
      default: 1.0
    },
    isPlaying: {
      type: Boolean,
      default: false
    },
    volume: {
      type: Number,
      default: 1.0,
      min: 0,
      max: 1
    },
    quality: {
      type: String,
      enum: ['auto', '144p', '240p', '360p', '480p', '720p', '1080p'],
      default: 'auto'
    }
  },
  markers: [{
    id: {
      type: String,
      required: true
    },
    timestamp: {
      type: Number,
      required: true
    },
    label: {
      type: String,
      required: true
    },
    description: String,
    color: {
      type: String,
      default: '#ff6b6b'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  edits: [{
    id: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['cut', 'trim', 'marker', 'volume', 'playback_rate'],
      required: true
    },
    startTime: Number,
    endTime: Number,
    data: mongoose.Schema.Types.Mixed,
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    appliedAt: {
      type: Date,
      default: Date.now
    }
  }],
  settings: {
    allowPublicEdit: {
      type: Boolean,
      default: false
    },
    requireApproval: {
      type: Boolean,
      default: true
    },
    maxParticipants: {
      type: Number,
      default: 10,
      min: 1,
      max: 100
    },
    autoSave: {
      type: Boolean,
      default: true
    },
    saveInterval: {
      type: Number,
      default: 30000 // 30 seconds
    }
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'cancelled'],
    default: 'active'
  },
  lastSaved: {
    type: Date,
    default: Date.now
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true,
  collection: 'edit_sessions'
});

// Indexes for performance
editSessionSchema.index({ roomId: 1, status: 1 });
editSessionSchema.index({ 'participants.userId': 1 });
editSessionSchema.index({ createdBy: 1 });
editSessionSchema.index({ status: 1, updatedAt: -1 });

// Instance methods
editSessionSchema.methods.addParticipant = function(userId, role = 'viewer') {
  const existingParticipant = this.participants.find(p => 
    p.userId.toString() === userId.toString()
  );
  
  if (existingParticipant) {
    existingParticipant.isActive = true;
    existingParticipant.lastActivity = new Date();
    return this.save();
  }
  
  this.participants.push({
    userId,
    role,
    joinedAt: new Date(),
    lastActivity: new Date(),
    isActive: true
  });
  
  return this.save();
};

editSessionSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => 
    p.userId.toString() === userId.toString()
  );
  
  if (participant) {
    participant.isActive = false;
  }
  
  return this.save();
};

editSessionSchema.methods.addMarker = function(marker, userId) {
  this.markers.push({
    id: marker.id || new mongoose.Types.ObjectId().toString(),
    timestamp: marker.timestamp,
    label: marker.label,
    description: marker.description,
    color: marker.color || '#ff6b6b',
    createdBy: userId,
    createdAt: new Date()
  });
  
  this.version += 1;
  this.lastSaved = new Date();
  return this.save();
};

editSessionSchema.methods.removeMarker = function(markerId) {
  this.markers = this.markers.filter(m => m.id !== markerId);
  this.version += 1;
  this.lastSaved = new Date();
  return this.save();
};

editSessionSchema.methods.addEdit = function(edit, userId) {
  this.edits.push({
    id: edit.id || new mongoose.Types.ObjectId().toString(),
    type: edit.type,
    startTime: edit.startTime,
    endTime: edit.endTime,
    data: edit.data,
    appliedBy: userId,
    appliedAt: new Date()
  });
  
  this.version += 1;
  this.lastSaved = new Date();
  return this.save();
};

editSessionSchema.methods.updateState = function(newState) {
  Object.assign(this.editingState, newState);
  this.lastSaved = new Date();
  return this.save();
};

editSessionSchema.methods.getActiveParticipants = function() {
  return this.participants.filter(p => p.isActive);
};

// Static methods
editSessionSchema.statics.findByRoom = function(roomId) {
  return this.find({ roomId, status: 'active' })
    .populate('participants.userId', 'username email')
    .populate('createdBy', 'username email')
    .sort({ updatedAt: -1 });
};

editSessionSchema.statics.findUserSessions = function(userId) {
  return this.find({
    $or: [
      { createdBy: userId },
      { 'participants.userId': userId }
    ],
    status: { $in: ['active', 'paused'] }
  })
  .populate('roomId', 'name videoId')
  .sort({ updatedAt: -1 });
};

editSessionSchema.statics.cleanupInactiveSessions = function() {
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
  
  return this.updateMany(
    {
      status: 'active',
      'participants.lastActivity': { $lt: cutoffTime }
    },
    { status: 'paused' }
  );
};

// Pre-save middleware
editSessionSchema.pre('save', function(next) {
  if (this.isModified('editingState') || this.isModified('markers') || this.isModified('edits')) {
    this.lastSaved = new Date();
  }
  next();
});

// Virtual for session duration
editSessionSchema.virtual('duration').get(function() {
  return this.updatedAt - this.createdAt;
});

// Virtual for active participant count
editSessionSchema.virtual('activeParticipantCount').get(function() {
  return this.participants.filter(p => p.isActive).length;
});

// Transform output
editSessionSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

export const EditSession = mongoose.model('EditSession', editSessionSchema);
export default EditSession;
