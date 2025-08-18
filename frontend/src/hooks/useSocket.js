/**
 * React Hook for Socket.IO Integration
 * 
 * Provides easy-to-use hooks for managing Socket.IO connections,
 * sync sessions, and real-time events in React components.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import socketClient from '../services/socketClient';

/**
 * Main Socket.IO hook
 */
export const useSocket = (serverUrl, userToken, options = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const connectionAttempted = useRef(false);

  useEffect(() => {
    if (!serverUrl || !userToken || connectionAttempted.current) return;

    const connect = async () => {
      setIsConnecting(true);
      setConnectionError(null);
      connectionAttempted.current = true;

      try {
        await socketClient.connect(serverUrl, userToken, options);
        setIsConnected(true);
      } catch (error) {
        setConnectionError(error.message);
        console.error('Socket connection failed:', error);
      } finally {
        setIsConnecting(false);
      }
    };

    connect();

    // Set up connection status listeners
    const handleConnected = () => setIsConnected(true);
    const handleDisconnected = () => setIsConnected(false);
    const handleError = (error) => setConnectionError(error.message);

    socketClient.on('connection:established', handleConnected);
    socketClient.on('connection:lost', handleDisconnected);
    socketClient.on('connection:error', handleError);

    // Cleanup
    return () => {
      socketClient.off('connection:established', handleConnected);
      socketClient.off('connection:lost', handleDisconnected);
      socketClient.off('connection:error', handleError);
      
      if (connectionAttempted.current) {
        socketClient.disconnect();
        connectionAttempted.current = false;
      }
    };
  }, [serverUrl, userToken]);

  const reconnect = useCallback(async () => {
    if (isConnecting) return;
    
    setIsConnecting(true);
    setConnectionError(null);
    
    try {
      await socketClient.connect(serverUrl, userToken, options);
      setIsConnected(true);
    } catch (error) {
      setConnectionError(error.message);
    } finally {
      setIsConnecting(false);
    }
  }, [serverUrl, userToken, options, isConnecting]);

  return {
    isConnected,
    isConnecting,
    connectionError,
    reconnect,
    socket: socketClient
  };
};

/**
 * Hook for managing sync sessions
 */
export const useSyncSession = () => {
  const [currentSession, setCurrentSession] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [sessionState, setSessionState] = useState({
    timestamp: 0,
    isPlaying: false,
    playbackRate: 1.0
  });
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);

  useEffect(() => {
    // Session events
    const handleSessionJoined = (data) => {
      setCurrentSession(data.sessionId);
      setParticipants(data.participants || []);
      setSessionState(data.currentState || sessionState);
      setIsJoining(false);
      setJoinError(null);
    };

    const handleSessionLeft = () => {
      setCurrentSession(null);
      setParticipants([]);
      setSessionState({ timestamp: 0, isPlaying: false, playbackRate: 1.0 });
    };

    const handleUserJoined = (data) => {
      setParticipants(prev => [...prev, data]);
    };

    const handleUserLeft = (data) => {
      setParticipants(prev => prev.filter(p => p.userId !== data.userId));
    };

    const handleSyncStateUpdate = (data) => {
      setSessionState({
        timestamp: data.timestamp,
        isPlaying: data.isPlaying,
        playbackRate: data.playbackRate || 1.0,
        lastUpdate: data.serverTimestamp,
        updatedBy: data.userId
      });
    };

    const handleSyncSeek = (data) => {
      setSessionState(prev => ({
        ...prev,
        timestamp: data.timestamp,
        lastUpdate: data.serverTimestamp,
        updatedBy: data.userId
      }));
    };

    const handleSyncPlay = (data) => {
      setSessionState(prev => ({
        ...prev,
        timestamp: data.timestamp,
        isPlaying: true,
        lastUpdate: data.serverTimestamp,
        updatedBy: data.userId
      }));
    };

    const handleSyncPause = (data) => {
      setSessionState(prev => ({
        ...prev,
        timestamp: data.timestamp,
        isPlaying: false,
        lastUpdate: data.serverTimestamp,
        updatedBy: data.userId
      }));
    };

    const handleError = (error) => {
      if (isJoining) {
        setJoinError(error.message);
        setIsJoining(false);
      }
    };

    // Register listeners
    socketClient.on('session:joined', handleSessionJoined);
    socketClient.on('session:left', handleSessionLeft);
    socketClient.on('session:user-joined', handleUserJoined);
    socketClient.on('session:user-left', handleUserLeft);
    socketClient.on('sync:state-update', handleSyncStateUpdate);
    socketClient.on('sync:seek-update', handleSyncSeek);
    socketClient.on('sync:play-update', handleSyncPlay);
    socketClient.on('sync:pause-update', handleSyncPause);
    socketClient.on('socket:error', handleError);

    return () => {
      socketClient.off('session:joined', handleSessionJoined);
      socketClient.off('session:left', handleSessionLeft);
      socketClient.off('session:user-joined', handleUserJoined);
      socketClient.off('session:user-left', handleUserLeft);
      socketClient.off('sync:state-update', handleSyncStateUpdate);
      socketClient.off('sync:seek-update', handleSyncSeek);
      socketClient.off('sync:play-update', handleSyncPlay);
      socketClient.off('sync:pause-update', handleSyncPause);
      socketClient.off('socket:error', handleError);
    };
  }, [isJoining]);

  const joinSession = useCallback(async (sessionId, options = {}) => {
    if (isJoining) return;
    
    setIsJoining(true);
    setJoinError(null);
    
    try {
      await socketClient.joinSession(sessionId, options);
    } catch (error) {
      setJoinError(error.message);
      setIsJoining(false);
    }
  }, [isJoining]);

  const leaveSession = useCallback(() => {
    socketClient.leaveSession();
  }, []);

  const updateState = useCallback((timestamp, isPlaying, playbackRate) => {
    socketClient.updateSyncState(timestamp, isPlaying, playbackRate);
  }, []);

  const seekTo = useCallback((timestamp) => {
    socketClient.seekTo(timestamp);
  }, []);

  const play = useCallback((timestamp) => {
    socketClient.play(timestamp);
  }, []);

  const pause = useCallback((timestamp) => {
    socketClient.pause(timestamp);
  }, []);

  return {
    currentSession,
    participants,
    sessionState,
    isJoining,
    joinError,
    joinSession,
    leaveSession,
    updateState,
    seekTo,
    play,
    pause
  };
};

/**
 * Hook for branching video interactions
 */
export const useBranchingVideo = () => {
  const [currentDecisionPoint, setCurrentDecisionPoint] = useState(null);
  const [choices, setChoices] = useState([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isChoiceActive, setIsChoiceActive] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const handleDecisionPoint = (data) => {
      setCurrentDecisionPoint(data);
      setChoices(data.choices || []);
      setTimeRemaining(data.timeoutSeconds || 30);
      setIsChoiceActive(true);

      // Start countdown
      timeoutRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setIsChoiceActive(false);
            setCurrentDecisionPoint(null);
            clearInterval(timeoutRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const handleBranchChosen = (data) => {
      setIsChoiceActive(false);
      setCurrentDecisionPoint(null);
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
      }
    };

    socketClient.on('branch:decision-point', handleDecisionPoint);
    socketClient.on('branch:branch-chosen', handleBranchChosen);

    return () => {
      socketClient.off('branch:decision-point', handleDecisionPoint);
      socketClient.off('branch:branch-chosen', handleBranchChosen);
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
      }
    };
  }, []);

  const makeChoice = useCallback((choiceIndex) => {
    if (!currentDecisionPoint || !isChoiceActive) return;
    
    socketClient.makeChoice(currentDecisionPoint.decisionPointId, choiceIndex);
    setIsChoiceActive(false);
    
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
    }
  }, [currentDecisionPoint, isChoiceActive]);

  return {
    currentDecisionPoint,
    choices,
    timeRemaining,
    isChoiceActive,
    makeChoice
  };
};

/**
 * Hook for collaborative editing
 */
export const useCollaborativeEditing = () => {
  const [markers, setMarkers] = useState([]);
  const [activeCollaborators, setActiveCollaborators] = useState([]);

  useEffect(() => {
    const handleMarkerUpdate = (data) => {
      switch (data.action) {
        case 'add':
          setMarkers(prev => [...prev, data.marker]);
          break;
        case 'update':
          setMarkers(prev => prev.map(m => 
            m.id === data.marker.id ? { ...m, ...data.marker } : m
          ));
          break;
        case 'delete':
          setMarkers(prev => prev.filter(m => m.id !== data.markerId));
          break;
      }
    };

    socketClient.on('editor:marker-update', handleMarkerUpdate);

    return () => {
      socketClient.off('editor:marker-update', handleMarkerUpdate);
    };
  }, []);

  const addMarker = useCallback((videoId, timestamp, label, type, properties) => {
    socketClient.addMarker(videoId, timestamp, label, type, properties);
  }, []);

  const updateMarker = useCallback((markerId, updates) => {
    socketClient.updateMarker(markerId, updates);
  }, []);

  const deleteMarker = useCallback((markerId) => {
    socketClient.deleteMarker(markerId);
  }, []);

  return {
    markers,
    activeCollaborators,
    addMarker,
    updateMarker,
    deleteMarker
  };
};

/**
 * Hook for chat functionality
 */
export const useChat = () => {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);

  useEffect(() => {
    const handleChatMessage = (data) => {
      setMessages(prev => [...prev, {
        id: Date.now(),
        userId: data.userId,
        message: data.message,
        type: data.type,
        timestamp: data.timestamp
      }]);
    };

    socketClient.on('chat_message', handleChatMessage);

    return () => {
      socketClient.off('chat_message', handleChatMessage);
    };
  }, []);

  const sendMessage = useCallback((message, type = 'text') => {
    socketClient.sendChatMessage(message, type);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isTyping,
    typingUsers,
    sendMessage,
    clearMessages
  };
};

/**
 * Hook for performance monitoring
 */
export const usePerformanceMonitoring = () => {
  const [performance, setPerformance] = useState({
    lagMs: 0,
    reconnects: 0,
    lastHeartbeat: null
  });
  const [connectionQuality, setConnectionQuality] = useState('good');

  useEffect(() => {
    const handleHeartbeat = (data) => {
      setPerformance(prev => ({
        ...prev,
        lagMs: data.lag,
        lastHeartbeat: Date.now()
      }));

      // Determine connection quality
      if (data.lag < 100) {
        setConnectionQuality('excellent');
      } else if (data.lag < 250) {
        setConnectionQuality('good');
      } else if (data.lag < 500) {
        setConnectionQuality('fair');
      } else {
        setConnectionQuality('poor');
      }
    };

    const handleLagDetected = (data) => {
      setPerformance(prev => ({
        ...prev,
        lagCompensation: data.lagCompensationOffset
      }));
    };

    socketClient.on('heartbeat:response', handleHeartbeat);
    socketClient.on('sync:lag-detected', handleLagDetected);

    return () => {
      socketClient.off('heartbeat:response', handleHeartbeat);
      socketClient.off('sync:lag-detected', handleLagDetected);
    };
  }, []);

  return {
    performance,
    connectionQuality
  };
};
