import mongoose from 'mongoose';

const videoTranscriptSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  videoId: {
    type: String,
    required: true,
    ref: 'Video'
  },
  transcriptText: {
    type: String,
    required: true
  },
  language: {
    type: String,
    default: 'en',
    match: /^[a-z]{2}$/
  },
  confidenceScore: {
    type: Number,
    min: 0,
    max: 1,
    default: null
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  wordTimestamps: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  processingMethod: {
    type: String,
    enum: ['whisper', 'google-speech', 'azure-speech', 'manual'],
    default: 'whisper'
  },
  modelVersion: {
    type: String,
    default: null
  },
  segments: [{
    start: {
      type: Number,
      required: true
    },
    end: {
      type: Number,
      required: true
    },
    text: {
      type: String,
      required: true
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1
    }
  }],
  isActive: {
    type: Boolean,
    default: true
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
videoTranscriptSchema.index({ videoId: 1, language: 1 });
videoTranscriptSchema.index({ generatedAt: -1 });
videoTranscriptSchema.index({ isActive: 1 });

// Virtual for transcript length
videoTranscriptSchema.virtual('wordCount').get(function() {
  return this.transcriptText ? this.transcriptText.split(/\s+/).length : 0;
});

// Method to get transcript segment at specific time
videoTranscriptSchema.methods.getSegmentAtTime = function(timestamp) {
  if (!this.segments || this.segments.length === 0) {
    return null;
  }
  
  return this.segments.find(segment => 
    timestamp >= segment.start && timestamp <= segment.end
  );
};

// Method to get transcript text for time range
videoTranscriptSchema.methods.getTextForTimeRange = function(startTime, endTime) {
  if (!this.segments || this.segments.length === 0) {
    return '';
  }
  
  const relevantSegments = this.segments.filter(segment =>
    (segment.start >= startTime && segment.start <= endTime) ||
    (segment.end >= startTime && segment.end <= endTime) ||
    (segment.start <= startTime && segment.end >= endTime)
  );
  
  return relevantSegments.map(segment => segment.text).join(' ');
};

export const VideoTranscript = mongoose.model('VideoTranscript', videoTranscriptSchema);
