import mongoose from 'mongoose';

const ParticipantSchema = new mongoose.Schema({
  userId: { type: String },
  lastSeen: { type: Date, default: Date.now }
}, { _id: false });

const SyncRoomSchema = new mongoose.Schema({
  code: { type: String, unique: true, index: true },
  currentState: {
    t: { type: Number, default: 0 },
    paused: { type: Boolean, default: true },
    rate: { type: Number, default: 1 },
    videoHash: { type: String }
  },
  participants: [ParticipantSchema],
  expiresAt: { type: Date, default: () => new Date(Date.now() + 1000 * 60 * 60 * 6), index: { expires: '0s' } }
}, { timestamps: true });

export const SyncRoom = mongoose.model('SyncRoom', SyncRoomSchema);
export default SyncRoom;
