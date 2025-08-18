import logger from '../utils/logger.js';

/**
 * Socket Manager for handling socket connections and room management
 */
class SocketManager {
  constructor() {
    this.connections = new Map(); // socketId -> user data
    this.rooms = new Map(); // roomId -> room data
    this.userSockets = new Map(); // userId -> Set of socketIds
  }

  /**
   * Add a socket connection
   */
  addConnection(socket, userData) {
    this.connections.set(socket.id, {
      socket,
      userId: userData.userId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      currentRoom: null,
      ...userData
    });

    // Track user's sockets
    if (!this.userSockets.has(userData.userId)) {
      this.userSockets.set(userData.userId, new Set());
    }
    this.userSockets.get(userData.userId).add(socket.id);

    logger.debug(`Socket connection added: ${socket.id} for user ${userData.userId}`);
  }

  /**
   * Remove a socket connection
   */
  removeConnection(socketId) {
    const connection = this.connections.get(socketId);
    if (connection) {
      // Remove from user's socket set
      const userSockets = this.userSockets.get(connection.userId);
      if (userSockets) {
        userSockets.delete(socketId);
        if (userSockets.size === 0) {
          this.userSockets.delete(connection.userId);
        }
      }

      // Leave current room if any
      if (connection.currentRoom) {
        this.leaveRoom(socketId, connection.currentRoom);
      }

      this.connections.delete(socketId);
      logger.debug(`Socket connection removed: ${socketId}`);
    }
  }

  /**
   * Join a room
   */
  joinRoom(socketId, roomId, roomData = {}) {
    const connection = this.connections.get(socketId);
    if (!connection) return false;

    // Leave current room first
    if (connection.currentRoom) {
      this.leaveRoom(socketId, connection.currentRoom);
    }

    // Create room if it doesn't exist
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        participants: new Map(),
        createdAt: new Date(),
        lastActivity: new Date(),
        ...roomData
      });
    }

    const room = this.rooms.get(roomId);
    
    // Add participant to room
    room.participants.set(socketId, {
      socketId,
      userId: connection.userId,
      joinedAt: new Date(),
      lastActivity: new Date()
    });

    // Update connection
    connection.currentRoom = roomId;
    connection.lastActivity = new Date();

    // Join socket room
    connection.socket.join(roomId);

    room.lastActivity = new Date();

    logger.debug(`Socket ${socketId} joined room ${roomId}. Room size: ${room.participants.size}`);
    return true;
  }

  /**
   * Leave a room
   */
  leaveRoom(socketId, roomId) {
    const connection = this.connections.get(socketId);
    const room = this.rooms.get(roomId);

    if (connection && room) {
      // Remove from room
      room.participants.delete(socketId);
      connection.currentRoom = null;
      
      // Leave socket room
      connection.socket.leave(roomId);

      // Clean up empty rooms
      if (room.participants.size === 0) {
        this.rooms.delete(roomId);
        logger.debug(`Room ${roomId} deleted (empty)`);
      } else {
        room.lastActivity = new Date();
      }

      logger.debug(`Socket ${socketId} left room ${roomId}`);
      return true;
    }

    return false;
  }

  /**
   * Get room participants
   */
  getRoomParticipants(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    return Array.from(room.participants.values()).map(participant => {
      const connection = this.connections.get(participant.socketId);
      return {
        socketId: participant.socketId,
        userId: participant.userId,
        joinedAt: participant.joinedAt,
        lastActivity: participant.lastActivity,
        deviceInfo: connection?.deviceInfo || {}
      };
    });
  }

  /**
   * Get user's sockets
   */
  getUserSockets(userId) {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds) return [];

    return Array.from(socketIds).map(socketId => {
      const connection = this.connections.get(socketId);
      return connection ? connection.socket : null;
    }).filter(Boolean);
  }

  /**
   * Broadcast to room
   */
  broadcastToRoom(roomId, event, data, excludeSocketId = null) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    let broadcastCount = 0;
    room.participants.forEach((participant, socketId) => {
      if (socketId !== excludeSocketId) {
        const connection = this.connections.get(socketId);
        if (connection) {
          connection.socket.emit(event, data);
          broadcastCount++;
        }
      }
    });

    logger.debug(`Broadcasted ${event} to ${broadcastCount} participants in room ${roomId}`);
    return broadcastCount > 0;
  }

  /**
   * Broadcast to user (all their sockets)
   */
  broadcastToUser(userId, event, data) {
    const sockets = this.getUserSockets(userId);
    sockets.forEach(socket => {
      socket.emit(event, data);
    });

    logger.debug(`Broadcasted ${event} to ${sockets.length} sockets for user ${userId}`);
    return sockets.length > 0;
  }

  /**
   * Update user activity
   */
  updateActivity(socketId) {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.lastActivity = new Date();
      
      // Update room activity too
      if (connection.currentRoom) {
        const room = this.rooms.get(connection.currentRoom);
        if (room) {
          const participant = room.participants.get(socketId);
          if (participant) {
            participant.lastActivity = new Date();
          }
          room.lastActivity = new Date();
        }
      }
    }
  }

  /**
   * Clean up inactive connections and rooms
   */
  cleanupInactive(maxInactiveMs = 5 * 60 * 1000) { // 5 minutes
    const now = new Date();
    let cleanedConnections = 0;
    let cleanedRooms = 0;

    // Clean up inactive connections
    for (const [socketId, connection] of this.connections) {
      if (now - connection.lastActivity > maxInactiveMs) {
        this.removeConnection(socketId);
        cleanedConnections++;
      }
    }

    // Clean up inactive rooms
    for (const [roomId, room] of this.rooms) {
      if (now - room.lastActivity > maxInactiveMs || room.participants.size === 0) {
        this.rooms.delete(roomId);
        cleanedRooms++;
      }
    }

    if (cleanedConnections > 0 || cleanedRooms > 0) {
      logger.info(`Cleaned up ${cleanedConnections} inactive connections and ${cleanedRooms} inactive rooms`);
    }

    return { cleanedConnections, cleanedRooms };
  }

  /**
   * Get statistics
   */
  getStats() {
    const roomStats = Array.from(this.rooms.values()).map(room => ({
      id: room.id,
      participants: room.participants.size,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity
    }));

    return {
      totalConnections: this.connections.size,
      totalRooms: this.rooms.size,
      totalUsers: this.userSockets.size,
      rooms: roomStats,
      averageRoomSize: roomStats.length > 0 
        ? roomStats.reduce((sum, room) => sum + room.participants, 0) / roomStats.length 
        : 0
    };
  }

  /**
   * Check if user is in room
   */
  isUserInRoom(userId, roomId) {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds) return false;

    for (const socketId of socketIds) {
      const connection = this.connections.get(socketId);
      if (connection && connection.currentRoom === roomId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get room by socket
   */
  getRoomBySocket(socketId) {
    const connection = this.connections.get(socketId);
    if (!connection || !connection.currentRoom) return null;
    
    return this.rooms.get(connection.currentRoom);
  }
}

// Export singleton instance
const socketManager = new SocketManager();

// Cleanup interval
setInterval(() => {
  socketManager.cleanupInactive();
}, 60000); // Run cleanup every minute

export default socketManager;
