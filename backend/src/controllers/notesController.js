import { CollaborativeNote } from '../models/CollaborativeNote.js';
import logger from '../utils/logger.js';

/**
 * Create a new collaborative note
 */
export const createNote = async (req, res) => {
  try {
    const { roomCode, userId, username, content, timestamp, position } = req.body;
    
    if (!roomCode || !userId || !username || !content || timestamp === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: roomCode, userId, username, content, timestamp' 
      });
    }

    const note = new CollaborativeNote({
      roomCode,
      userId,
      username,
      content,
      timestamp,
      position: position || { x: 100, y: 100 }
    });
    
    await note.save();
    
    logger.info(`📝 Note created in room ${roomCode} at ${timestamp}s by ${username}`);
    
    res.status(201).json({
      success: true,
      note
    });
  } catch (error) {
    logger.error(`❌ Error creating note: ${error.message}`);
    res.status(500).json({ error: 'Failed to create note' });
  }
};

/**
 * Get all notes for a room
 */
export const getNotes = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { startTime, endTime } = req.query;
    
    let query = { roomCode };
    
    if (startTime !== undefined || endTime !== undefined) {
      query.timestamp = {};
      if (startTime !== undefined) query.timestamp.$gte = parseFloat(startTime);
      if (endTime !== undefined) query.timestamp.$lte = parseFloat(endTime);
    }
    
    const notes = await CollaborativeNote.find(query)
      .sort({ timestamp: 1 })
      .lean();
    
    res.json({
      notes
    });
  } catch (error) {
    logger.error(`❌ Error fetching notes: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
};

/**
 * Update a note
 */
export const updateNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { userId, content, position, isResolved } = req.body;
    
    const note = await CollaborativeNote.findById(noteId);
    
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    // Only the creator can edit the note
    if (note.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to edit this note' });
    }
    
    if (content !== undefined) note.content = content;
    if (position !== undefined) note.position = position;
    if (isResolved !== undefined) note.isResolved = isResolved;
    
    note.updatedAt = new Date();
    
    await note.save();
    
    logger.info(`📝 Note updated: ${noteId}`);
    
    res.json({
      success: true,
      note
    });
  } catch (error) {
    logger.error(`❌ Error updating note: ${error.message}`);
    res.status(500).json({ error: 'Failed to update note' });
  }
};

/**
 * Delete a note
 */
export const deleteNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { userId } = req.body;
    
    const note = await CollaborativeNote.findById(noteId);
    
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    // Only the creator can delete the note
    if (note.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete this note' });
    }
    
    await CollaborativeNote.findByIdAndDelete(noteId);
    
    logger.info(`🗑️ Note deleted: ${noteId}`);
    
    res.json({
      success: true,
      message: 'Note deleted'
    });
  } catch (error) {
    logger.error(`❌ Error deleting note: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete note' });
  }
};

/**
 * Add a comment to a note
 */
export const addComment = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { userId, username, content } = req.body;
    
    if (!userId || !username || !content) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, username, content' 
      });
    }

    const note = await CollaborativeNote.findById(noteId);
    
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    const comment = {
      userId,
      username,
      content,
      timestamp: new Date()
    };
    
    note.comments.push(comment);
    await note.save();
    
    logger.info(`💬 Comment added to note ${noteId} by ${username}`);
    
    res.status(201).json({
      success: true,
      comment: note.comments[note.comments.length - 1]
    });
  } catch (error) {
    logger.error(`❌ Error adding comment: ${error.message}`);
    res.status(500).json({ error: 'Failed to add comment' });
  }
};

/**
 * Export notes as various formats
 */
export const exportNotes = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { format = 'json' } = req.query;
    
    const notes = await CollaborativeNote.find({ roomCode })
      .sort({ timestamp: 1 })
      .lean();
    
    if (format === 'json') {
      res.json({
        roomCode,
        exportedAt: new Date(),
        totalNotes: notes.length,
        notes
      });
    } else if (format === 'text') {
      let textOutput = `Video Notes for Room: ${roomCode}\n`;
      textOutput += `Exported: ${new Date().toISOString()}\n`;
      textOutput += `Total Notes: ${notes.length}\n\n`;
      
      notes.forEach((note, index) => {
        const minutes = Math.floor(note.timestamp / 60);
        const seconds = Math.floor(note.timestamp % 60);
        textOutput += `${index + 1}. [${minutes}:${seconds.toString().padStart(2, '0')}] by ${note.username}\n`;
        textOutput += `   ${note.content}\n`;
        
        if (note.comments.length > 0) {
          textOutput += `   Comments:\n`;
          note.comments.forEach((comment, i) => {
            textOutput += `   ${i + 1}. ${comment.username}: ${comment.content}\n`;
          });
        }
        textOutput += '\n';
      });
      
      res.type('text/plain').send(textOutput);
    } else if (format === 'csv') {
      let csvOutput = 'Timestamp,Username,Content,Comments Count,Created At\n';
      
      notes.forEach(note => {
        const csvRow = [
          note.timestamp,
          note.username,
          `"${note.content.replace(/"/g, '""')}"`,
          note.comments.length,
          note.createdAt.toISOString()
        ].join(',');
        csvOutput += csvRow + '\n';
      });
      
      res.type('text/csv').send(csvOutput);
    } else {
      res.status(400).json({ error: 'Invalid format. Supported formats: json, text, csv' });
    }
  } catch (error) {
    logger.error(`❌ Error exporting notes: ${error.message}`);
    res.status(500).json({ error: 'Failed to export notes' });
  }
};

/**
 * Get notes statistics for a room
 */
export const getNotesStats = async (req, res) => {
  try {
    const { roomCode } = req.params;
    
    const stats = await CollaborativeNote.aggregate([
      { $match: { roomCode } },
      {
        $group: {
          _id: null,
          totalNotes: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
          resolvedNotes: {
            $sum: { $cond: ['$isResolved', 1, 0] }
          },
          totalComments: {
            $sum: { $size: '$comments' }
          },
          avgTimestamp: { $avg: '$timestamp' }
        }
      },
      {
        $project: {
          _id: 0,
          totalNotes: 1,
          uniqueUserCount: { $size: '$uniqueUsers' },
          resolvedNotes: 1,
          unresolvedNotes: { $subtract: ['$totalNotes', '$resolvedNotes'] },
          totalComments: 1,
          avgTimestamp: { $round: ['$avgTimestamp', 2] }
        }
      }
    ]);
    
    const result = stats[0] || {
      totalNotes: 0,
      uniqueUserCount: 0,
      resolvedNotes: 0,
      unresolvedNotes: 0,
      totalComments: 0,
      avgTimestamp: 0
    };
    
    res.json({
      notesStats: result
    });
  } catch (error) {
    logger.error(`❌ Error fetching notes stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch notes statistics' });
  }
};
