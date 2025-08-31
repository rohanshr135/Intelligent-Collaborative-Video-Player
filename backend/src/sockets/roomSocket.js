import logger from '../utils/logger.js';
import { SyncRoom } from '../models/SyncRoom.js';

// Store active room participants
const roomParticipants = new Map(); // roomCode -> Set of socketIds
const socketToRoom = new Map(); // socketId -> roomCode
const socketToUser = new Map(); // socketId -> userId

/**
 * Simple authentication middleware for Socket.IO (no JWT required for now)
 */
export const socketAuth = (socket, next) => {
  // For now, just assign a random user ID if none provided
  const userId = socket.handshake.auth.userId || `user_${Math.random().toString(36).substr(2, 9)}`;
  socket.userId = userId;
  logger.info(`Socket authenticated for user ${socket.userId}`);
  next();
};

/**
 * Main Socket.IO connection handler
 */
export const handleSocketConnection = (io, socket) => {
  logger.info(`📱 New socket connection: ${socket.id} (user: ${socket.userId})`);
  
  socketToUser.set(socket.id, socket.userId);

  // Room join event
  socket.on('room:join', async (data) => {
    const { roomCode } = data;
    if (!roomCode) return;

    // Leave previous room if any
    const previousRoom = socketToRoom.get(socket.id);
    if (previousRoom) {
      leaveRoom(io, socket, previousRoom);
    }

    // Join new room
    socket.join(roomCode);
    socketToRoom.set(socket.id, roomCode);
    
    // Add to room participants
    if (!roomParticipants.has(roomCode)) {
      roomParticipants.set(roomCode, new Set());
    }
    roomParticipants.get(roomCode).add(socket.id);

    // Get room data and send to the joining participant
    try {
      const room = await SyncRoom.findOne({ code: String(roomCode).toUpperCase() });
      if (room) {
        socket.emit('room:joined', {
          roomCode,
          hostId: room.hostId,
          controllers: room.controllers || [],
          participants: Array.from(roomParticipants.get(roomCode) || []).map(socketId => socketToUser.get(socketId)),
          currentState: room.currentState || {}
        });
      }
    } catch (err) {
      logger.warn(`Could not fetch room data for ${roomCode}:`, err.message);
    }

    // Broadcast participant update to room
    const participantCount = roomParticipants.get(roomCode).size;
    io.to(roomCode).emit('room:participant-update', {
      roomCode,
      participantCount,
      action: 'joined',
      userId: socket.userId
    });

    logger.info(`👥 User ${socket.userId} joined room ${roomCode}. Total participants: ${participantCount}`);
  });

  // Room leave event
  socket.on('room:leave', (data) => {
    const { roomCode } = data;
    leaveRoom(io, socket, roomCode);
  });

  // Chat message broadcasting
  socket.on('chat:send', (data) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;

    // Broadcast to all room participants
    socket.to(roomCode).emit('chat:message', {
      ...data,
      socketId: socket.id,
      userId: socket.userId,
      timestamp: new Date()
    });

    logger.info(`💬 Chat message broadcasted in room ${roomCode} by ${socket.userId}`);
  });

  // Set a canonical video URL for the room so everyone loads the same source
  socket.on('room:set-video', async ({ roomCode, videoUrl }) => {
    try {
      const currentRoom = socketToRoom.get(socket.id);
      const targetRoom = roomCode || currentRoom;
      if (!targetRoom || !videoUrl) return;

      console.log(`Setting video URL for room ${targetRoom}: ${videoUrl}`);

      // Persist to DB
      try {
        const upper = String(targetRoom).toUpperCase();
        const room = await SyncRoom.findOne({ code: upper });
        if (room) {
          room.currentState = { ...room.currentState, videoUrl };
          await room.save();
          console.log(`Video URL persisted to room ${upper}`);
        }
      } catch (dbErr) {
        logger.warn('Could not persist room video URL:', dbErr.message);
      }

      // Broadcast to all participants including sender
      // Consumers should update their player src to this URL
      socket.to(targetRoom).emit('room:video-updated', { roomCode: targetRoom, videoUrl });
      socket.emit('room:video-updated', { roomCode: targetRoom, videoUrl });
      logger.info(`🎥 Video URL set for room ${targetRoom} by ${socket.userId}`);
    } catch (err) {
      logger.error('Failed to set room video URL:', err);
      socket.emit('error', { message: 'Failed to set room video URL' });
    }
  });

  // Enforce host/controller-only playback controls for this simple room socket channel
  socket.on('play', async () => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;
    const room = await SyncRoom.findOne({ code: String(roomCode).toUpperCase() });
    const uid = socketToUser.get(socket.id);
    if (!room) return;
    if (room.hostId && room.hostId !== uid && !(room.controllers || []).includes(uid)) return;
    socket.to(roomCode).emit('play');
  });
  socket.on('pause', async ({ t }) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;
    const room = await SyncRoom.findOne({ code: String(roomCode).toUpperCase() });
    const uid = socketToUser.get(socket.id);
    if (!room) return;
    if (room.hostId && room.hostId !== uid && !(room.controllers || []).includes(uid)) return;
    socket.to(roomCode).emit('pause', { t });
  });
  socket.on('seek', async ({ t }) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;
    const room = await SyncRoom.findOne({ code: String(roomCode).toUpperCase() });
    const uid = socketToUser.get(socket.id);
    if (!room) return;
    if (room.hostId && room.hostId !== uid && !(room.controllers || []).includes(uid)) return;
    socket.to(roomCode).emit('seek', { t });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const roomCode = socketToRoom.get(socket.id);
    if (roomCode) {
      leaveRoom(io, socket, roomCode);
    }
    
    socketToUser.delete(socket.id);
    socketToRoom.delete(socket.id);
    
    logger.info(`🔌 Socket disconnected: ${socket.id}`);
  });

  // Error handling
  socket.on('error', (error) => {
    logger.error(`❌ Socket error: ${socket.id}:`, error);
  });
};

/**
 * Helper function to leave a room
 */
function leaveRoom(io, socket, roomCode) {
  if (!roomCode) return;

  socket.leave(roomCode);
  
  // Remove from room participants
  const participants = roomParticipants.get(roomCode);
  if (participants) {
    participants.delete(socket.id);
    
    // Clean up empty rooms
    if (participants.size === 0) {
      roomParticipants.delete(roomCode);
    } else {
      // Broadcast participant update
      io.to(roomCode).emit('room:participant-update', {
        roomCode,
        participantCount: participants.size,
        action: 'left',
        userId: socket.userId
      });
    }
  }

  socketToRoom.delete(socket.id);
  logger.info(`👥 User ${socket.userId} left room ${roomCode}`);
}
