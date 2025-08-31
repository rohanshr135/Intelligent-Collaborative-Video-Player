import mongoose from 'mongoose';

const ParticipantSchema = new mongoose.Schema({
  userId: { type: String },
  lastSeen: { type: Date, default: Date.now },
  isHost: { type: Boolean, default: false },
  canControl: { type: Boolean, default: false },
  lagMs: { type: Number, default: 0 },
  lastSync: { type: Date, default: Date.now }
}, { _id: false });

const VideoMetadataSchema = new mongoose.Schema({
  title: { type: String },
  duration: { type: Number, required: true }, // in seconds
  fileSize: { type: Number },
  mimeType: { type: String },
  resolution: { type: String },
  uploadedBy: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }, // when video becomes unavailable
  isTemporary: { type: Boolean, default: true }
}, { _id: false });

const SyncRoomSchema = new mongoose.Schema({
  code: { type: String, unique: true, index: true },
  hostId: { type: String, required: true },
  currentState: {
    t: { type: Number, default: 0 },
    paused: { type: Boolean, default: true },
    rate: { type: Number, default: 1 },
    videoHash: { type: String },
    videoUrl: { type: String },
    lastUpdatedBy: { type: String },
    lastUpdatedAt: { type: Date, default: Date.now }
  },
  video: VideoMetadataSchema,
  participants: [ParticipantSchema],
  controllers: [{ type: String }], // userIds who are allowed to control besides host
  settings: {
    allowControl: { type: String, enum: ['host', 'all', 'moderators'], default: 'host' },
    maxParticipants: { type: Number, default: 10 },
    autoSync: { type: Boolean, default: true },
    lagCompensation: { type: Boolean, default: true }
  },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 1000 * 60 * 60 * 6) }, // 6 hours default
  status: { type: String, enum: ['active', 'paused', 'ended'], default: 'active' }
}, { timestamps: true });

// TTL index for auto-expiration
SyncRoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for video expiration
SyncRoomSchema.index({ 'video.expiresAt': 1 }, { expireAfterSeconds: 0 });

export const SyncRoom = mongoose.model('SyncRoom', SyncRoomSchema);
