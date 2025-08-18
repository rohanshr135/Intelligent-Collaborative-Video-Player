/**
 * Example React Component: Collaborative Video Player
 * 
 * This component demonstrates how to use the Socket.IO hooks and services
 * for creating a full-featured collaborative video player with sync, branching,
 * editing, and chat functionality.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  useSocket,
  useSyncSession,
  useBranchingVideo,
  useCollaborativeEditing,
  useChat,
  usePerformanceMonitoring
} from '../hooks/useSocket';

const CollaborativeVideoPlayer = ({ videoUrl, sessionId, userToken }) => {
  // Socket connection
  const { isConnected, isConnecting, connectionError, reconnect } = useSocket(
    process.env.REACT_APP_SOCKET_URL || 'ws://localhost:5000',
    userToken
  );

  // Sync session management
  const {
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
  } = useSyncSession();

  // Branching video functionality
  const {
    currentDecisionPoint,
    choices,
    timeRemaining,
    isChoiceActive,
    makeChoice
  } = useBranchingVideo();

  // Collaborative editing
  const {
    markers,
    addMarker,
    updateMarker,
    deleteMarker
  } = useCollaborativeEditing();

  // Chat functionality
  const {
    messages,
    sendMessage,
    clearMessages
  } = useChat();

  // Performance monitoring
  const {
    performance,
    connectionQuality
  } = usePerformanceMonitoring();

  // Local component state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showChat, setShowChat] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [chatMessage, setChatMessage] = useState('');

  // Refs
  const videoRef = useRef(null);
  const lastSyncUpdate = useRef(0);
  const syncTimeout = useRef(null);

  // Auto-join session when connected
  useEffect(() => {
    if (isConnected && sessionId && !currentSession && !isJoining) {
      joinSession(sessionId, { videoId: 'current-video' });
    }
  }, [isConnected, sessionId, currentSession, isJoining, joinSession]);

  // Sync video state with session
  useEffect(() => {
    if (!videoRef.current || !currentSession) return;

    const video = videoRef.current;
    const timeDiff = Math.abs(video.currentTime - sessionState.timestamp);
    const now = Date.now();

    // Only sync if the difference is significant and enough time has passed
    if (timeDiff > 1 && now - lastSyncUpdate.current > 1000) {
      video.currentTime = sessionState.timestamp;
      lastSyncUpdate.current = now;
    }

    // Sync play/pause state
    if (sessionState.isPlaying && video.paused) {
      video.play().catch(console.error);
    } else if (!sessionState.isPlaying && !video.paused) {
      video.pause();
    }

    // Sync playback rate
    if (video.playbackRate !== sessionState.playbackRate) {
      video.playbackRate = sessionState.playbackRate;
    }
  }, [sessionState, currentSession]);

  // Video event handlers
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    
    const newTime = videoRef.current.currentTime;
    setCurrentTime(newTime);

    // Throttled sync updates (every 2 seconds when playing)
    if (currentSession && isPlaying) {
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      
      syncTimeout.current = setTimeout(() => {
        updateState(newTime, isPlaying, videoRef.current.playbackRate);
      }, 2000);
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
    if (currentSession) {
      play(videoRef.current.currentTime);
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (currentSession) {
      pause(videoRef.current.currentTime);
    }
  };

  const handleSeek = (newTime) => {
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      
      if (currentSession) {
        seekTo(newTime);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  // Marker handlers
  const handleAddMarker = () => {
    const label = prompt('Enter marker label:');
    if (label && videoRef.current) {
      addMarker('current-video', currentTime, label, 'annotation');
    }
  };

  // Chat handlers
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (chatMessage.trim()) {
      sendMessage(chatMessage);
      setChatMessage('');
    }
  };

  // Format time helper
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Connection status indicator
  const getConnectionStatus = () => {
    if (isConnecting) return { text: 'Connecting...', color: 'yellow' };
    if (!isConnected) return { text: 'Disconnected', color: 'red' };
    if (connectionError) return { text: 'Error', color: 'red' };
    return { text: 'Connected', color: 'green' };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div className="collaborative-video-player">
      {/* Connection Status */}
      <div className="status-bar" style={{ background: '#f0f0f0', padding: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ color: connectionStatus.color }}>● {connectionStatus.text}</span>
            {currentSession && <span> | Session: {currentSession}</span>}
            {participants.length > 0 && <span> | {participants.length} participants</span>}
          </div>
          <div>
            <span>Quality: {connectionQuality}</span>
            <span> | Lag: {performance.lagMs}ms</span>
          </div>
        </div>
      </div>

      {/* Error Messages */}
      {connectionError && (
        <div style={{ background: '#ffe6e6', padding: '10px', color: 'red' }}>
          Connection Error: {connectionError}
          <button onClick={reconnect} style={{ marginLeft: '10px' }}>Reconnect</button>
        </div>
      )}

      {joinError && (
        <div style={{ background: '#ffe6e6', padding: '10px', color: 'red' }}>
          Join Error: {joinError}
        </div>
      )}

      {/* Video Player */}
      <div className="video-container" style={{ position: 'relative' }}>
        <video
          ref={videoRef}
          src={videoUrl}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onLoadedMetadata={handleLoadedMetadata}
          style={{ width: '100%', maxHeight: '500px' }}
          controls={false}
        />

        {/* Markers Overlay */}
        {showMarkers && (
          <div className="markers-overlay" style={{ position: 'absolute', bottom: '50px', left: '0', right: '0' }}>
            {markers.map(marker => (
              <div
                key={marker.id}
                style={{
                  position: 'absolute',
                  left: `${(marker.timestamp / duration) * 100}%`,
                  bottom: '0',
                  width: '2px',
                  height: '20px',
                  background: 'red',
                  cursor: 'pointer'
                }}
                onClick={() => handleSeek(marker.timestamp)}
                title={marker.title}
              />
            ))}
          </div>
        )}

        {/* Decision Point Overlay */}
        {isChoiceActive && currentDecisionPoint && (
          <div 
            className="decision-overlay" 
            style={{ 
              position: 'absolute', 
              top: '50%', 
              left: '50%', 
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0,0,0,0.9)',
              color: 'white',
              padding: '20px',
              borderRadius: '10px',
              textAlign: 'center'
            }}
          >
            <h3>{currentDecisionPoint.questionText}</h3>
            <p>Time remaining: {timeRemaining}s</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '15px' }}>
              {choices.map((choice, index) => (
                <button
                  key={index}
                  onClick={() => makeChoice(index)}
                  style={{
                    padding: '10px 20px',
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer'
                  }}
                >
                  {choice.text}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Video Controls */}
      <div className="video-controls" style={{ display: 'flex', alignItems: 'center', padding: '10px', background: '#f8f9fa' }}>
        <button onClick={isPlaying ? handlePause : handlePlay}>
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        
        <input
          type="range"
          min="0"
          max={duration}
          value={currentTime}
          onChange={(e) => handleSeek(parseFloat(e.target.value))}
          style={{ flex: 1, margin: '0 10px' }}
        />
        
        <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
        
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          onChange={(e) => {
            const newVolume = parseFloat(e.target.value);
            setVolume(newVolume);
            if (videoRef.current) videoRef.current.volume = newVolume;
          }}
          style={{ width: '100px', marginLeft: '10px' }}
        />
        
        <button onClick={handleAddMarker} style={{ marginLeft: '10px' }}>
          📍 Add Marker
        </button>
        
        <button onClick={() => setShowChat(!showChat)} style={{ marginLeft: '10px' }}>
          💬 Chat {messages.length > 0 && `(${messages.length})`}
        </button>
      </div>

      {/* Participants List */}
      {participants.length > 0 && (
        <div style={{ padding: '10px', borderTop: '1px solid #ddd' }}>
          <h4>Participants ({participants.length})</h4>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {participants.map(participant => (
              <div 
                key={participant.userId}
                style={{ 
                  padding: '5px 10px', 
                  background: '#e9ecef', 
                  borderRadius: '15px',
                  fontSize: '12px'
                }}
              >
                {participant.deviceName} ({participant.userId})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Panel */}
      {showChat && (
        <div style={{ height: '200px', borderTop: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', background: '#f8f9fa' }}>
            {messages.map(message => (
              <div key={message.id} style={{ marginBottom: '5px' }}>
                <strong>{message.userId}:</strong> {message.message}
                <span style={{ fontSize: '10px', color: '#666', marginLeft: '10px' }}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
          <form onSubmit={handleSendMessage} style={{ display: 'flex', padding: '10px' }}>
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Type a message..."
              style={{ flex: 1, padding: '5px', marginRight: '10px' }}
            />
            <button type="submit">Send</button>
          </form>
        </div>
      )}

      {/* Session Controls */}
      <div style={{ padding: '10px', borderTop: '1px solid #ddd', background: '#f8f9fa' }}>
        {currentSession ? (
          <button onClick={leaveSession} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px' }}>
            Leave Session
          </button>
        ) : (
          <button 
            onClick={() => joinSession(sessionId)} 
            disabled={!isConnected || isJoining}
            style={{ background: '#28a745', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px' }}
          >
            {isJoining ? 'Joining...' : 'Join Session'}
          </button>
        )}
      </div>
    </div>
  );
};

export default CollaborativeVideoPlayer;
