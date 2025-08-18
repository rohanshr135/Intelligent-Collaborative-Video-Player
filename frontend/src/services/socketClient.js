/**
 * Socket.IO Client Utility for Intelligent Collaborative Video Player
 * 
 * This utility provides a comprehensive interface for real-time communication
 * between the frontend and backend for sync sessions, branching videos, and collaborative editing.
 */

import { io } from 'socket.io-client';

class VideoPlayerSocketClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.currentSession = null;
    this.userId = null;
    this.deviceId = this.generateDeviceId();
    this.deviceName = this.getDeviceName();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.heartbeatInterval = null;
    this.lagCompensation = 0;
    
    // Event listeners
    this.listeners = new Map();
    
    // Performance tracking
    this.performance = {
      lagMs: 0,
      lastHeartbeat: null,
      reconnects: 0
    };
  }

  /**
   * Initialize Socket.IO connection
   */
  async connect(serverUrl, userToken, options = {}) {
    try {
      if (this.socket?.connected) {
        console.warn('Socket already connected');
        return true;
      }

      const socketOptions = {
        auth: {
          token: userToken
        },
        query: {
          deviceId: this.deviceId,
          deviceName: this.deviceName,
          ...options.query
        },
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: false,
        ...options
      };

      this.socket = io(serverUrl, socketOptions);
      
      // Set up core event handlers
      this.setupCoreHandlers();
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.socket.on('connect', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          console.log('Socket.IO connected successfully');
          resolve(true);
        });

        this.socket.on('connect_error', (error) => {
          clearTimeout(timeout);
          console.error('Socket.IO connection error:', error);
          reject(error);
        });
      });

    } catch (error) {
      console.error('Failed to initialize socket connection:', error);
      throw error;
    }
  }

  /**
   * Set up core event handlers
   */
  setupCoreHandlers() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.emit('connection:established');
      console.log('Connected to server');
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.stopHeartbeat();
      this.emit('connection:lost', { reason });
      console.log('Disconnected from server:', reason);
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, don't reconnect
        return;
      }
      
      this.handleReconnection();
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.emit('connection:error', { error: error.message });
    });

    // Heartbeat response
    this.socket.on('pong', (data) => {
      if (this.performance.lastHeartbeat) {
        this.performance.lagMs = Date.now() - this.performance.lastHeartbeat;
      }
      this.emit('heartbeat:response', { 
        lag: this.performance.lagMs,
        serverTime: data.serverTime 
      });
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.emit('socket:error', error);
    });

    // Lag compensation
    this.socket.on('sync:lag-status', (data) => {
      this.lagCompensation = data.lagCompensationOffset || 0;
      this.emit('sync:lag-detected', data);
    });
  }

  /**
   * Start heartbeat monitoring
   */
  startHeartbeat() {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.currentSession) {
        this.performance.lastHeartbeat = Date.now();
        this.socket.emit('heartbeat', {
          roomId: this.currentSession,
          deviceInfo: {
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          },
          performance: this.performance
        });
      }
    }, 3000); // Every 3 seconds
  }

  /**
   * Stop heartbeat monitoring
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Handle reconnection logic
   */
  handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('connection:failed', { 
        message: 'Max reconnection attempts reached' 
      });
      return;
    }

    this.reconnectAttempts++;
    this.performance.reconnects++;
    
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    setTimeout(() => {
      if (!this.isConnected) {
        console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        this.socket.connect();
      }
    }, delay);
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  /**
   * Join a sync session
   */
  async joinSession(sessionId, options = {}) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Join session timeout'));
      }, 10000);

      this.socket.once('session:joined', (data) => {
        clearTimeout(timeout);
        this.currentSession = sessionId;
        this.emit('session:joined', data);
        resolve(data);
      });

      this.socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(error.message || 'Failed to join session'));
      });

      this.socket.emit('session:join', {
        sessionId,
        videoId: options.videoId,
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        ...options
      });
    });
  }

  /**
   * Leave current session
   */
  leaveSession() {
    if (!this.currentSession) return;

    this.socket.emit('session:leave', {
      sessionId: this.currentSession,
      userId: this.userId,
      deviceId: this.deviceId
    });

    this.currentSession = null;
    this.emit('session:left');
  }

  // ============================================
  // PLAYBACK SYNCHRONIZATION
  // ============================================

  /**
   * Send sync state update
   */
  updateSyncState(timestamp, isPlaying, playbackRate = 1.0) {
    if (!this.currentSession) return;

    this.socket.emit('sync:state', {
      sessionId: this.currentSession,
      timestamp: parseFloat(timestamp),
      isPlaying: Boolean(isPlaying),
      playbackRate: parseFloat(playbackRate)
    });
  }

  /**
   * Send seek event
   */
  seekTo(timestamp) {
    if (!this.currentSession) return;

    this.socket.emit('sync:seek', {
      sessionId: this.currentSession,
      timestamp: parseFloat(timestamp)
    });
  }

  /**
   * Send play event
   */
  play(timestamp) {
    if (!this.currentSession) return;

    this.socket.emit('sync:play', {
      sessionId: this.currentSession,
      timestamp: parseFloat(timestamp)
    });
  }

  /**
   * Send pause event
   */
  pause(timestamp) {
    if (!this.currentSession) return;

    this.socket.emit('sync:pause', {
      sessionId: this.currentSession,
      timestamp: parseFloat(timestamp)
    });
  }

  // ============================================
  // BRANCHING VIDEO INTERACTIONS
  // ============================================

  /**
   * Make a choice in branching video
   */
  makeChoice(decisionPointId, choiceIndex) {
    if (!this.currentSession) return;

    this.socket.emit('branch:choice', {
      sessionId: this.currentSession,
      userId: this.userId,
      decisionPointId,
      choiceMade: parseInt(choiceIndex)
    });
  }

  // ============================================
  // COLLABORATIVE EDITING
  // ============================================

  /**
   * Add a marker
   */
  addMarker(videoId, timestamp, label, markerType = 'annotation', properties = {}) {
    if (!this.currentSession) return;

    this.socket.emit('editor:marker-add', {
      sessionId: this.currentSession,
      videoId,
      timestamp: parseFloat(timestamp),
      label,
      markerType,
      properties
    });
  }

  /**
   * Update a marker
   */
  updateMarker(markerId, updates) {
    if (!this.currentSession) return;

    this.socket.emit('editor:marker-update', {
      sessionId: this.currentSession,
      markerId,
      updates
    });
  }

  /**
   * Delete a marker
   */
  deleteMarker(markerId) {
    if (!this.currentSession) return;

    this.socket.emit('editor:marker-delete', {
      sessionId: this.currentSession,
      markerId
    });
  }

  // ============================================
  // CHAT AND COMMUNICATION
  // ============================================

  /**
   * Send chat message
   */
  sendChatMessage(message, type = 'text') {
    if (!this.currentSession) return;

    this.socket.emit('chat_message', {
      roomId: this.currentSession,
      message: message.trim(),
      type
    });
  }

  /**
   * Change video quality preference
   */
  changeQuality(quality) {
    if (!this.currentSession) return;

    this.socket.emit('quality_change', {
      roomId: this.currentSession,
      quality,
      userId: this.userId
    });
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // Also listen on socket for socket events
    if (this.socket && event.includes(':')) {
      this.socket.on(event, callback);
    }
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }

    if (this.socket && event.includes(':')) {
      this.socket.off(event, callback);
    }
  }

  /**
   * Emit custom event
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Generate unique device ID
   */
  generateDeviceId() {
    const stored = localStorage.getItem('videoPlayerDeviceId');
    if (stored) return stored;

    const deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    localStorage.setItem('videoPlayerDeviceId', deviceId);
    return deviceId;
  }

  /**
   * Get device name
   */
  getDeviceName() {
    const userAgent = navigator.userAgent;
    
    if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
      return 'Mobile Device';
    } else if (/Mac/.test(userAgent)) {
      return 'Mac Computer';
    } else if (/Windows/.test(userAgent)) {
      return 'Windows Computer';
    } else if (/Linux/.test(userAgent)) {
      return 'Linux Computer';
    }
    
    return 'Unknown Device';
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      currentSession: this.currentSession,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      performance: this.performance,
      lagCompensation: this.lagCompensation
    };
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this.stopHeartbeat();
    
    if (this.currentSession) {
      this.leaveSession();
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.currentSession = null;
    this.emit('connection:closed');
  }
}

// Export singleton instance
const socketClient = new VideoPlayerSocketClient();

export default socketClient;

// Also export the class for custom instances
export { VideoPlayerSocketClient };
