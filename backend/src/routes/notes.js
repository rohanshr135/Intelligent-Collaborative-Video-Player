import express from 'express';
import {
  createNote,
  getNotes,
  updateNote,
  deleteNote,
  addComment,
  exportNotes,
  getNotesStats
} from '../controllers/notesController.js';

const router = express.Router();

// Notes routes
router.post('/create', createNote);
router.get('/:roomCode/notes', getNotes);
router.put('/notes/:noteId', updateNote);
router.delete('/notes/:noteId', deleteNote);
router.post('/notes/:noteId/comments', addComment);
router.get('/:roomCode/export', exportNotes);
router.get('/:roomCode/stats', getNotesStats);

export default router;
