import { Router } from 'express';
import { 
  createRoom, 
  joinRoom, 
  getState, 
  updateState, 
  getAllRooms, 
  getRoomDetails, 
  setVideoUrl, 
  setControllers, 
  getShareInfo
} from '../controllers/roomController.js';
import { videoUpload } from '../middleware/upload.js';

const router = Router();

// Create room with optional video upload
router.post('/', videoUpload.single('videoFile'), createRoom);

router.post('/:code/join', joinRoom);
router.get('/:code/state', getState);
router.post('/:code/state', updateState);

// Set canonical video URL for the room
router.post('/:code/video', setVideoUrl);

// Host controls who can control
router.post('/:code/controllers', setControllers);

// Share info for UI
router.get('/:code/share', getShareInfo);

// Room details and management
router.get('/:code', getRoomDetails);

// Debug endpoint to list all rooms
router.get('/', getAllRooms);

export default router;
