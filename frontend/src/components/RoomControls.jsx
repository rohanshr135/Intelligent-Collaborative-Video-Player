import React, { useState, useEffect } from 'react';
import { useRoomStore } from '../state/useRoomStore.js';
import { createRoom, joinRoom } from '../services/api.js';
import { joinRoom as socketJoinRoom, leaveRoom as socketLeaveRoom } from '../services/socket.js';

export default function RoomControls() {
  const { code, setCode, user, initializeUser, participants, setParticipants } = useRoomStore();
  const [input, setInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [roomInfo, setRoomInfo] = useState(null);
  const [showUserSettings, setShowUserSettings] = useState(false);

  // Initialize user on component mount
  useEffect(() => {
    initializeUser();
  }, [initializeUser]);

  // Auto-join room from URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    if (roomCode && !code) {
      setInput(roomCode.toUpperCase());
      handleJoin(roomCode.toUpperCase());
    }
  }, []);

  const handleCreate = async () => {
    if (!user) {
      initializeUser();
      return;
    }

    setIsCreating(true);
    setError('');
    setRoomInfo(null);
    try {
      const response = await createRoom({
        userId: user.id,
        username: user.name
      });
      if (response.error) {
        throw new Error(response.error);
      }
      setCode(response.code);
      setRoomInfo({
        code: response.code,
        roomId: response.roomId,
        created: true,
        shareUrl: `${window.location.origin}?room=${response.code}`
      });
      setError(''); // Clear any previous errors
      
      // Join the room via Socket.IO
      socketJoinRoom(response.code, user.id);
    } catch (err) {
      setError(`Failed to create room: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async (roomCode = null) => {
    const targetCode = roomCode || input;
    if (!targetCode) {
      setError('Please enter a room code');
      return;
    }
    
    if (!user) {
      initializeUser();
      return;
    }

    setIsJoining(true);
    setError('');
    setRoomInfo(null);
    try {
      const response = await joinRoom(targetCode.toUpperCase(), {
        userId: user.id,
        username: user.name
      });
      if (response.error) {
        throw new Error(response.error);
      }
      setCode(response.code);
      setParticipants(response.participants || []);
      setRoomInfo({
        code: response.code,
        participants: response.participants,
        joined: true
      });
      setInput(''); // Clear input after joining
      setError(''); // Clear any previous errors
      
      // Update URL without page reload
      const newUrl = `${window.location.pathname}?room=${response.code}`;
      window.history.replaceState({}, '', newUrl);
      
      // Join the room via Socket.IO
      socketJoinRoom(response.code, user.id);
    } catch (err) {
      setError(`Failed to join room: ${err.message}`);
    } finally {
      setIsJoining(false);
    }
  };

  const leaveRoom = () => {
    const currentCode = code;
    setCode(null);
    setParticipants([]);
    setRoomInfo(null);
    setError('');
    // Clear URL parameter
    window.history.replaceState({}, '', window.location.pathname);
    
    // Leave the room via Socket.IO
    if (currentCode) {
      socketLeaveRoom(currentCode);
    }
  };

  const copyShareUrl = () => {
    if (roomInfo?.shareUrl) {
      navigator.clipboard.writeText(roomInfo.shareUrl);
      // You could add a temporary "Copied!" message here
    }
  };

  const updateUserName = (newName) => {
    if (newName.trim()) {
      useRoomStore.setState({ 
        user: { ...user, name: newName.trim() } 
      });
      setShowUserSettings(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* User Info */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
            {user?.name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div>
            <div className="text-sm font-medium text-gray-800">
              {user?.name || 'Loading...'}
            </div>
            <div className="text-xs text-gray-500">
              ID: {user?.id || 'N/A'}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowUserSettings(!showUserSettings)}
          className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300"
        >
          Edit
        </button>
      </div>

      {/* User Settings */}
      {showUserSettings && (
        <div className="p-3 bg-blue-50 rounded-lg">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Display Name:</label>
            <div className="flex space-x-2">
              <input
                type="text"
                defaultValue={user?.name || ''}
                placeholder="Enter your name"
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    updateUserName(e.target.value);
                  }
                }}
              />
              <button
                onClick={(e) => {
                  const input = e.target.previousElementSibling;
                  updateUserName(input.value);
                }}
                className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="text-red-500 text-sm p-2 bg-red-100 rounded">
          {error}
        </div>
      )}
      
      {roomInfo && (
        <div className="text-green-500 text-sm p-2 bg-green-100 rounded space-y-2">
          {roomInfo.created && (
            <>
              <div>✅ Room created successfully!</div>
              <div className="flex items-center gap-2">
                <span>Share URL:</span>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs">{roomInfo.shareUrl}</code>
                <button 
                  onClick={copyShareUrl}
                  className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                >
                  Copy
                </button>
              </div>
            </>
          )}
          {roomInfo.joined && (
            <>
              <div>✅ Successfully joined room!</div>
              <div>Participants: {participants.length}</div>
            </>
          )}
        </div>
      )}
      
      <div className="flex items-center gap-2 flex-wrap">
        {!code ? (
          <>
            <button 
              onClick={handleCreate} 
              disabled={isCreating || !user}
              className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Creating...' : 'Create Room'}
            </button>
            
            <input 
              value={input} 
              onChange={(e) => setInput(e.target.value.toUpperCase())} 
              placeholder="Room Code" 
              className="border border-gray-300 px-2 py-1 rounded text-sm"
              maxLength={6}
            />
            
            <button 
              onClick={() => handleJoin()} 
              disabled={isJoining || !input.trim() || !user}
              className="px-3 py-1 bg-teal-600 text-white rounded text-sm hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isJoining ? 'Joining...' : 'Join'}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Room:</span>
              <span className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
                {code}
              </span>
              <span className="text-xs text-gray-500">
                ({participants.length} participant{participants.length !== 1 ? 's' : ''})
              </span>
            </div>
            <button
              onClick={leaveRoom}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              Leave Room
            </button>
          </>
        )}
      </div>

      {/* Participants List */}
      {code && participants.length > 0 && (
        <div className="p-3 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Participants:</h4>
          <div className="space-y-1">
            {participants.map((participant, index) => (
              <div key={participant.id || index} className="flex items-center space-x-2 text-sm">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">
                  {participant.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <span className="text-gray-700">
                  {participant.name || 'Anonymous'}
                  {participant.id === user?.id && ' (you)'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
