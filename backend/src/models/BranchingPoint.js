import mongoose from 'mongoose';

const branchingPointSchema = new mongoose.Schema({
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
  timestamp: {
    type: Number,
    required: true,
    min: 0
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 500
  },
  choices: [{
    id: {
      type: String,
      required: true
    },
    label: {
      type: String,
      required: true,
      maxlength: 100
    },
    targetTimestamp: {
      type: Number,
      min: 0
    },
    targetVideoId: String,
    description: {
      type: String,
      maxlength: 300
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: String,
    required: true
  },
  branchHistory: [{
    userId: String,
    choiceId: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Compound indexes
branchingPointSchema.index({ videoId: 1, roomCode: 1, timestamp: 1 });
branchingPointSchema.index({ roomCode: 1, isActive: 1 });

export const BranchingPoint = mongoose.model('BranchingPoint', branchingPointSchema);
