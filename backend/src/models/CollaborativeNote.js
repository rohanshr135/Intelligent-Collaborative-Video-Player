import mongoose from 'mongoose';

const collaborativeNoteSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    index: true
  },
  videoId: {
    type: String,
    required: true
  },
  timestamp: {
    type: Number,
    required: true,
    min: 0
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },
  authorId: {
    type: String,
    required: true
  },
  authorName: {
    type: String,
    required: true
  },
  noteType: {
    type: String,
    enum: ['note', 'annotation', 'bookmark'],
    default: 'note'
  },
  tags: [String],
  isPrivate: {
    type: Boolean,
    default: false
  },
  collaborators: [{
    userId: String,
    username: String,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  editHistory: [{
    editedBy: String,
    editedAt: {
      type: Date,
      default: Date.now
    },
    previousContent: String
  }]
}, {
  timestamps: true
});

// Compound indexes
collaborativeNoteSchema.index({ roomCode: 1, videoId: 1, timestamp: 1 });
collaborativeNoteSchema.index({ roomCode: 1, isPrivate: 1 });
collaborativeNoteSchema.index({ authorId: 1, createdAt: -1 });

export const CollaborativeNote = mongoose.model('CollaborativeNote', collaborativeNoteSchema);
