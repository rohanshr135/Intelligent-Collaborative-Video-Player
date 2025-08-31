import React, { useState, useRef } from 'react';
import { useRoomStore } from '../state/useRoomStore.js';

export default function VideoRoomCreator() {
  const [isCreating, setIsCreating] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [createdRoom, setCreatedRoom] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const { setRoom } = useRoomStore();

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('video/')) {
        setError('Please select a valid video file');
        return;
      }
      
      // Validate file size (100MB limit)
      if (file.size > 100 * 1024 * 1024) {
        setError('Video file size must be less than 100MB');
        return;
      }
      
      setVideoFile(file);
      setVideoTitle(file.name.replace(/\.[^/.]+$/, '')); // Remove extension
      setError('');
    }
  };

  const handleCreateRoom = async () => {
    if (!videoFile) {
      setError('Please select a video file');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('videoFile', videoFile);
      formData.append('videoTitle', videoTitle);
      formData.append('maxParticipants', maxParticipants);
      formData.append('userId', `user_${Date.now()}`); // Generate temporary user ID

      const response = await fetch('/api/rooms', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create room');
      }

      const roomData = await response.json();
      setCreatedRoom(roomData);
      
      // Set the room in the store
      setRoom({
        code: roomData.code,
        hostId: roomData.hostId,
        video: roomData.video,
        currentState: roomData.currentState
      });

      logger.info('🎬 Video room created successfully:', roomData);
    } catch (err) {
      setError(err.message);
      logger.error('❌ Failed to create video room:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = () => {
    if (createdRoom) {
      // Navigate to the room or update the current room state
      window.location.href = `/room/${createdRoom.code}`;
    }
  };

  const copyJoinLink = () => {
    if (createdRoom?.joinUrl) {
      navigator.clipboard.writeText(createdRoom.joinUrl);
      // Show success message
      alert('Join link copied to clipboard!');
    }
  };

  const resetForm = () => {
    setVideoFile(null);
    setVideoTitle('');
    setMaxParticipants(10);
    setCreatedRoom(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (createdRoom) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Room Created Successfully!</h2>
          <p className="text-gray-600">Share this link with others to start watching together</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-gray-800 mb-2">Room Details</h3>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Room Code:</span> <span className="font-mono bg-gray-200 px-2 py-1 rounded">{createdRoom.code}</span></div>
            <div><span className="font-medium">Video:</span> {createdRoom.video?.title}</div>
            <div><span className="font-medium">Duration:</span> {Math.floor((createdRoom.video?.duration || 0) / 60)}:{(createdRoom.video?.duration || 0) % 60 < 10 ? '0' : ''}{(createdRoom.video?.duration || 0) % 60}</div>
            <div><span className="font-medium">Expires:</span> {new Date(createdRoom.expiresAt).toLocaleString()}</div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={copyJoinLink}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            📋 Copy Join Link
          </button>
          
          <button
            onClick={handleJoinRoom}
            className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors"
          >
            🎬 Join Room Now
          </button>
          
          <button
            onClick={resetForm}
            className="w-full bg-gray-500 text-white py-3 px-4 rounded-lg hover:bg-gray-600 transition-colors"
          >
            ➕ Create Another Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="text-center mb-6">
        <div className="text-6xl mb-4">🎬</div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Create Video Room</h1>
        <p className="text-gray-600">Upload a video and create a room for synchronized watching</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleCreateRoom(); }} className="space-y-6">
        {/* Video File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Video File *
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              {videoFile ? videoFile.name : 'Click to select video file'}
            </button>
            {videoFile && (
              <div className="mt-2 text-sm text-gray-500">
                Size: {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            )}
          </div>
        </div>

        {/* Video Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Video Title
          </label>
          <input
            type="text"
            value={videoTitle}
            onChange={(e) => setVideoTitle(e.target.value)}
            placeholder="Enter video title (optional)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Max Participants */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Maximum Participants
          </label>
          <select
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={5}>5 participants</option>
            <option value={10}>10 participants</option>
            <option value={20}>20 participants</option>
            <option value={50}>50 participants</option>
          </select>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Create Button */}
        <button
          type="submit"
          disabled={isCreating || !videoFile}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
            isCreating || !videoFile
              ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isCreating ? 'Creating Room...' : 'Create Video Room'}
        </button>
      </form>

      {/* Info Section */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-medium text-blue-800 mb-2">ℹ️ How it works</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Upload your video file (max 100MB)</li>
          <li>• Get a unique room code and shareable link</li>
          <li>• Host controls playback for all participants</li>
          <li>• Video automatically expires after viewing</li>
          <li>• Perfect for group watch parties and presentations</li>
        </ul>
      </div>
    </div>
  );
}

