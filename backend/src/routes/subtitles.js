import express from 'express';
import {
  uploadSubtitles,
  getSubtitles,
  getLanguages,
  updateSubtitles,
  deleteSubtitles,
  searchSubtitles,
  exportSubtitles
} from '../controllers/subtitleController.js';

const router = express.Router();

// Subtitle routes
router.post('/upload', uploadSubtitles);
router.get('/:roomCode/subtitles', getSubtitles);
router.get('/:roomCode/languages', getLanguages);
router.put('/subtitles/:subtitleId', updateSubtitles);
router.delete('/subtitles/:subtitleId', deleteSubtitles);
router.get('/:roomCode/search', searchSubtitles);
router.get('/subtitles/:subtitleId/export', exportSubtitles);

export default router;
