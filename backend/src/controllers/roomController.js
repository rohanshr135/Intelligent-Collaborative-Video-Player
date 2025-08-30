import { SyncRoom } from '../models/SyncRoom.js';
import { nanoid } from 'nanoid';
import logger from '../utils/logger.js';

export const createRoom = async (req, res) => {
  try {
    const code = nanoid(6);
    const room = await SyncRoom.create({ code });
    logger.info(`📱 New room created: ${code} (ID: ${room._id})`);
    res.json({ code, roomId: room._id });
  } catch (e) {
    logger.error(`❌ Failed to create room: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
};

export const joinRoom = async (req, res) => {
  const { code } = req.params;
  const { userId } = req.body || {};
  try {
    const room = await SyncRoom.findOne({ code });
    if (!room) {
      logger.warn(`❌ Room not found: ${code}`);
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const now = new Date();
    room.participants = room.participants.filter(p => (now - p.lastSeen) < 1000 * 60 * 60);
    
    if (userId && !room.participants.find(p => p.userId === userId)) {
      room.participants.push({ userId });
      logger.info(`👤 User ${userId} joined room: ${code}`);
    }
    
    await room.save();
    logger.info(`✅ Room ${code} joined successfully. Participants: ${room.participants.length}`);
    res.json({ code: room.code, state: room.currentState, participants: room.participants });
  } catch (e) {
    logger.error(`❌ Failed to join room ${code}: ${e.message}`);
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

// Debug endpoint to list all rooms (for testing)
export const getAllRooms = async (req, res) => {
  try {
    const rooms = await SyncRoom.find({})
      .select('code participants createdAt expiresAt currentState')
      .sort({ createdAt: -1 })
      .limit(10);
    
    const roomData = rooms.map(room => ({
      code: room.code,
      participantCount: room.participants.length,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      isExpired: new Date() > room.expiresAt,
      currentState: room.currentState
    }));
    
    logger.info(`📋 Listed ${rooms.length} rooms`);
    res.json({ rooms: roomData, total: rooms.length });
  } catch (e) {
    logger.error(`❌ Failed to list rooms: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
};
