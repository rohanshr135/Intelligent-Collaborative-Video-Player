import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true,
    maxlength: 50
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  videoTimestamp: {
    type: Number,
    min: 0
  },
  messageType: {
    type: String,
    enum: ['text', 'timestamp', 'system'],
    default: 'text'
  },
  referencedTimestamp: {
    type: Number,
    min: 0
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date
}, {
  timestamps: true
});

// Indexes
chatMessageSchema.index({ roomCode: 1, timestamp: -1 });
chatMessageSchema.index({ roomCode: 1, messageType: 1 });

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
