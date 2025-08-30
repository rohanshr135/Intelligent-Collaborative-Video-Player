import React, { useState } from 'react';
import VideoPlayer from './components/VideoPlayer.jsx';
import RoomControls from './components/RoomControls.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import NotesPanel from './components/NotesPanel.jsx';
import SummaryPanel from './components/SummaryPanel.jsx';
import { useRoomStore } from './state/useRoomStore.js';

export default function App() {
  const { socketConnected, code } = useRoomStore();
  const [activePanel, setActivePanel] = useState('chat');
  const [showSidebar, setShowSidebar] = useState(true);

  const panels = [
    { id: 'chat', name: 'Chat', icon: '💬' },
    { id: 'notes', name: 'Notes', icon: '📝' },
    { id: 'summary', name: 'AI Summary', icon: '🤖' }
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-800">
              Intelligent Collaborative Video Player
            </h1>
            <div className="flex items-center space-x-4">
              <div className={`text-sm px-3 py-1 rounded-full ${
                socketConnected 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {socketConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </div>
              {code && (
                <button
                  onClick={() => setShowSidebar(!showSidebar)}
                  className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                >
                  {showSidebar ? 'Hide Sidebar' : 'Show Sidebar'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-120px)]">
          {/* Main Content */}
          <div className={`${showSidebar && code ? 'lg:col-span-3' : 'lg:col-span-4'} space-y-4`}>
            {/* Room Controls */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <RoomControls />
            </div>

            {/* Video Player */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <VideoPlayer />
            </div>

            {/* Features Info (when no room) */}
            {!code && (
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  🚀 Collaborative Features
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl mb-2">💬</div>
                    <h3 className="font-medium text-gray-800">Real-time Chat</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Chat with timestamp references
                    </p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl mb-2">📝</div>
                    <h3 className="font-medium text-gray-800">Collaborative Notes</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Add timestamped notes and comments
                    </p>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl mb-2">🤖</div>
                    <h3 className="font-medium text-gray-800">AI Summary</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Generate intelligent video summaries
                    </p>
                  </div>
                </div>
                <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
                  <h4 className="font-medium text-gray-800 mb-2">🎥 Video Controls</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                    <div>• Space: Play/Pause</div>
                    <div>• ←/→: Seek 10s</div>
                    <div>• ↑/↓: Volume</div>
                    <div>• F: Fullscreen</div>
                    <div>• M: Mute/Unmute</div>
                    <div>• ,/.: Frame step</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          {code && showSidebar && (
            <div className="lg:col-span-1 bg-white rounded-lg shadow-sm border overflow-hidden">
              {/* Panel Tabs */}
              <div className="border-b bg-gray-50">
                <div className="flex">
                  {panels.map((panel) => (
                    <button
                      key={panel.id}
                      onClick={() => setActivePanel(panel.id)}
                      className={`flex-1 px-3 py-2 text-sm font-medium ${
                        activePanel === panel.id
                          ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <span className="mr-1">{panel.icon}</span>
                      {panel.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Panel Content */}
              <div className="h-[calc(100vh-200px)]">
                {activePanel === 'chat' && <ChatPanel />}
                {activePanel === 'notes' && <NotesPanel />}
                {activePanel === 'summary' && <SummaryPanel />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
