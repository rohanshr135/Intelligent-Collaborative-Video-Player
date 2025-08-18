import { Router } from 'express';
import { createRoom, joinRoom, getState, updateState } from '../controllers/roomController.js';

const router = Router();

router.post('/', createRoom);
router.post('/:code/join', joinRoom);
router.get('/:code/state', getState);
router.post('/:code/state', updateState);

export default router;
