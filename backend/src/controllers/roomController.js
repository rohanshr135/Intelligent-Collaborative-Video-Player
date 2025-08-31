import { SyncRoom } from '../models/SyncRoom.js';
import { nanoid } from 'nanoid';
import logger from '../utils/logger.js';

export const createRoom = async (req, res) => {
  try {
    const code = nanoid(6).toUpperCase();
    const hostId = req.body?.userId || `host_${Date.now()}`;
    const room = await SyncRoom.create({ 
      code, 
      hostId, 
      controllers: [hostId] // Host is always a controller
    });
    logger.info(`📱 New room created: ${code} (ID: ${room._id}) by host: ${hostId}`);
    res.json({ code, roomId: room._id, hostId });
  } catch (e) {
    logger.error(`❌ Failed to create room: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
};export const joinRoom = async (req, res) => {
  const { code } = req.params;
  const { userId } = req.body || {};
  try {
    // Convert to uppercase for consistent lookup
    const upperCode = code.toUpperCase();
    const room = await SyncRoom.findOne({ code: upperCode });
    if (!room) {
      logger.warn(`❌ Room not found: ${code} (searched as: ${upperCode})`);
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const now = new Date();
    room.participants = room.participants.filter(p => (now - p.lastSeen) < 1000 * 60 * 60);
    
    if (userId && !room.participants.find(p => p.userId === userId)) {
      room.participants.push({ userId });
      logger.info(`👤 User ${userId} joined room: ${room.code}`);
    }
    
    await room.save();
    logger.info(`✅ Room ${room.code} joined successfully. Participants: ${room.participants.length}`);
  res.json({ code: room.code, state: room.currentState, participants: room.participants, hostId: room.hostId, controllers: room.controllers || [] });
  } catch (e) {
    logger.error(`❌ Failed to join room ${code}: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
};

export const getState = async (req, res) => {
  const { code } = req.params;
  try {
    const upperCode = code.toUpperCase();
    const room = await SyncRoom.findOne({ code: upperCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room.currentState);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const updateState = async (req, res) => {
  const { code } = req.params;
  const { t, paused, rate, videoHash, videoUrl } = req.body;
  try {
    const upperCode = code.toUpperCase();
    const room = await SyncRoom.findOne({ code: upperCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });
  // Optional: enforce only host/controllers can update state via REST (socket already handles broadcasts)
    room.currentState = { ...room.currentState, t, paused, rate, videoHash, videoUrl };
    await room.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// Set or change the canonical video URL for a room
export const setVideoUrl = async (req, res) => {
  const { code } = req.params;
  const { videoUrl } = req.body || {};
  try {
    if (!videoUrl || typeof videoUrl !== 'string') {
      return res.status(400).json({ error: 'videoUrl is required' });
    }
    const upperCode = code.toUpperCase();
    const room = await SyncRoom.findOne({ code: upperCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    room.currentState = { ...room.currentState, videoUrl };
    await room.save();
    res.json({ ok: true, currentState: room.currentState });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// Allow host to grant or revoke control to participants
export const setControllers = async (req, res) => {
  const { code } = req.params;
  const { hostId, controllers } = req.body || {};
  try {
    const upperCode = code.toUpperCase();
    const room = await SyncRoom.findOne({ code: upperCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (!hostId || hostId !== room.hostId) return res.status(403).json({ error: 'Only host can modify controllers' });
    room.controllers = Array.isArray(controllers) ? controllers : [];
    // Ensure host is always a controller
    if (room.hostId && !room.controllers.includes(room.hostId)) room.controllers.push(room.hostId);
    await room.save();
    res.json({ ok: true, controllers: room.controllers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// Generate minimal share payload (room join URL is handled client-side with ?room=CODE)
export const getShareInfo = async (req, res) => {
  const { code } = req.params;
  try {
    const room = await SyncRoom.findOne({ code: code.toUpperCase() });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ code: room.code, hostId: room.hostId, videoUrl: room.currentState?.videoUrl || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const getRoomDetails = async (req, res) => {
  const { code } = req.params;
  try {
    const upperCode = code.toUpperCase();
    const room = await SyncRoom.findOne({ code: upperCode });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Clean up expired participants
    const now = new Date();
    room.participants = room.participants.filter(p => (now - p.lastSeen) < 1000 * 60 * 60);
    await room.save();
    
    res.json({ 
      code: room.code,
      participants: room.participants,
      participantCount: room.participants.length,
      currentState: room.currentState,
      createdAt: room.createdAt
    });
  } catch (e) {
    logger.error(`❌ Failed to get room details ${code}: ${e.message}`);
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
