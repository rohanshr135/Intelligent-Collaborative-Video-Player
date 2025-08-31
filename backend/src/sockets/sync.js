import logger from '../utils/logger.js';
import { SyncRoom } from '../models/SyncRoom.js';

/**
 * Enhanced sync handler with video syncing, host controls, and lag compensation
 */
const syncHandler = (io, socket) => {
  
  /**
   * Handle room joining with enhanced features
   */
  const joinRoom = async ({ roomCode, userId, deviceId, deviceName, userAgent }) => {
    try {
      // Validate room
      const room = await SyncRoom.findOne({ code: roomCode.toUpperCase() });
      if (!room) {
        return socket.emit('error', { 
          code: 'ROOM_NOT_FOUND', 
          message: 'Room not found' 
        });
      }

      // Check if room is active
      if (room.status !== 'active') {
        return socket.emit('error', { 
          code: 'ROOM_INACTIVE', 
          message: 'Room is not active' 
        });
      }

      // Check if room is expired
      if (new Date() > room.expiresAt) {
        return socket.emit('error', { 
          code: 'ROOM_EXPIRED', 
          message: 'Room has expired' 
        });
      }

      // Check capacity
      if (room.participants.length >= room.settings.maxParticipants) {
        return socket.emit('error', { 
          code: 'ROOM_FULL', 
          message: 'Room is at maximum capacity' 
        });
      }

      socket.join(roomCode);
      socket.currentRoom = roomCode;
      socket.userId = userId;
      
      logger.info(`Device ${deviceId} (${socket.id}) joined room ${roomCode}`);
      
      // Update participant info
      const now = new Date();
      const existingParticipant = room.participants.find(p => p.userId === userId);
      
      if (existingParticipant) {
        existingParticipant.lastSeen = now;
        existingParticipant.lastSync = now;
      } else {
        // Add new participant
        const isHost = userId === room.hostId;
        const canControl = isHost || room.controllers.includes(userId);
        
        room.participants.push({
          userId,
          isHost,
          canControl,
          lastSeen: now,
          lastSync: now
        });
      }
      
      await room.save();

      // Send current state to new participant
      socket.emit('room_joined', {
        roomCode,
        currentState: room.currentState,
        participants: room.participants,
        video: room.video,
        settings: room.settings,
        hostId: room.hostId,
        controllers: room.controllers,
        expiresAt: room.expiresAt
      });

      // Notify others
      socket.to(roomCode).emit('user_joined', { 
        userId,
        deviceId: deviceId || `device_${Date.now()}`,
        deviceName: deviceName || 'Unknown Device',
        isHost: userId === room.hostId,
        canControl: room.controllers.includes(userId) || userId === room.hostId
      });

      // Broadcast updated participant list
      io.to(roomCode).emit('participants_updated', {
        participants: room.participants,
        participantCount: room.participants.length
      });

    } catch (error) {
      logger.error('Error joining room:', error);
      socket.emit('error', { 
        code: 'JOIN_ERROR', 
        message: 'Failed to join room' 
      });
    }
  };

  /**
   * Enhanced playback event handler with host controls and lag compensation
   */
  const handlePlaybackEvent = async (payload) => {
    try {
      const { roomCode, type, timestamp, playbackRate = 1.0, userId } = payload;
      
      if (!roomCode || !socket.currentRoom) {
        return socket.emit('error', { 
          code: 'NOT_IN_ROOM', 
          message: 'Not in any room' 
        });
      }

      // Verify room and permissions
      const room = await SyncRoom.findOne({ code: roomCode.toUpperCase() });
      if (!room) return;

      const participant = room.participants.find(p => p.userId === userId);
      if (!participant || !participant.canControl) {
        return socket.emit('error', { 
          code: 'NO_PERMISSION', 
          message: 'No permission to control playback' 
        });
      }

      // Update room state
      const updateData = {
        timestamp: parseFloat(timestamp || 0),
        lastUpdate: new Date(),
        updatedBy: userId
      };

      if (type === 'play') {
        updateData.isPlaying = false;
        updateData.paused = false;
        updateData.playbackRate = parseFloat(playbackRate);
      } else if (type === 'pause') {
        updateData.isPlaying = false;
        updateData.paused = true;
      } else if (type === 'seek') {
        updateData.paused = room.currentState.paused; // Maintain pause state
      }

      // Update room state
      room.currentState = { 
        ...room.currentState, 
        ...updateData,
        lastUpdatedBy: userId,
        lastUpdatedAt: new Date()
      };
      
      await room.save();

      // Broadcast to all participants with server timestamp for lag compensation
      const eventData = {
        type,
        timestamp: updateData.timestamp,
        paused: room.currentState.paused,
        playbackRate: room.currentState.playbackRate,
        userId,
        serverTimestamp: new Date().toISOString(),
        roomCode
      };

      io.to(roomCode).emit('playback_event', eventData);

      logger.debug(`Playback event ${type} in room ${roomCode} by user ${userId}`);

    } catch (error) {
      logger.error('Error handling playback event:', error);
      socket.emit('error', { 
        code: 'PLAYBACK_ERROR', 
        message: 'Failed to handle playback event' 
      });
    }
  };

  /**
   * Smart sync request with lag detection and compensation
   */
  const handleSyncRequest = async ({ roomCode, requesterId, clientTimestamp, userId }) => {
    try {
      if (!roomCode) return;

      const room = await SyncRoom.findOne({ code: roomCode.toUpperCase() });
      if (!room) return;

      const requestTime = new Date();
      
      // Ask other participants for current state
      socket.to(roomCode).emit('sync_request', { 
        requesterId: socket.id,
        requesterUserId: userId,
        serverTimestamp: requestTime.toISOString(),
        clientTimestamp
      });

      // Send server's known state immediately
      socket.emit('sync_server_state', {
        currentState: room.currentState,
        serverTimestamp: requestTime.toISOString(),
        participantCount: room.participants.length,
        roomCode
      });

    } catch (error) {
      logger.error('Error handling sync request:', error);
    }
  };

  /**
   * Enhanced sync response with lag calculation
   */
  const handleSyncResponse = async ({ roomCode, requesterId, timestamp, state, responseTimestamp, userId }) => {
    try {
      const serverTime = new Date();
      
      // Calculate round-trip time if timestamps provided
      let lagMs = 0;
      if (responseTimestamp) {
        lagMs = serverTime.getTime() - new Date(responseTimestamp).getTime();
      }

      // Send sync state to specific requester with lag info
      io.to(requesterId).emit('sync_response', { 
        timestamp: parseFloat(timestamp),
        state,
        serverTimestamp: serverTime.toISOString(),
        lagMs,
        providedBy: userId,
        roomCode
      });

    } catch (error) {
      logger.error('Error handling sync response:', error);
    }
  };

  /**
   * Handle heartbeat with performance metrics and lag detection
   */
  const handleHeartbeat = async ({ roomCode, deviceInfo, performance, userId }) => {
    try {
      if (!roomCode || !userId) return;

      const heartbeatTime = new Date();
      
      // Update participant activity and performance metrics
      const room = await SyncRoom.findOne({ code: roomCode.toUpperCase() });
      if (!room) return;

      const participant = room.participants.find(p => p.userId === userId);
      if (participant) {
        participant.lastSeen = heartbeatTime;
        participant.lastSync = heartbeatTime;
        participant.lagMs = performance?.lagMs || 0;
        await room.save();
      }

      // Respond with server timestamp for lag calculation
      socket.emit('heartbeat_ack', {
        serverTimestamp: heartbeatTime.toISOString(),
        roomCode
      });

      // Check if participant is lagging behind significantly
      if (performance?.lagMs > 1000) { // 1 second threshold
        socket.emit('lag_warning', {
          lagMs: performance.lagMs,
          suggestion: 'High lag detected. Consider refreshing or checking your connection.',
          roomCode
        });
      }

    } catch (error) {
      logger.error('Error handling heartbeat:', error);
    }
  };

  /**
   * Handle chat messages in sync sessions
   */
  const handleChatMessage = async ({ roomCode, message, type = 'text', userId }) => {
    try {
      if (!roomCode || !message || message.trim().length === 0) return;

      const room = await SyncRoom.findOne({ code: roomCode.toUpperCase() });
      if (!room) return;

      const chatData = {
        userId,
        message: message.trim().substring(0, 500), // Limit message length
        type,
        timestamp: new Date().toISOString(),
        roomCode
      };

      // Broadcast to room
      io.to(roomCode).emit('chat_message', chatData);

      logger.debug(`Chat message in room ${roomCode} from user ${userId}`);

    } catch (error) {
      logger.error('Error handling chat message:', error);
    }
  };

  /**
   * Handle quality change requests
   */
  const handleQualityChange = async ({ roomCode, quality, userId }) => {
    try {
      if (!roomCode) return;

      // Broadcast quality preference
      socket.to(roomCode).emit('quality_change', {
        userId,
        quality,
        timestamp: new Date().toISOString(),
        roomCode
      });

      logger.debug(`Quality change to ${quality} requested by user ${userId} in room ${roomCode}`);

    } catch (error) {
      logger.error('Error handling quality change:', error);
    }
  };

  /**
   * Handle participant leaving
   */
  const handleLeaveRoom = async ({ roomCode, userId }) => {
    try {
      if (!roomCode || !userId) return;

      const room = await SyncRoom.findOne({ code: roomCode.toUpperCase() });
      if (!room) return;

      // Remove participant
      room.participants = room.participants.filter(p => p.userId !== userId);
      await room.save();

      // Leave socket room
      socket.leave(roomCode);
      socket.currentRoom = null;

      // Notify others
      socket.to(roomCode).emit('user_left', {
        userId,
        leftAt: new Date().toISOString(),
        roomCode
      });

      // Broadcast updated participant list
      io.to(roomCode).emit('participants_updated', {
        participants: room.participants,
        participantCount: room.participants.length
      });

      logger.info(`User ${userId} left room ${roomCode}`);

    } catch (error) {
      logger.error('Error handling leave room:', error);
    }
  };

  // Register event handlers
  socket.on('join_room', joinRoom);
  socket.on('playback_event', handlePlaybackEvent);
  socket.on('play', (payload) => handlePlaybackEvent({ ...payload, type: 'play' }));
  socket.on('pause', (payload) => handlePlaybackEvent({ ...payload, type: 'pause' }));
  socket.on('seek', (payload) => handlePlaybackEvent({ ...payload, type: 'seek' }));
  socket.on('sync_request', handleSyncRequest);
  socket.on('sync_response', handleSyncResponse);
  socket.on('heartbeat', handleHeartbeat);
  socket.on('chat_message', handleChatMessage);
  socket.on('quality_change', handleQualityChange);
  socket.on('leave_room', handleLeaveRoom);

  socket.on('disconnect', async () => {
    try {
      if (socket.currentRoom && socket.userId) {
        // Update participant status
        const room = await SyncRoom.findOne({ code: socket.currentRoom.toUpperCase() });
        if (room) {
          room.participants = room.participants.filter(p => p.userId !== socket.userId);
          await room.save();

          // Notify room
          socket.to(socket.currentRoom).emit('user_left', {
            userId: socket.userId,
            leftAt: new Date().toISOString(),
            roomCode: socket.currentRoom
          });

          // Broadcast updated participant list
          io.to(socket.currentRoom).emit('participants_updated', {
            participants: room.participants,
            participantCount: room.participants.length
          });

          logger.info(`User ${socket.userId} left room ${socket.currentRoom} (disconnect)`);
        }
      }
    } catch (error) {
      logger.error('Error handling disconnect cleanup:', error);
    }
    
    logger.info(`Client disconnected: ${socket.id}`);
  });
};

export default syncHandler;
