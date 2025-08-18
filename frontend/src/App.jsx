import React from 'react';
import VideoPlayer from './components/VideoPlayer.jsx';
import RoomControls from './components/RoomControls.jsx';
import { useRoomStore } from './state/useRoomStore.js';

export default function App() {
  const { socketConnected } = useRoomStore();
  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold">Intelligent Collaborative Video Player (Phase 1)</h1>
      <RoomControls />
      <div className="text-xs text-gray-400">Socket: {socketConnected ? 'connected' : 'disconnected'}</div>
      <VideoPlayer />
    </div>
  );
}
