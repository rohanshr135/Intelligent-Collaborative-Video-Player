import jwt from 'jsonwebtoken';
import { SyncSession, SyncParticipant } from '../models/index.js';
import { BranchingVideo, DecisionPoint, UserChoice } from '../models/index.js';
import { SceneMarker } from '../models/index.js';
import SyncRoom from '../models/SyncRoom.js';
import logger from '../utils/logger.js';
import { config } from '../config/env.js';

// Store active sessions and participants in memory for quick access
const activeSessions = new Map();
const activeParticipants = new Map();

/**
 * Authentication middleware for Socket.IO
 */
export const socketAuth = (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

        const decoded = jwt.verify(token, config.jwt.secret);
    socket.userId = decoded.userId;
    socket.user = decoded;
    
    logger.info(`Socket authenticated for user ${socket.userId}`);
    next();
  } catch (error) {
    logger.error('Socket authentication failed:', error);
    next(new Error('Authentication error: Invalid token'));
  }
};

/**
 * Main Socket.IO connection handler
 */
export const handleSocketConnection = (io, socket) => {
  logger.info(`User ${socket.userId} connected with socket ${socket.id}`);

  // Store socket reference
  socket.userData = {
    userId: socket.userId,
    socketId: socket.id,
    connectedAt: new Date(),
    currentSession: null,
    deviceId: socket.handshake.query.deviceId || `device_${Date.now()}`,
    deviceName: socket.handshake.query.deviceName || 'Unknown Device'
  };

  // Session Lifecycle Events
  socket.on('session:join', handleSessionJoin(io, socket));
  socket.on('session:leave', handleSessionLeave(io, socket));
  
  // Real-Time Playback Sync Events
  socket.on('sync:state', handleSyncState(io, socket));
  socket.on('sync:seek', handleSyncSeek(io, socket));
  socket.on('sync:play', handleSyncPlay(io, socket));
  socket.on('sync:pause', handleSyncPause(io, socket));
  socket.on('sync:heartbeat', handleHeartbeat(io, socket));
  
  // Collaborative Branching Events
  socket.on('branch:choice', handleBranchChoice(io, socket));
  
  // Editing & Markers Events
  socket.on('editor:marker-add', handleMarkerAdd(io, socket));
  socket.on('editor:marker-update', handleMarkerUpdate(io, socket));
  socket.on('editor:marker-delete', handleMarkerDelete(io, socket));
  
  // Disconnect handler
  socket.on('disconnect', handleDisconnect(io, socket));
  
  // Error handler
  socket.on('error', (error) => {
    logger.error(`Socket error for user ${socket.userId}:`, error);
  });
};

/**
 * Handle session join
 */
const handleSessionJoin = (io, socket) => async (data) => {
  try {
    const { sessionId, videoId, deviceId, deviceName } = data;
    
    // Validate session exists
    const session = await SyncSession.findById(sessionId);
    if (!session) {
      return socket.emit('error', { 
        code: 'SESSION_NOT_FOUND', 
        message: 'Session not found' 
      });
    }

    // Check if session is at capacity
    const currentParticipants = await SyncParticipant.countDocuments({ 
      sessionId, 
      status: 'active' 
    });
    
    if (currentParticipants >= session.maxParticipants) {
      return socket.emit('error', { 
        code: 'SESSION_FULL', 
        message: 'Session is at maximum capacity' 
      });
    }

    // Join the session room
    socket.join(sessionId);
    socket.userData.currentSession = sessionId;
    
    // Create or update participant record
    let participant = await SyncParticipant.findOne({
      sessionId,
      userId: socket.userId,
      deviceId: deviceId || socket.userData.deviceId
    });

    if (!participant) {
      participant = new SyncParticipant({
        sessionId,
        userId: socket.userId,
        deviceId: deviceId || socket.userData.deviceId,
        deviceName: deviceName || socket.userData.deviceName,
        status: 'active',
        joinedAt: new Date()
      });
    } else {
      participant.status = 'active';
      participant.lastActiveAt = new Date();
    }
    
    await participant.save();

    // Update session state
    if (!activeSessions.has(sessionId)) {
      activeSessions.set(sessionId, {
        participants: new Set(),
        currentState: session.currentState || {
          timestamp: 0,
          isPlaying: false,
          playbackRate: 1.0
        },
        lastUpdate: new Date()
      });
    }

    const sessionData = activeSessions.get(sessionId);
    sessionData.participants.add(socket.userId);
    activeParticipants.set(socket.id, { sessionId, userId: socket.userId });

    // Get current participants list
    const participants = await SyncParticipant.find({
      sessionId,
      status: 'active'
    }).select('userId deviceId deviceName joinedAt');

    // Send current state to joining user
    socket.emit('session:joined', {
      sessionId,
      currentState: sessionData.currentState,
      participants: participants.map(p => ({
        userId: p.userId,
        deviceId: p.deviceId,
        deviceName: p.deviceName,
        joinedAt: p.joinedAt
      }))
    });

    // Broadcast to other participants
    socket.to(sessionId).emit('session:user-joined', {
      userId: socket.userId,
      deviceId: deviceId || socket.userData.deviceId,
      deviceName: deviceName || socket.userData.deviceName,
      joinedAt: new Date()
    });

    logger.info(`User ${socket.userId} joined session ${sessionId}`);
    
  } catch (error) {
    logger.error('Error handling session join:', error);
    socket.emit('error', { 
      code: 'JOIN_ERROR', 
      message: 'Failed to join session' 
    });
  }
};

/**
 * Handle session leave
 */
const handleSessionLeave = (io, socket) => async (data) => {
  try {
    const { sessionId } = data;
    const userId = socket.userId;
    
    await leaveSession(io, socket, sessionId, userId);
    
  } catch (error) {
    logger.error('Error handling session leave:', error);
    socket.emit('error', { 
      code: 'LEAVE_ERROR', 
      message: 'Failed to leave session' 
    });
  }
};

/**
 * Handle sync state updates
 */
const handleSyncState = (io, socket) => async (data) => {
  try {
    const { sessionId, timestamp, isPlaying, playbackRate = 1.0 } = data;
    
    if (!socket.userData.currentSession || socket.userData.currentSession !== sessionId) {
      return socket.emit('error', { 
        code: 'NOT_IN_SESSION', 
        message: 'Not in session' 
      });
    }

    // Check if user has control permissions
    const session = await SyncSession.findById(sessionId);
    if (!session) return;

    const canControl = session.settings.allowControl === 'all' || 
                      session.hostId.toString() === socket.userId ||
                      (session.settings.allowControl === 'moderators' && 
                       session.moderators.includes(socket.userId));

    if (!canControl) {
      return socket.emit('error', { 
        code: 'NO_PERMISSION', 
        message: 'No permission to control playback' 
      });
    }

    // Update session state
    const sessionData = activeSessions.get(sessionId);
    if (sessionData) {
      sessionData.currentState = {
        timestamp: parseFloat(timestamp),
        isPlaying: Boolean(isPlaying),
        playbackRate: parseFloat(playbackRate),
        lastUpdate: new Date(),
        updatedBy: socket.userId
      };
      sessionData.lastUpdate = new Date();
    }

    // Update database
    await SyncSession.findByIdAndUpdate(sessionId, {
      currentState: sessionData.currentState,
      lastActivity: new Date()
    });

    // Broadcast to all participants except sender
    socket.to(sessionId).emit('sync:state-update', {
      userId: socket.userId,
      timestamp: parseFloat(timestamp),
      isPlaying: Boolean(isPlaying),
      playbackRate: parseFloat(playbackRate),
      serverTimestamp: new Date().toISOString()
    });

    logger.debug(`Sync state updated for session ${sessionId} by user ${socket.userId}`);
    
  } catch (error) {
    logger.error('Error handling sync state:', error);
    socket.emit('error', { 
      code: 'SYNC_ERROR', 
      message: 'Failed to sync state' 
    });
  }
};

/**
 * Handle seek events
 */
const handleSyncSeek = (io, socket) => async (data) => {
  try {
    const { sessionId, timestamp } = data;
    
    // Verify permissions and update state
    await updatePlaybackState(io, socket, sessionId, {
      timestamp: parseFloat(timestamp),
      eventType: 'seek'
    });

    socket.to(sessionId).emit('sync:seek-update', {
      timestamp: parseFloat(timestamp),
      userId: socket.userId,
      serverTimestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error handling seek:', error);
    socket.emit('error', { 
      code: 'SEEK_ERROR', 
      message: 'Failed to seek' 
    });
  }
};

/**
 * Handle play events
 */
const handleSyncPlay = (io, socket) => async (data) => {
  try {
    const { sessionId, timestamp } = data;
    
    await updatePlaybackState(io, socket, sessionId, {
      timestamp: parseFloat(timestamp),
      isPlaying: true,
      eventType: 'play'
    });

    socket.to(sessionId).emit('sync:play-update', {
      timestamp: parseFloat(timestamp),
      userId: socket.userId,
      serverTimestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error handling play:', error);
    socket.emit('error', { 
      code: 'PLAY_ERROR', 
      message: 'Failed to play' 
    });
  }
};

/**
 * Handle pause events
 */
const handleSyncPause = (io, socket) => async (data) => {
  try {
    const { sessionId, timestamp } = data;
    
    await updatePlaybackState(io, socket, sessionId, {
      timestamp: parseFloat(timestamp),
      isPlaying: false,
      eventType: 'pause'
    });

    socket.to(sessionId).emit('sync:pause-update', {
      timestamp: parseFloat(timestamp),
      userId: socket.userId,
      serverTimestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error handling pause:', error);
    socket.emit('error', { 
      code: 'PAUSE_ERROR', 
      message: 'Failed to pause' 
    });
  }
};

/**
 * Handle heartbeat for lag compensation
 */
const handleHeartbeat = (io, socket) => async (data) => {
  try {
    const { sessionId, userId, deviceId, timestamp, latencyMs } = data;
    
    // Update participant activity
    await SyncParticipant.findOneAndUpdate(
      { sessionId, userId: socket.userId },
      { 
        lastActiveAt: new Date(),
        latency: latencyMs || 0
      }
    );

    // Calculate lag compensation if needed
    const sessionData = activeSessions.get(sessionId);
    if (sessionData && latencyMs > 200) { // High latency threshold
      socket.emit('sync:lag-status', {
        userId: socket.userId,
        lagCompensationOffset: Math.min(latencyMs / 1000, 2.0) // Max 2 second offset
      });
    }

  } catch (error) {
    logger.error('Error handling heartbeat:', error);
  }
};

/**
 * Handle branching video choices
 */
const handleBranchChoice = (io, socket) => async (data) => {
  try {
    const { sessionId, userId, decisionPointId, choiceMade } = data;
    
    // Validate decision point
    const decisionPoint = await DecisionPoint.findById(decisionPointId);
    if (!decisionPoint) {
      return socket.emit('error', { 
        code: 'INVALID_DECISION_POINT', 
        message: 'Decision point not found' 
      });
    }

    // Record user choice
    const userChoice = new UserChoice({
      decisionPointId,
      userId: socket.userId,
      choiceIndex: choiceMade,
      timestamp: new Date(),
      sessionId
    });
    await userChoice.save();

    // Get the chosen option
    const choice = decisionPoint.choices[choiceMade];
    if (!choice) {
      return socket.emit('error', { 
        code: 'INVALID_CHOICE', 
        message: 'Invalid choice index' 
      });
    }

    // Broadcast the choice to session
    socket.to(sessionId).emit('branch:branch-chosen', {
      userId: socket.userId,
      decisionPointId,
      choiceMade,
      nextVideoId: choice.videoId,
      targetTimestamp: choice.targetTimestamp,
      action: choice.action
    });

    logger.info(`User ${socket.userId} made choice ${choiceMade} for decision point ${decisionPointId}`);

  } catch (error) {
    logger.error('Error handling branch choice:', error);
    socket.emit('error', { 
      code: 'CHOICE_ERROR', 
      message: 'Failed to record choice' 
    });
  }
};

/**
 * Handle adding markers
 */
const handleMarkerAdd = (io, socket) => async (data) => {
  try {
    const { sessionId, videoId, timestamp, label, markerType, properties } = data;
    
    const marker = new SceneMarker({
      videoId,
      timestamp: parseFloat(timestamp),
      type: markerType || 'annotation',
      title: label,
      createdBy: socket.userId,
      properties: properties || {}
    });
    
    await marker.save();

    // Broadcast to session
    socket.to(sessionId).emit('editor:marker-update', {
      action: 'add',
      marker: {
        id: marker._id,
        videoId,
        timestamp: marker.timestamp,
        type: marker.type,
        title: marker.title,
        createdBy: socket.userId,
        properties: marker.properties,
        createdAt: marker.createdAt
      }
    });

    socket.emit('editor:marker-added', { markerId: marker._id });

  } catch (error) {
    logger.error('Error adding marker:', error);
    socket.emit('error', { 
      code: 'MARKER_ERROR', 
      message: 'Failed to add marker' 
    });
  }
};

/**
 * Handle updating markers
 */
const handleMarkerUpdate = (io, socket) => async (data) => {
  try {
    const { sessionId, markerId, updates } = data;
    
    const marker = await SceneMarker.findOneAndUpdate(
      { _id: markerId, createdBy: socket.userId },
      updates,
      { new: true }
    );

    if (!marker) {
      return socket.emit('error', { 
        code: 'MARKER_NOT_FOUND', 
        message: 'Marker not found or no permission' 
      });
    }

    // Broadcast to session
    socket.to(sessionId).emit('editor:marker-update', {
      action: 'update',
      marker: {
        id: marker._id,
        ...updates,
        updatedAt: marker.updatedAt
      }
    });

  } catch (error) {
    logger.error('Error updating marker:', error);
    socket.emit('error', { 
      code: 'MARKER_UPDATE_ERROR', 
      message: 'Failed to update marker' 
    });
  }
};

/**
 * Handle deleting markers
 */
const handleMarkerDelete = (io, socket) => async (data) => {
  try {
    const { sessionId, markerId } = data;
    
    const marker = await SceneMarker.findOneAndDelete({
      _id: markerId,
      createdBy: socket.userId
    });

    if (!marker) {
      return socket.emit('error', { 
        code: 'MARKER_NOT_FOUND', 
        message: 'Marker not found or no permission' 
      });
    }

    // Broadcast to session
    socket.to(sessionId).emit('editor:marker-update', {
      action: 'delete',
      markerId: markerId
    });

  } catch (error) {
    logger.error('Error deleting marker:', error);
    socket.emit('error', { 
      code: 'MARKER_DELETE_ERROR', 
      message: 'Failed to delete marker' 
    });
  }
};

/**
 * Handle disconnect
 */
const handleDisconnect = (io, socket) => async () => {
  try {
    logger.info(`User ${socket.userId} disconnected (socket ${socket.id})`);
    
    const participantData = activeParticipants.get(socket.id);
    if (participantData) {
      await leaveSession(io, socket, participantData.sessionId, participantData.userId);
      activeParticipants.delete(socket.id);
    }

  } catch (error) {
    logger.error('Error handling disconnect:', error);
  }
};

/**
 * Helper function to leave a session
 */
async function leaveSession(io, socket, sessionId, userId) {
  try {
    // Update participant status
    await SyncParticipant.findOneAndUpdate(
      { sessionId, userId },
      { 
        status: 'left',
        leftAt: new Date()
      }
    );

    // Remove from active session
    const sessionData = activeSessions.get(sessionId);
    if (sessionData) {
      sessionData.participants.delete(userId);
      
      // Clean up empty sessions
      if (sessionData.participants.size === 0) {
        activeSessions.delete(sessionId);
      }
    }

    // Leave socket room
    socket.leave(sessionId);
    socket.userData.currentSession = null;

    // Broadcast to remaining participants
    socket.to(sessionId).emit('session:user-left', {
      userId,
      deviceId: socket.userData.deviceId,
      leftAt: new Date()
    });

    logger.info(`User ${userId} left session ${sessionId}`);

  } catch (error) {
    logger.error('Error leaving session:', error);
    throw error;
  }
}

/**
 * Helper function to update playback state
 */
async function updatePlaybackState(io, socket, sessionId, updates) {
  // Check permissions
  const session = await SyncSession.findById(sessionId);
  if (!session) throw new Error('Session not found');

  const canControl = session.settings.allowControl === 'all' || 
                    session.hostId.toString() === socket.userId ||
                    (session.settings.allowControl === 'moderators' && 
                     session.moderators.includes(socket.userId));

  if (!canControl) {
    throw new Error('No permission to control playback');
  }

  // Update session state
  const sessionData = activeSessions.get(sessionId);
  if (sessionData) {
    sessionData.currentState = {
      ...sessionData.currentState,
      ...updates,
      lastUpdate: new Date(),
      updatedBy: socket.userId
    };
    sessionData.lastUpdate = new Date();
  }

  // Update database
  await SyncSession.findByIdAndUpdate(sessionId, {
    currentState: sessionData.currentState,
    lastActivity: new Date()
  });
}
