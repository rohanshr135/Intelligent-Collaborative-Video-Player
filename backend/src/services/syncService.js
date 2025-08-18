import SyncSession from '../models/SyncSession.js';
import SyncParticipant from '../models/SyncParticipant.js';
import syncUtils from '../utils/syncUtils.js';
import generalUtils from '../utils/generalUtils.js';
import logger from '../utils/logger.js';
import { EventEmitter } from 'events';

/**
 * Sync Service - Manages multi-device synchronization sessions
 * Handles playback states, participant lag tracking, and group management
 */
export class SyncService extends EventEmitter {
  constructor() {
    super();
    this.activeSessions = new Map(); // In-memory session cache
    this.participantHeartbeats = new Map(); // Track participant heartbeats
    this.lagCalculations = new Map(); // Store lag calculation data
    
    // Cleanup inactive sessions every 5 minutes
    setInterval(() => this.cleanupInactiveSessions(), 5 * 60 * 1000);
    
    // Check participant heartbeats every 30 seconds
    setInterval(() => this.checkParticipantHeartbeats(), 30 * 1000);
  }

  /**
   * Create a new synchronization session
   * @param {String} videoId - video ID to sync
   * @param {String} sessionName - display name for session
   * @param {String} hostUserId - host user ID
   * @param {Object} options - additional session options
   * @returns {Promise<Object>} created session
   */
  async createSession(videoId, sessionName, hostUserId, options = {}) {
    try {
      logger.info('Creating sync session:', {
        videoId,
        sessionName,
        hostUserId
      });

      const sessionId = generalUtils.generateUUID();
      const accessCode = generalUtils.generateAccessCode(6);

      const sessionData = {
        _id: sessionId,
        video: videoId,
        sessionName: sessionName || `Session ${accessCode}`,
        hostUser: hostUserId,
        accessCode,
        
        // Playback state
        currentTimestamp: 0,
        isPlaying: false,
        playbackRate: 1.0,
        lastSyncTime: new Date(),
        
        // Session settings
        maxParticipants: options.maxParticipants || 50,
        allowGuestParticipants: options.allowGuestParticipants !== false,
        requireApproval: options.requireApproval || false,
        enableLagCompensation: options.enableLagCompensation !== false,
        
        // Permissions
        allowParticipantControl: options.allowParticipantControl || false,
        allowSeek: options.allowSeek !== false,
        allowPause: options.allowPause !== false,
        allowPlaybackRate: options.allowPlaybackRate !== false,
        
        // Status
        isActive: true,
        participantCount: 0,
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const session = new SyncSession(sessionData);
      await session.save();

      // Cache session in memory for quick access
      this.activeSessions.set(sessionId, {
        ...sessionData,
        participants: new Map(),
        lagData: new Map()
      });

      // Add host as first participant
      await this.joinSession(sessionId, hostUserId, 'host-device', 'Host Device', {
        isController: true,
        isHost: true
      });

      logger.info('Sync session created:', {
        sessionId,
        accessCode,
        sessionName
      });

      return session;

    } catch (error) {
      logger.error('Session creation failed:', {
        videoId,
        sessionName,
        hostUserId,
        error: error.message
      });
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  /**
   * Join an existing synchronization session
   * @param {String} sessionId - session ID
   * @param {String} userId - joining user ID
   * @param {String} deviceId - unique device identifier
   * @param {String} deviceName - human-readable device name
   * @param {Object} options - additional join options
   * @returns {Promise<Object>} participant record
   */
  async joinSession(sessionId, userId, deviceId, deviceName, options = {}) {
    try {
      logger.info('User joining session:', {
        sessionId,
        userId,
        deviceId,
        deviceName
      });

      // Get session
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      if (!session.isActive) {
        throw new Error('Session is no longer active');
      }

      // Check participant limits
      if (session.participantCount >= session.maxParticipants) {
        throw new Error('Session is full');
      }

      // Check if already joined
      const existingParticipant = await SyncParticipant.findOne({
        session: sessionId,
        user: userId,
        deviceId,
        isActive: true
      });

      if (existingParticipant) {
        logger.info('User rejoining existing session:', {
          participantId: existingParticipant._id
        });
        
        // Update heartbeat
        existingParticipant.lastHeartbeat = new Date();
        await existingParticipant.save();
        
        return existingParticipant;
      }

      // Create new participant
      const participantData = {
        session: sessionId,
        user: userId,
        deviceId,
        deviceName,
        
        // Permissions
        isController: options.isController || false,
        isHost: options.isHost || false,
        canSeek: options.canSeek || session.allowSeek,
        canPause: options.canPause || session.allowPause,
        canChangeRate: options.canChangeRate || session.allowPlaybackRate,
        
        // Sync data
        lagCompensationOffset: 0,
        averageLag: 0,
        lastKnownPosition: session.currentTimestamp,
        syncQuality: 'good',
        
        // Connection info
        userAgent: options.userAgent || '',
        ipAddress: options.ipAddress || '',
        connectionType: options.connectionType || 'unknown',
        
        // Status
        isActive: true,
        joinedAt: new Date(),
        lastHeartbeat: new Date(),
        lastSyncUpdate: new Date()
      };

      const participant = new SyncParticipant(participantData);
      await participant.save();

      // Update session participant count
      await SyncSession.findByIdAndUpdate(sessionId, {
        $inc: { participantCount: 1 },
        updatedAt: new Date()
      });

      // Cache participant data
      const cachedSession = this.activeSessions.get(sessionId);
      if (cachedSession) {
        cachedSession.participants.set(participant._id.toString(), {
          ...participantData,
          _id: participant._id
        });
      }

      // Initialize heartbeat tracking
      this.participantHeartbeats.set(participant._id.toString(), new Date());

      // Emit join event
      this.emit('participant-joined', {
        sessionId,
        participant,
        session
      });

      logger.info('User joined session successfully:', {
        sessionId,
        participantId: participant._id,
        participantCount: session.participantCount + 1
      });

      return participant;

    } catch (error) {
      logger.error('Session join failed:', {
        sessionId,
        userId,
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update playback state and sync all participants
   * @param {String} sessionId - session ID
   * @param {Object} playbackState - new playback state
   * @param {String} controllerUserId - user making the update
   * @returns {Promise<Object>} updated session
   */
  async updatePlaybackState(sessionId, playbackState, controllerUserId) {
    try {
      const {
        timestamp,
        isPlaying,
        playbackRate = 1.0,
        eventType = 'update'
      } = playbackState;

      logger.info('Updating playback state:', {
        sessionId,
        timestamp,
        isPlaying,
        playbackRate,
        eventType,
        controllerUserId
      });

      // Verify controller permissions
      const participant = await SyncParticipant.findOne({
        session: sessionId,
        user: controllerUserId,
        isActive: true
      });

      if (!participant) {
        throw new Error('Participant not found in session');
      }

      if (!participant.isController && !participant.isHost) {
        const session = await this.getSession(sessionId);
        if (!session.allowParticipantControl) {
          throw new Error('User does not have control permissions');
        }
      }

      // Validate playback state
      if (timestamp < 0 || playbackRate <= 0 || playbackRate > 4) {
        throw new Error('Invalid playback parameters');
      }

      // Update session
      const updateData = {
        currentTimestamp: timestamp,
        isPlaying,
        playbackRate,
        lastSyncTime: new Date(),
        updatedAt: new Date()
      };

      const session = await SyncSession.findByIdAndUpdate(
        sessionId,
        updateData,
        { new: true }
      );

      if (!session) {
        throw new Error('Session not found');
      }

      // Update cached session
      const cachedSession = this.activeSessions.get(sessionId);
      if (cachedSession) {
        Object.assign(cachedSession, updateData);
      }

      // Calculate lag compensation for all participants
      const participants = await SyncParticipant.find({
        session: sessionId,
        isActive: true
      });

      const syncData = await this.calculateSyncData(sessionId, participants, {
        timestamp,
        isPlaying,
        playbackRate,
        serverTime: new Date()
      });

      // Emit sync event to all participants
      this.emit('sync-update', {
        sessionId,
        playbackState: {
          timestamp,
          isPlaying,
          playbackRate,
          serverTime: new Date(),
          eventType
        },
        syncData,
        controllerUserId
      });

      logger.info('Playback state updated and synced:', {
        sessionId,
        participantCount: participants.length,
        eventType
      });

      return {
        session,
        syncData,
        participants: participants.length
      };

    } catch (error) {
      logger.error('Playback state update failed:', {
        sessionId,
        playbackState,
        controllerUserId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate synchronization data for participants
   * @param {String} sessionId - session ID
   * @param {Array} participants - list of participants
   * @param {Object} currentState - current playback state
   * @returns {Promise<Object>} synchronization data
   */
  async calculateSyncData(sessionId, participants, currentState) {
    try {
      const syncData = {
        sessionId,
        serverTime: currentState.serverTime,
        playbackState: {
          timestamp: currentState.timestamp,
          isPlaying: currentState.isPlaying,
          playbackRate: currentState.playbackRate
        },
        participants: {}
      };

      for (const participant of participants) {
        const participantId = participant._id.toString();
        
        // Get lag data for this participant
        let lagData = this.lagCalculations.get(participantId);
        if (!lagData) {
          lagData = {
            samples: [],
            averageLag: 0,
            lastCalculation: new Date()
          };
          this.lagCalculations.set(participantId, lagData);
        }

        // Calculate lag compensation
        const compensation = syncUtils.calculateLagCompensation(
          lagData.averageLag,
          currentState.timestamp,
          currentState.isPlaying,
          currentState.playbackRate
        );

        // Calculate optimal playback rate for sync
        const optimalRate = syncUtils.calculateOptimalPlaybackRate(
          lagData.averageLag,
          currentState.playbackRate,
          { maxDeviation: 0.1, convergenceTime: 5000 }
        );

        // Determine sync quality
        const syncQuality = syncUtils.determineSyncQuality(lagData.averageLag);

        syncData.participants[participantId] = {
          participantId,
          lagCompensation: compensation,
          optimalPlaybackRate: optimalRate,
          averageLag: lagData.averageLag,
          syncQuality,
          compensatedTimestamp: currentState.timestamp + compensation,
          lastUpdate: new Date()
        };

        // Update participant record
        await SyncParticipant.findByIdAndUpdate(participant._id, {
          lagCompensationOffset: compensation,
          averageLag: lagData.averageLag,
          syncQuality,
          lastSyncUpdate: new Date()
        });
      }

      return syncData;

    } catch (error) {
      logger.error('Sync data calculation failed:', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update participant heartbeat and calculate lag
   * @param {String} participantId - participant ID
   * @param {Object} heartbeatData - heartbeat information
   * @returns {Promise<Object>} updated lag information
   */
  async updateParticipantHeartbeat(participantId, heartbeatData) {
    try {
      const {
        clientTime,
        currentPosition,
        isPlaying,
        playbackRate,
        networkInfo = {}
      } = heartbeatData;

      const serverTime = new Date();
      const participant = await SyncParticipant.findById(participantId);

      if (!participant || !participant.isActive) {
        throw new Error('Participant not found or inactive');
      }

      // Calculate network lag
      const networkLag = syncUtils.calculateNetworkLag(
        clientTime,
        serverTime,
        { method: 'timestamp-diff' }
      );

      // Update lag calculations
      let lagData = this.lagCalculations.get(participantId);
      if (!lagData) {
        lagData = {
          samples: [],
          averageLag: 0,
          lastCalculation: serverTime
        };
      }

      // Add new lag sample
      lagData.samples.push({
        lag: networkLag,
        timestamp: serverTime,
        position: currentPosition,
        isPlaying
      });

      // Keep only recent samples (last 30 seconds)
      const cutoffTime = new Date(serverTime.getTime() - 30000);
      lagData.samples = lagData.samples.filter(sample => sample.timestamp > cutoffTime);

      // Calculate new average lag
      lagData.averageLag = syncUtils.calculateAverageLag(
        lagData.samples.map(s => s.lag)
      );
      lagData.lastCalculation = serverTime;

      this.lagCalculations.set(participantId, lagData);

      // Update participant record
      await SyncParticipant.findByIdAndUpdate(participantId, {
        lastHeartbeat: serverTime,
        lastKnownPosition: currentPosition,
        averageLag: lagData.averageLag,
        syncQuality: syncUtils.determineSyncQuality(lagData.averageLag)
      });

      // Update heartbeat tracking
      this.participantHeartbeats.set(participantId, serverTime);

      return {
        participantId,
        networkLag,
        averageLag: lagData.averageLag,
        sampleCount: lagData.samples.length,
        syncQuality: syncUtils.determineSyncQuality(lagData.averageLag)
      };

    } catch (error) {
      logger.error('Heartbeat update failed:', {
        participantId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Leave a synchronization session
   * @param {String} sessionId - session ID
   * @param {String} userId - leaving user ID
   * @param {String} deviceId - device ID
   * @returns {Promise<Boolean>} success status
   */
  async leaveSession(sessionId, userId, deviceId) {
    try {
      logger.info('User leaving session:', {
        sessionId,
        userId,
        deviceId
      });

      // Find and deactivate participant
      const participant = await SyncParticipant.findOneAndUpdate(
        {
          session: sessionId,
          user: userId,
          deviceId,
          isActive: true
        },
        {
          isActive: false,
          leftAt: new Date()
        },
        { new: true }
      );

      if (!participant) {
        logger.warn('Participant not found for leave operation:', {
          sessionId,
          userId,
          deviceId
        });
        return false;
      }

      // Update session participant count
      await SyncSession.findByIdAndUpdate(sessionId, {
        $inc: { participantCount: -1 },
        updatedAt: new Date()
      });

      // Remove from cache
      const cachedSession = this.activeSessions.get(sessionId);
      if (cachedSession) {
        cachedSession.participants.delete(participant._id.toString());
      }

      // Clean up tracking data
      const participantId = participant._id.toString();
      this.participantHeartbeats.delete(participantId);
      this.lagCalculations.delete(participantId);

      // Emit leave event
      this.emit('participant-left', {
        sessionId,
        participant,
        userId,
        deviceId
      });

      // Check if host left - transfer control or end session
      if (participant.isHost) {
        await this.handleHostLeave(sessionId);
      }

      logger.info('User left session successfully:', {
        sessionId,
        participantId,
        userId
      });

      return true;

    } catch (error) {
      logger.error('Session leave failed:', {
        sessionId,
        userId,
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * End a synchronization session
   * @param {String} sessionId - session ID
   * @param {String} userId - user ending the session
   * @returns {Promise<Boolean>} success status
   */
  async endSession(sessionId, userId) {
    try {
      logger.info('Ending session:', { sessionId, userId });

      const session = await SyncSession.findById(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Check if user has permission to end session
      const participant = await SyncParticipant.findOne({
        session: sessionId,
        user: userId,
        isActive: true
      });

      if (!participant || (!participant.isHost && !participant.isController)) {
        throw new Error('User does not have permission to end session');
      }

      // Deactivate session
      await SyncSession.findByIdAndUpdate(sessionId, {
        isActive: false,
        endedAt: new Date(),
        endedBy: userId,
        updatedAt: new Date()
      });

      // Deactivate all participants
      await SyncParticipant.updateMany(
        { session: sessionId, isActive: true },
        {
          isActive: false,
          leftAt: new Date()
        }
      );

      // Clean up cache and tracking data
      this.activeSessions.delete(sessionId);
      
      // Remove participant tracking data
      const participants = await SyncParticipant.find({ session: sessionId });
      for (const p of participants) {
        const pid = p._id.toString();
        this.participantHeartbeats.delete(pid);
        this.lagCalculations.delete(pid);
      }

      // Emit session end event
      this.emit('session-ended', {
        sessionId,
        endedBy: userId,
        endedAt: new Date()
      });

      logger.info('Session ended successfully:', { sessionId, userId });

      return true;

    } catch (error) {
      logger.error('Session end failed:', {
        sessionId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get session information
   * @param {String} sessionId - session ID
   * @param {Boolean} includeParticipants - whether to include participant data
   * @returns {Promise<Object>} session data
   */
  async getSession(sessionId, includeParticipants = false) {
    try {
      // Try cache first
      const cachedSession = this.activeSessions.get(sessionId);
      if (cachedSession && !includeParticipants) {
        return cachedSession;
      }

      // Fetch from database
      let query = SyncSession.findById(sessionId);
      
      if (includeParticipants) {
        query = query.populate('video', 'title duration thumbnail');
      }

      const session = await query.lean();

      if (!session) {
        return null;
      }

      if (includeParticipants) {
        const participants = await SyncParticipant.find({
          session: sessionId,
          isActive: true
        }).populate('user', 'username email').lean();

        session.participants = participants;
      }

      return session;

    } catch (error) {
      logger.error('Session retrieval failed:', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find session by access code
   * @param {String} accessCode - session access code
   * @returns {Promise<Object>} session data
   */
  async findSessionByAccessCode(accessCode) {
    try {
      const session = await SyncSession.findOne({
        accessCode: accessCode.toUpperCase(),
        isActive: true
      }).populate('video', 'title duration thumbnail').lean();

      return session;

    } catch (error) {
      logger.error('Session lookup by access code failed:', {
        accessCode,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's active sessions
   * @param {String} userId - user ID
   * @returns {Promise<Array>} user's sessions
   */
  async getUserSessions(userId) {
    try {
      const sessions = await SyncSession.find({
        $or: [
          { hostUser: userId },
          { _id: { $in: await this.getUserParticipantSessions(userId) } }
        ],
        isActive: true
      }).populate('video', 'title duration thumbnail').lean();

      return sessions;

    } catch (error) {
      logger.error('User sessions retrieval failed:', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get session IDs where user is a participant
   * @param {String} userId - user ID
   * @returns {Promise<Array>} session IDs
   */
  async getUserParticipantSessions(userId) {
    try {
      const participants = await SyncParticipant.find({
        user: userId,
        isActive: true
      }).distinct('session');

      return participants;

    } catch (error) {
      logger.error('User participant sessions retrieval failed:', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle host leaving session
   * @param {String} sessionId - session ID
   */
  async handleHostLeave(sessionId) {
    try {
      // Find next eligible host (first controller or longest participant)
      const eligibleParticipants = await SyncParticipant.find({
        session: sessionId,
        isActive: true
      }).sort({ isController: -1, joinedAt: 1 });

      if (eligibleParticipants.length === 0) {
        // No participants left, end session
        await this.endSession(sessionId, 'system');
        return;
      }

      // Promote first eligible participant to host
      const newHost = eligibleParticipants[0];
      await SyncParticipant.findByIdAndUpdate(newHost._id, {
        isHost: true,
        isController: true
      });

      logger.info('New host assigned:', {
        sessionId,
        newHostId: newHost._id,
        userId: newHost.user
      });

      // Emit host change event
      this.emit('host-changed', {
        sessionId,
        newHost,
        previousHost: null
      });

    } catch (error) {
      logger.error('Host leave handling failed:', {
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * Clean up inactive sessions
   */
  async cleanupInactiveSessions() {
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours

      // Find sessions with no recent activity
      const inactiveSessions = await SyncSession.find({
        isActive: true,
        updatedAt: { $lt: cutoffTime }
      });

      for (const session of inactiveSessions) {
        await this.endSession(session._id, 'system');
        logger.info('Cleaned up inactive session:', {
          sessionId: session._id,
          lastActivity: session.updatedAt
        });
      }

    } catch (error) {
      logger.error('Session cleanup failed:', error);
    }
  }

  /**
   * Check participant heartbeats and remove stale participants
   */
  async checkParticipantHeartbeats() {
    try {
      const cutoffTime = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes

      for (const [participantId, lastHeartbeat] of this.participantHeartbeats) {
        if (lastHeartbeat < cutoffTime) {
          // Mark participant as inactive
          const participant = await SyncParticipant.findByIdAndUpdate(
            participantId,
            {
              isActive: false,
              leftAt: new Date()
            },
            { new: true }
          );

          if (participant) {
            // Update session participant count
            await SyncSession.findByIdAndUpdate(participant.session, {
              $inc: { participantCount: -1 }
            });

            // Clean up tracking data
            this.participantHeartbeats.delete(participantId);
            this.lagCalculations.delete(participantId);

            logger.info('Removed stale participant:', {
              participantId,
              sessionId: participant.session,
              lastHeartbeat
            });

            // Emit participant timeout event
            this.emit('participant-timeout', {
              participant,
              lastHeartbeat
            });
          }
        }
      }

    } catch (error) {
      logger.error('Heartbeat check failed:', error);
    }
  }
}

// Create singleton instance
const syncService = new SyncService();

export default syncService;
