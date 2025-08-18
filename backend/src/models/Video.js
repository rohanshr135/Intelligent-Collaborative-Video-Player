import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  duration: {
    type: Number,
    required: true,
    min: 0 // seconds
  },
  fileSize: {
    type: Number,
    required: true,
    min: 0 // bytes
  },
  filePath: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true,
    enum: ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov', 'video/wmv', 'video/flv']
  },
  resolution: {
    type: String,
    default: null,
    match: /^\d+x\d+$/
  },
  fps: {
    type: Number,
    default: null,
    min: 1,
    max: 120
  },
  bitrate: {
    type: Number,
    default: null,
    min: 0
  },
  codec: {
    type: String,
    default: null
  },
  thumbnailUrl: {
    type: String,
    default: null
  },
  uploadedBy: {
    type: String,
    required: true,
    ref: 'User'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  tags: [{
    type: String,
    trim: true
  }],
  category: {
    type: String,
    default: 'general'
  },
  viewCount: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  isDeleted: {
    type: Boolean,
    default: false
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
videoSchema.index({ uploadedBy: 1, createdAt: -1 });
videoSchema.index({ processingStatus: 1 });
videoSchema.index({ isPublic: 1, isDeleted: 1 });
videoSchema.index({ title: 'text', description: 'text' });
videoSchema.index({ tags: 1 });
videoSchema.index({ category: 1 });

// Virtual for formatted duration
videoSchema.virtual('formattedDuration').get(function() {
  const hours = Math.floor(this.duration / 3600);
  const minutes = Math.floor((this.duration % 3600) / 60);
  const seconds = this.duration % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Virtual for file size in human readable format
videoSchema.virtual('formattedFileSize').get(function() {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (this.fileSize === 0) return '0 Byte';
  const i = parseInt(Math.floor(Math.log(this.fileSize) / Math.log(1024)));
  return Math.round(this.fileSize / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
});

// Pre-save middleware
videoSchema.pre('save', function(next) {
  if (this.isModified('title')) {
    this.title = this.title.trim();
  }
  next();
});

const Video = mongoose.model('Video', videoSchema);

export { Video };
export default Video;
