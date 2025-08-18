import { SyncRoom } from '../models/SyncRoom.js';
import { nanoid } from 'nanoid';

export const createRoom = async (req, res) => {
  try {
    const code = nanoid(6);
    const room = await SyncRoom.create({ code });
    res.json({ code, roomId: room._id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const joinRoom = async (req, res) => {
  const { code } = req.params;
  const { userId } = req.body || {};
  try {
    const room = await SyncRoom.findOne({ code });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const now = new Date();
    room.participants = room.participants.filter(p => (now - p.lastSeen) < 1000 * 60 * 60);
    if (userId && !room.participants.find(p => p.userId === userId)) {
      room.participants.push({ userId });
    }
    await room.save();
    res.json({ code: room.code, state: room.currentState, participants: room.participants });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const getState = async (req, res) => {
  const { code } = req.params;
  try {
    const room = await SyncRoom.findOne({ code });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room.currentState);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const updateState = async (req, res) => {
  const { code } = req.params;
  const { t, paused, rate, videoHash } = req.body;
  try {
    const room = await SyncRoom.findOne({ code });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    room.currentState = { ...room.currentState, t, paused, rate, videoHash };
    await room.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
