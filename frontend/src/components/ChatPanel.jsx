import React, { useState, useRef, useEffect } from 'react';
import { useRoomStore } from '../state/useRoomStore.js';
import { api } from '../services/api.js';
import { getSocket } from '../services/socket.js';

export default function ChatPanel() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const { code, user } = useRoomStore();

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load existing messages
  useEffect(() => {
    if (!code) return;
    
    const loadMessages = async () => {
      try {
        const response = await api.get(`/chat/${code}/messages`);
        setMessages(response.messages || []);
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    loadMessages();
  }, [code]);

  // Socket event listeners for real-time messages
  useEffect(() => {
    const socket = getSocket();
    
    const handleNewMessage = (message) => {
      setMessages(prev => [...prev, message]);
    };

    const handleMessageEdit = (updatedMessage) => {
      setMessages(prev => prev.map(msg => 
        msg._id === updatedMessage._id ? updatedMessage : msg
      ));
    };

    const handleMessageDelete = (messageId) => {
      setMessages(prev => prev.filter(msg => msg._id !== messageId));
    };

    socket.on('chat:message', handleNewMessage);
    socket.on('chat:edit', handleMessageEdit);
    socket.on('chat:delete', handleMessageDelete);

    return () => {
      socket.off('chat:message', handleNewMessage);
      socket.off('chat:edit', handleMessageEdit);
      socket.off('chat:delete', handleMessageDelete);
    };
  }, []);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !code || !user || isLoading) return;

    setIsLoading(true);
    try {
      const messageData = {
        roomCode: code,
        userId: user.id,
        username: user.name,
        message: newMessage.trim(),
        videoTimestamp: getCurrentVideoTime()
      };

      await api.post('/chat/send', messageData);
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentVideoTime = () => {
    const video = document.querySelector('video');
    return video ? video.currentTime : 0;
  };

  const formatTimestamp = (timestamp) => {
    const minutes = Math.floor(timestamp / 60);
    const seconds = Math.floor(timestamp % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleTimestampClick = (timestamp) => {
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = timestamp;
    }
  };

  const isTimestampMessage = (message) => {
    return message.messageType === 'timestamp' && message.referencedTimestamp !== null;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b p-4">
        <h3 className="text-lg font-semibold text-gray-800">Chat</h3>
        <p className="text-sm text-gray-600">{messages.length} messages</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p>No messages yet. Start the conversation!</p>
            <p className="text-xs mt-2">
              Tip: Type @5:30 to reference a specific timestamp
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message._id} className="flex flex-col space-y-1">
              <div className="flex items-start space-x-3">
                {/* Avatar */}
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                  {message.username.charAt(0).toUpperCase()}
                </div>

                {/* Message content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline space-x-2">
                    <span className="text-sm font-medium text-gray-900">
                      {message.username}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                    {message.videoTimestamp > 0 && (
                      <span 
                        className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded cursor-pointer hover:bg-blue-200"
                        onClick={() => handleTimestampClick(message.videoTimestamp)}
                        title="Jump to video timestamp"
                      >
                        @{formatTimestamp(message.videoTimestamp)}
                      </span>
                    )}
                  </div>
                  
                  <div className="mt-1">
                    {isTimestampMessage(message) ? (
                      <div className="space-y-1">
                        <span 
                          className="inline-block bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm cursor-pointer hover:bg-yellow-200"
                          onClick={() => handleTimestampClick(message.referencedTimestamp)}
                          title="Jump to referenced timestamp"
                        >
                          @{formatTimestamp(message.referencedTimestamp)}
                        </span>
                        <p className="text-sm text-gray-700">
                          {message.message.replace(/@\d{1,2}:\d{2}/g, '').trim()}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-700">{message.message}</p>
                    )}
                  </div>
                  
                  {message.isEdited && (
                    <span className="text-xs text-gray-400 italic">edited</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t p-4">
        <form onSubmit={sendMessage} className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message... (Use @5:30 for timestamps)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || isLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>
        
        <div className="mt-2 text-xs text-gray-500">
          <p>💡 Tip: Use @5:30 to reference specific timestamps in the video</p>
        </div>
      </div>
    </div>
  );
}
