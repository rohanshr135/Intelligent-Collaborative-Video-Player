import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  passwordHash: {
    type: String,
    required: true,
    minlength: 8
  },
  avatarUrl: {
    type: String,
    default: null
  },
  preferences: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      playbackSpeed: 1.0,
      theme: 'dark',
      autoplay: true,
      volume: 0.8,
      quality: 'auto'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  refreshTokens: [{
    token: String,
    expiresAt: Date
  }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.passwordHash;
      delete ret.refreshTokens;
      return ret;
    }
  }
});

// Indexes for performance (email and username already indexed via unique: true)
userSchema.index({ createdAt: -1 });

// Virtual for video count
userSchema.virtual('videoCount', {
  ref: 'Video',
  localField: '_id',
  foreignField: 'uploadedBy',
  count: true
});

// Pre-save middleware for email normalization
userSchema.pre('save', function(next) {
  if (this.isModified('email')) {
    this.email = this.email.toLowerCase();
  }
  next();
});

export const User = mongoose.model('User', userSchema);
export default User;
