import React, { useState, useEffect } from 'react';
import { useRoomStore } from '../state/useRoomStore.js';

export default function VideoRoomJoiner() {
  const [roomCode, setRoomCode] = useState('');
  const [userId, setUserId] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [roomInfo, setRoomInfo] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { setRoom } = useRoomStore();

  // Generate a random user ID if none exists
  useEffect(() => {
    if (!userId) {
      setUserId(`user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    }
  }, [userId]);

  // Extract room code from URL if present
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get('room');
    if (codeFromUrl) {
      setRoomCode(codeFromUrl.toUpperCase());
    }
  }, []);

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }

    setIsJoining(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/rooms/${roomCode.toUpperCase()}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          deviceInfo: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to join room');
      }

      const roomData = await response.json();
      setRoomInfo(roomData);
      setSuccess('Successfully joined room!');
      
      // Set the room in the store
      setRoom({
        code: roomData.code,
        hostId: roomData.hostId,
        video: roomData.video,
        currentState: roomData.currentState,
        participants: roomData.participants,
        settings: roomData.settings
      });

      logger.info('👤 Successfully joined room:', roomData);
    } catch (err) {
      setError(err.message);
      logger.error('❌ Failed to join room:', err);
    } finally {
      setIsJoining(false);
    }
  };

  const handleEnterRoom = () => {
    if (roomInfo) {
      // Navigate to the room
      window.location.href = `/room/${roomInfo.code}`;
    }
  };

  const copyJoinLink = () => {
    if (roomInfo?.joinUrl) {
      navigator.clipboard.writeText(roomInfo.joinUrl);
      alert('Join link copied to clipboard!');
    }
  };

  const resetForm = () => {
    setRoomCode('');
    setRoomInfo(null);
    setError('');
    setSuccess('');
  };

  if (roomInfo) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome to the Room!</h2>
          <p className="text-gray-600">You've successfully joined the video room</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-gray-800 mb-2">Room Information</h3>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Room Code:</span> <span className="font-mono bg-gray-200 px-2 py-1 rounded">{roomInfo.code}</span></div>
            <div><span className="font-medium">Host:</span> {roomInfo.hostId === userId ? 'You (Host)' : roomInfo.hostId}</div>
            <div><span className="font-medium">Video:</span> {roomInfo.video?.title || 'No video set'}</div>
            {roomInfo.video && (
              <div><span className="font-medium">Duration:</span> {Math.floor((roomInfo.video.duration || 0) / 60)}:{(roomInfo.video.duration || 0) % 60 < 10 ? '0' : ''}{(roomInfo.video.duration || 0) % 60}</div>
            )}
            <div><span className="font-medium">Participants:</span> {roomInfo.participants.length}/{roomInfo.settings.maxParticipants}</div>
            <div><span className="font-medium">Expires:</span> {new Date(roomInfo.expiresAt).toLocaleString()}</div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleEnterRoom}
            className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors"
          >
            🎬 Enter Room
          </button>
          
          <button
            onClick={copyJoinLink}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            📋 Copy Join Link
          </button>
          
          <button
            onClick={resetForm}
            className="w-full bg-gray-500 text-white py-3 px-4 rounded-lg hover:bg-gray-600 transition-colors"
          >
            🔄 Join Another Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="text-center mb-6">
        <div className="text-6xl mb-4">🚪</div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Join Video Room</h1>
        <p className="text-gray-600">Enter a room code to join an existing video session</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleJoinRoom(); }} className="space-y-6">
        {/* Room Code */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Room Code *
          </label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Enter 6-character room code"
            maxLength={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg font-mono tracking-widest"
          />
        </div>

        {/* User ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Name/ID
          </label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter your name or ID"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Success Display */}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
            {success}
          </div>
        )}

        {/* Join Button */}
        <button
          type="submit"
          disabled={isJoining || !roomCode.trim()}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
            isJoining || !roomCode.trim()
              ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {isJoining ? 'Joining Room...' : 'Join Room'}
        </button>
      </form>

      {/* Info Section */}
      <div className="mt-8 p-4 bg-green-50 rounded-lg">
        <h3 className="font-medium text-green-800 mb-2">ℹ️ How to join</h3>
        <ul className="text-sm text-green-700 space-y-1">
          <li>• Get the room code from the host</li>
          <li>• Enter the 6-character code above</li>
          <li>• Choose a name to identify yourself</li>
          <li>• Join the synchronized video session</li>
          <li>• Only the host can control playback</li>
        </ul>
      </div>

      {/* Quick Join Links */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-medium text-blue-800 mb-2">🔗 Quick Join</h3>
        <p className="text-sm text-blue-700 mb-3">
          If you have a join link, you can also paste it here:
        </p>
        <input
          type="text"
          placeholder="Paste join link here"
          className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          onPaste={(e) => {
            const pastedText = e.clipboardData.getData('text');
            const urlMatch = pastedText.match(/\/join\/([A-Z0-9]{6})/);
            if (urlMatch) {
              setRoomCode(urlMatch[1]);
            }
          }}
        />
      </div>
    </div>
  );
}
