import mongoose from 'mongoose';

const videoSummarySchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true,
    index: true
  },
  roomCode: {
    type: String,
    required: true,
    index: true
  },
  segments: [{
    startTime: {
      type: Number,
      required: true
    },
    endTime: {
      type: Number,
      required: true
    },
    summary: {
      type: String,
      required: true
    },
    keyWords: [String],
    importance: {
      type: Number,
      min: 1,
      max: 5,
      default: 3
    }
  }],
  fullSummary: {
    type: String,
    default: ''
  },
  keyInsights: [{
    type: String
  }],
  generatedBy: {
    type: String,
    default: 'AI Assistant'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound indexes
videoSummarySchema.index({ videoId: 1, roomCode: 1 }, { unique: true });
videoSummarySchema.index({ roomCode: 1, lastUpdated: -1 });

export const VideoSummary = mongoose.model('VideoSummary', videoSummarySchema);
