import { SyncRoom } from '../models/SyncRoom.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const unlink = promisify(fs.unlink);
const rmdir = promisify(fs.rmdir);

/**
 * Room Service - Handles video room management, temporary storage, and cleanup
 */
export class RoomService {
  constructor() {
    this.cleanupInterval = null;
    this.startCleanupService();
  }

  /**
   * Start the cleanup service for expired rooms and videos
   */
  startCleanupService() {
    // Run cleanup every 15 minutes
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredRooms();
        await this.cleanupExpiredVideos();
      } catch (error) {
        logger.error('Cleanup service error:', error);
      }
    }, 15 * 60 * 1000);

    logger.info('🧹 Room cleanup service started');
  }

  /**
   * Stop the cleanup service
   */
  stopCleanupService() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('🧹 Room cleanup service stopped');
    }
  }

  /**
   * Create a new video room with automatic expiration
   */
  async createVideoRoom(hostId, videoMetadata, options = {}) {
    try {
      const {
        maxParticipants = 10,
        allowControl = 'host',
        autoSync = true,
        lagCompensation = true,
        customExpiry = null
      } = options;

      // Calculate video expiration based on duration
      const videoExpiryHours = customExpiry || Math.max(1, Math.ceil((videoMetadata.duration || 3600) / 3600));
      const videoExpiresAt = new Date(Date.now() + (videoExpiryHours * 60 * 60 * 1000));

      // Room expires when video expires
      const roomExpiresAt = videoExpiresAt;

      const roomData = {
        hostId,
        settings: {
          maxParticipants: parseInt(maxParticipants),
          allowControl,
          autoSync,
          lagCompensation
        },
        video: {
          title: videoMetadata.title,
          duration: videoMetadata.duration,
          fileSize: videoMetadata.fileSize,
          mimeType: videoMetadata.mimeType,
          resolution: videoMetadata.resolution,
          uploadedBy: hostId,
          uploadedAt: new Date(),
          expiresAt: videoExpiresAt,
          isTemporary: true
        },
        currentState: {
          t: 0,
          paused: true,
          rate: 1,
          videoUrl: `/api/videos/${videoMetadata._id}/stream`,
          videoHash: videoMetadata._id,
          lastUpdatedBy: hostId,
          lastUpdatedAt: new Date()
        },
        participants: [{
          userId: hostId,
          isHost: true,
          canControl: true,
          lastSeen: new Date(),
          lastSync: new Date()
        }],
        controllers: [hostId],
        expiresAt: roomExpiresAt,
        status: 'active'
      };

      const room = await SyncRoom.create(roomData);
      
      logger.info(`🎬 Video room created: ${room.code} with video: ${videoMetadata.title}`);
      
      return room;
    } catch (error) {
      logger.error('Error creating video room:', error);
      throw error;
    }
  }

  /**
   * Join a video room with validation
   */
  async joinVideoRoom(roomCode, userId, deviceInfo = {}) {
    try {
      const room = await SyncRoom.findOne({ code: roomCode.toUpperCase() });
      
      if (!room) {
        throw new Error('Room not found');
      }

      if (room.status !== 'active') {
        throw new Error('Room is not active');
      }

      if (new Date() > room.expiresAt) {
        throw new Error('Room has expired');
      }

      if (room.participants.length >= room.settings.maxParticipants) {
        throw new Error('Room is at maximum capacity');
      }

      const now = new Date();
      
      // Clean up expired participants
      room.participants = room.participants.filter(p => (now - p.lastSeen) < 1000 * 60 * 60);
      
      // Check if user is already in room
      const existingParticipant = room.participants.find(p => p.userId === userId);
      
      if (existingParticipant) {
        // Update existing participant
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
      
      logger.info(`👤 User ${userId} joined video room ${room.code}`);
      
      return room;
    } catch (error) {
      logger.error('Error joining video room:', error);
      throw error;
    }
  }

  /**
   * Update room playback state with permission check
   */
  async updatePlaybackState(roomCode, userId, stateUpdate) {
    try {
      const room = await SyncRoom.findOne({ code: roomCode.toUpperCase() });
      
      if (!room) {
        throw new Error('Room not found');
      }

      const participant = room.participants.find(p => p.userId === userId);
      if (!participant || !participant.canControl) {
        throw new Error('No permission to control playback');
      }

      // Update state
      room.currentState = {
        ...room.currentState,
        ...stateUpdate,
        lastUpdatedBy: userId,
        lastUpdatedAt: new Date()
      };

      await room.save();
      
      logger.info(`🎮 Playback state updated in room ${roomCode} by ${userId}`);
      
      return room.currentState;
    } catch (error) {
      logger.error('Error updating playback state:', error);
      throw error;
    }
  }

  /**
   * Get room statistics and health
   */
  async getRoomStats(roomCode) {
    try {
      const room = await SyncRoom.findOne({ code: roomCode.toUpperCase() });
      
      if (!room) {
        throw new Error('Room not found');
      }

      const now = new Date();
      const activeParticipants = room.participants.filter(p => (now - p.lastSeen) < 1000 * 60 * 5); // 5 minutes
      
      const stats = {
        code: room.code,
        totalParticipants: room.participants.length,
        activeParticipants: activeParticipants.length,
        roomAge: Math.floor((now - room.createdAt) / 1000 / 60), // minutes
        timeUntilExpiry: Math.floor((room.expiresAt - now) / 1000 / 60), // minutes
        videoDuration: room.video?.duration || 0,
        currentPlaybackTime: room.currentState?.t || 0,
        isExpired: now > room.expiresAt,
        status: room.status,
        hostId: room.hostId,
        controllers: room.controllers
      };

      return stats;
    } catch (error) {
      logger.error('Error getting room stats:', error);
      throw error;
    }
  }

  /**
   * End a room session (host only)
   */
  async endRoom(roomCode, userId) {
    try {
      const room = await SyncRoom.findOne({ code: roomCode.toUpperCase() });
      
      if (!room) {
        throw new Error('Room not found');
      }

      if (userId !== room.hostId) {
        throw new Error('Only host can end the room');
      }

      room.status = 'ended';
      await room.save();
      
      logger.info(`🔚 Room ${roomCode} ended by host ${userId}`);
      
      return true;
    } catch (error) {
      logger.error('Error ending room:', error);
      throw error;
    }
  }

  /**
   * Clean up expired rooms
   */
  async cleanupExpiredRooms() {
    try {
      const now = new Date();
      const expiredRooms = await SyncRoom.find({
        expiresAt: { $lt: now },
        status: { $ne: 'ended' }
      });

      for (const room of expiredRooms) {
        room.status = 'ended';
        await room.save();
        logger.info(`🧹 Expired room ${room.code} marked as ended`);
      }

      if (expiredRooms.length > 0) {
        logger.info(`🧹 Cleaned up ${expiredRooms.length} expired rooms`);
      }
    } catch (error) {
      logger.error('Error cleaning up expired rooms:', error);
    }
  }

  /**
   * Clean up expired videos and their files
   */
  async cleanupExpiredVideos() {
    try {
      const now = new Date();
      const roomsWithExpiredVideos = await SyncRoom.find({
        'video.expiresAt': { $lt: now },
        'video.isTemporary': true
      });

      for (const room of roomsWithExpiredVideos) {
        try {
          // Mark video as expired
          room.video.isTemporary = false;
          await room.save();
          
          logger.info(`🧹 Expired video marked in room ${room.code}`);
        } catch (error) {
          logger.error(`Error marking expired video in room ${room.code}:`, error);
        }
      }

      if (roomsWithExpiredVideos.length > 0) {
        logger.info(`🧹 Cleaned up ${roomsWithExpiredVideos.length} expired videos`);
      }
    } catch (error) {
      logger.error('Error cleaning up expired videos:', error);
    }
  }

  /**
   * Get active rooms summary
   */
  async getActiveRoomsSummary() {
    try {
      const now = new Date();
      const activeRooms = await SyncRoom.find({
        status: 'active',
        expiresAt: { $gt: now }
      }).select('code hostId participants video createdAt expiresAt');

      const summary = activeRooms.map(room => ({
        code: room.code,
        hostId: room.hostId,
        participantCount: room.participants.length,
        videoTitle: room.video?.title || 'No video',
        videoDuration: room.video?.duration || 0,
        createdAt: room.createdAt,
        expiresAt: room.expiresAt,
        timeUntilExpiry: Math.floor((room.expiresAt - now) / 1000 / 60) // minutes
      }));

      return summary;
    } catch (error) {
      logger.error('Error getting active rooms summary:', error);
      throw error;
    }
  }

  /**
   * Extend room expiration (host only)
   */
  async extendRoomExpiration(roomCode, userId, additionalHours = 1) {
    try {
      const room = await SyncRoom.findOne({ code: roomCode.toUpperCase() });
      
      if (!room) {
        throw new Error('Room not found');
      }

      if (userId !== room.hostId) {
        throw new Error('Only host can extend room expiration');
      }

      const newExpiry = new Date(room.expiresAt.getTime() + (additionalHours * 60 * 60 * 1000));
      
      room.expiresAt = newExpiry;
      if (room.video) {
        room.video.expiresAt = newExpiry;
      }
      
      await room.save();
      
      logger.info(`⏰ Room ${roomCode} expiration extended by ${additionalHours} hours by host ${userId}`);
      
      return room.expiresAt;
    } catch (error) {
      logger.error('Error extending room expiration:', error);
      throw error;
    }
  }
}

export default new RoomService();

