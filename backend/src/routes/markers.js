import { Router } from 'express';

const router = Router();

// Mock data for markers
const markers = {};

// Get or add markers for a video
router
  .route('/:videoId')
  .get((req, res) => {
    const { videoId } = req.params;
    res.json(markers[videoId] || []);
  })
  .post((req, res) => {
    const { videoId } = req.params;
    const { timestamp, label, importance } = req.body;

    if (!markers[videoId]) {
      markers[videoId] = [];
    }
    const newMarker = { id: Date.now(), timestamp, label, importance };
    markers[videoId].push(newMarker);
    res.status(201).json(newMarker);
  });

// Endpoint for suggesting edit points
router.post('/autocuts', (req, res) => {
  // TODO: Implement logic to suggest cuts based on transcript or video analysis
  res.status(501).json({ message: 'Not implemented' });
});

export default router;
