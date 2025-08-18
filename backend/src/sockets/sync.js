import logger from '../utils/logger.js';
import { SyncSession, SyncParticipant } from '../models/index.js';
import { BranchingVideo, DecisionPoint } from '../models/index.js';

/**
 * Advanced sync handler with lag compensation and smart synchronization
 */
const syncHandler = (io, socket) => {
  
  /**
   * Handle room joining with enhanced features
   */
  const joinRoom = async ({ roomId, deviceId, deviceName, userAgent }) => {
    try {
      // Validate session
      const session = await SyncSession.findById(roomId);
      if (!session) {
        return socket.emit('error', { 
          code: 'ROOM_NOT_FOUND', 
          message: 'Room not found' 
        });
      }

      // Check capacity
      const participantCount = await SyncParticipant.countDocuments({
        sessionId: roomId,
        status: 'active'
      });

      if (participantCount >= session.maxParticipants) {
        return socket.emit('error', { 
          code: 'ROOM_FULL', 
          message: 'Room is at maximum capacity' 
        });
      }

      socket.join(roomId);
      socket.currentRoom = roomId;
      
      logger.info(`Device ${deviceId} (${socket.id}) joined room ${roomId}`);
      
      // Create participant record
      const participant = new SyncParticipant({
        sessionId: roomId,
        userId: socket.userId,
        deviceId: deviceId || `device_${Date.now()}`,
        deviceName: deviceName || 'Unknown Device',
        status: 'active',
        joinedAt: new Date(),
        userAgent: userAgent || socket.handshake.headers['user-agent']
      });
      
      await participant.save();

      // Send current state to new participant
      socket.emit('room_joined', {
        roomId,
        currentState: session.currentState,
        participants: await getActiveParticipants(roomId),
        sessionInfo: {
          name: session.name,
          videoId: session.videoId,
          settings: session.settings
        }
      });

      // Notify others
      socket.to(roomId).emit('user_joined', { 
        userId: socket.userId,
        deviceId: deviceId || `device_${Date.now()}`,
        deviceName: deviceName || 'Unknown Device'
      });

      // Check for pending decision points
      await checkForDecisionPoints(io, socket, roomId, session.currentState?.timestamp || 0);

    } catch (error) {
      logger.error('Error joining room:', error);
      socket.emit('error', { 
        code: 'JOIN_ERROR', 
        message: 'Failed to join room' 
      });
    }
  };

  /**
   * Enhanced playback event handler with lag compensation
   */
  const handlePlaybackEvent = async (payload) => {
    try {
      const { roomId, type, timestamp, playbackRate = 1.0, serverCompensation = false } = payload;
      
      if (!roomId || !socket.currentRoom) {
        return socket.emit('error', { 
          code: 'NOT_IN_ROOM', 
          message: 'Not in any room' 
        });
      }

      // Verify permissions
      const session = await SyncSession.findById(roomId);
      if (!session) return;

      const canControl = await checkControlPermissions(session, socket.userId);
      if (!canControl) {
        return socket.emit('error', { 
          code: 'NO_PERMISSION', 
          message: 'No permission to control playback' 
        });
      }

      // Update session state
      const updateData = {
        timestamp: parseFloat(timestamp || 0),
        lastUpdate: new Date(),
        updatedBy: socket.userId
      };

      if (type === 'play') {
        updateData.isPlaying = true;
        updateData.playbackRate = parseFloat(playbackRate);
      } else if (type === 'pause') {
        updateData.isPlaying = false;
      } else if (type === 'seek') {
        // Seeking automatically pauses in most implementations
        updateData.isPlaying = false;
      }

      await SyncSession.findByIdAndUpdate(roomId, {
        currentState: { ...session.currentState, ...updateData },
        lastActivity: new Date()
      });

      // Broadcast with server timestamp for lag compensation
      const eventData = {
        type,
        timestamp: updateData.timestamp,
        isPlaying: updateData.isPlaying,
        playbackRate: updateData.playbackRate,
        userId: socket.userId,
        serverTimestamp: new Date().toISOString(),
        serverCompensation
      };

      socket.to(roomId).emit('playback_event', eventData);

      // Check for decision points on seeks/plays
      if (type === 'seek' || type === 'play') {
        await checkForDecisionPoints(io, socket, roomId, updateData.timestamp);
      }

      logger.debug(`Playback event ${type} in room ${roomId} by user ${socket.userId}`);

    } catch (error) {
      logger.error('Error handling playback event:', error);
      socket.emit('error', { 
        code: 'PLAYBACK_ERROR', 
        message: 'Failed to handle playback event' 
      });
    }
  };

  /**
   * Smart sync request with lag detection
   */
  const handleSyncRequest = async ({ roomId, requesterId, clientTimestamp }) => {
    try {
      if (!roomId) return;

      const session = await SyncSession.findById(roomId);
      if (!session) return;

      const requestTime = new Date();
      
      // Ask host or another participant for current state
      socket.to(roomId).emit('sync_request', { 
        requesterId: socket.id,
        requesterUserId: socket.userId,
        serverTimestamp: requestTime.toISOString(),
        clientTimestamp
      });

      // Also send the server's known state
      socket.emit('sync_server_state', {
        currentState: session.currentState,
        serverTimestamp: requestTime.toISOString(),
        participantCount: await SyncParticipant.countDocuments({
          sessionId: roomId,
          status: 'active'
        })
      });

    } catch (error) {
      logger.error('Error handling sync request:', error);
    }
  };

  /**
   * Enhanced sync response with lag calculation
   */
  const handleSyncResponse = async ({ roomId, requesterId, timestamp, state, responseTimestamp }) => {
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
        providedBy: socket.userId
      });

    } catch (error) {
      logger.error('Error handling sync response:', error);
    }
  };

  /**
   * Handle heartbeat with performance metrics
   */
  const handleHeartbeat = async ({ roomId, deviceInfo, performance }) => {
    try {
      if (!roomId || !socket.userId) return;

      const heartbeatTime = new Date();
      
      // Update participant activity and performance metrics
      await SyncParticipant.findOneAndUpdate(
        { sessionId: roomId, userId: socket.userId },
        {
          lastActiveAt: heartbeatTime,
          lastHeartbeat: heartbeatTime,
          deviceInfo: deviceInfo || {},
          performance: performance || {}
        }
      );

      // Respond with server timestamp for lag calculation
      socket.emit('heartbeat_ack', {
        serverTimestamp: heartbeatTime.toISOString(),
        roomId
      });

      // Check if participant is lagging behind
      if (performance?.lagMs > 500) { // 500ms threshold
        socket.emit('lag_warning', {
          lagMs: performance.lagMs,
          suggestion: 'Consider refreshing or checking your connection'
        });
      }

    } catch (error) {
      logger.error('Error handling heartbeat:', error);
    }
  };

  /**
   * Handle chat messages in sync sessions
   */
  const handleChatMessage = async ({ roomId, message, type = 'text' }) => {
    try {
      if (!roomId || !message || message.trim().length === 0) return;

      const session = await SyncSession.findById(roomId);
      if (!session || !session.settings.allowChat) {
        return socket.emit('error', { 
          code: 'CHAT_DISABLED', 
          message: 'Chat is disabled in this session' 
        });
      }

      const chatData = {
        userId: socket.userId,
        message: message.trim().substring(0, 500), // Limit message length
        type,
        timestamp: new Date().toISOString(),
        roomId
      };

      // Broadcast to room
      io.to(roomId).emit('chat_message', chatData);

      logger.debug(`Chat message in room ${roomId} from user ${socket.userId}`);

    } catch (error) {
      logger.error('Error handling chat message:', error);
    }
  };

  /**
   * Handle quality change requests
   */
  const handleQualityChange = async ({ roomId, quality, userId }) => {
    try {
      if (!roomId) return;

      // Broadcast quality preference
      socket.to(roomId).emit('quality_change', {
        userId: socket.userId,
        quality,
        timestamp: new Date().toISOString()
      });

      logger.debug(`Quality change to ${quality} requested by user ${socket.userId} in room ${roomId}`);

    } catch (error) {
      logger.error('Error handling quality change:', error);
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

  socket.on('disconnect', async () => {
    try {
      if (socket.currentRoom && socket.userId) {
        // Update participant status
        await SyncParticipant.findOneAndUpdate(
          { sessionId: socket.currentRoom, userId: socket.userId },
          { 
            status: 'left',
            leftAt: new Date()
          }
        );

        // Notify room
        socket.to(socket.currentRoom).emit('user_left', {
          userId: socket.userId,
          leftAt: new Date().toISOString()
        });

        logger.info(`User ${socket.userId} left room ${socket.currentRoom} (disconnect)`);
      }
    } catch (error) {
      logger.error('Error handling disconnect cleanup:', error);
    }
    
    logger.info(`Client disconnected: ${socket.id}`);
  });
};

/**
 * Helper function to get active participants
 */
async function getActiveParticipants(sessionId) {
  return await SyncParticipant.find({
    sessionId,
    status: 'active'
  }).select('userId deviceId deviceName joinedAt lastActiveAt');
}

/**
 * Helper function to check control permissions
 */
async function checkControlPermissions(session, userId) {
  if (session.settings.allowControl === 'all') return true;
  if (session.hostId.toString() === userId) return true;
  if (session.settings.allowControl === 'moderators' && 
      session.moderators.includes(userId)) return true;
  return false;
}

/**
 * Helper function to check for decision points
 */
async function checkForDecisionPoints(io, socket, sessionId, currentTimestamp) {
  try {
    // Get the session to find the branching video
    const session = await SyncSession.findById(sessionId).populate('branchingVideoId');
    if (!session || !session.branchingVideoId) return;

    // Find decision points near current timestamp (within 2 seconds)
    const decisionPoints = await DecisionPoint.find({
      branchingVideoId: session.branchingVideoId._id,
      timestamp: {
        $gte: currentTimestamp,
        $lte: currentTimestamp + 2
      }
    });

    // Trigger decision points
    for (const point of decisionPoints) {
      io.to(sessionId).emit('branch:decision-point', {
        decisionPointId: point._id,
        timestamp: point.timestamp,
        questionText: point.question,
        choices: point.choices,
        timeoutSeconds: point.timeoutSeconds || 30,
        layout: point.layout || 'horizontal'
      });
    }

  } catch (error) {
    logger.error('Error checking decision points:', error);
  }
}

export default syncHandler;
