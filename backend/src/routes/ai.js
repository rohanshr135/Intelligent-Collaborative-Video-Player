import { Router } from 'express';
import { getSummary } from '../controllers/summarizer.js';
import { transcribeVideo } from '../services/whisper.js';

const router = Router();

// Endpoint to transcribe a video
router.post('/transcribe', async (req, res) => {
  const { videoUrl, base64, lang } = req.body;
  if (!videoUrl && !base64) {
    return res.status(400).json({ error: 'videoUrl or base64 is required.' });
  }
  try {
    const transcript = await transcribeVideo({ videoUrl, base64, lang });
    res.json({ transcript });
  } catch (error) {
    res.status(500).json({ error: 'Failed to transcribe video.' });
  }
});

// Endpoint to summarize a transcript up to a certain point
router.post('/summarize', async (req, res) => {
  const { transcript, untilTimestamp } = req.body;
  if (!transcript) {
    return res.status(400).json({ error: 'Transcript is required.' });
  }
  try {
    const summary = await getSummary({ transcript, untilTimestamp });
    res.json({ summary });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate summary.' });
  }
});

// Optional: Endpoint for summary caching
router.get('/summary-cache', (req, res) => {
  const { videoId, timestamp } = req.query;
  // TODO: Implement caching logic
  res.status(501).json({ message: 'Not implemented' });
});

export default router;
