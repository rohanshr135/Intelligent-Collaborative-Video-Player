import React, { useState } from 'react';
import { useRoomStore } from '../state/useRoomStore.js';
import { createRoom, joinRoom } from '../services/api.js';

export default function RoomControls() {
  const { code, setCode } = useRoomStore();
  const [input, setInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [roomInfo, setRoomInfo] = useState(null);

  const handleCreate = async () => {
    setIsCreating(true);
    setError('');
    setRoomInfo(null);
    try {
      const response = await createRoom();
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
    } catch (err) {
      setError(`Failed to create room: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!input) {
      setError('Please enter a room code');
      return;
    }
    
    setIsJoining(true);
    setError('');
    setRoomInfo(null);
    try {
      const response = await joinRoom(input.toUpperCase());
      if (response.error) {
        throw new Error(response.error);
      }
      setCode(response.code);
      setRoomInfo({
        code: response.code,
        participants: response.participants,
        joined: true
      });
      setInput(''); // Clear input after joining
      setError(''); // Clear any previous errors
    } catch (err) {
      setError(`Failed to join room: ${err.message}`);
    } finally {
      setIsJoining(false);
    }
  };

  const copyShareUrl = () => {
    if (roomInfo?.shareUrl) {
      navigator.clipboard.writeText(roomInfo.shareUrl);
      // You could add a temporary "Copied!" message here
    }
  };

  return (
    <div className="space-y-4">
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
              <div>Participants: {roomInfo.participants?.length || 0}</div>
            </>
          )}
        </div>
      )}
      
      <div className="flex items-center gap-2 flex-wrap">
        <button 
          onClick={handleCreate} 
          disabled={isCreating}
          className="px-3 py-1 bg-indigo-600 rounded text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? 'Creating...' : 'Create Room'}
        </button>
        
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value.toUpperCase())} 
          placeholder="Room Code" 
          className="bg-gray-800 px-2 py-1 rounded text-sm text-white placeholder-gray-400"
          maxLength={6}
        />
        
        <button 
          onClick={handleJoin} 
          disabled={isJoining || !input.trim()}
          className="px-3 py-1 bg-teal-600 rounded text-sm hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isJoining ? 'Joining...' : 'Join'}
        </button>
        
        {code && (
          <span className="text-xs text-gray-400">
            Current Room: <span className="font-mono">{code}</span>
          </span>
        )}
      </div>
    </div>
  );
}
