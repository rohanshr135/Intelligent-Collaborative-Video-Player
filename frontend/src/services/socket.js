import { io } from 'socket.io-client';
import { useRoomStore } from '../state/useRoomStore.js';

let socket;

export function getSocket() {
  if (!socket) {
    const store = useRoomStore.getState();
    const userId = store.user?.id || `user_${Math.random().toString(36).substr(2, 9)}`;
    
    socket = io('http://localhost:5000', {
      auth: {
        userId: userId
      }
    });
    
    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      useRoomStore.getState().setSocketConnected(true);
    });
    
    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      useRoomStore.getState().setSocketConnected(false);
    });

    // Participant updates
    socket.on('room:participant-update', async (data) => {
      console.log('Participant update:', data);
      const { participantCount, action, userId, roomCode } = data;
      
      // Update participant count in store
      const store = useRoomStore.getState();
      if (store.code === roomCode) {
        console.log(`Room ${roomCode} now has ${participantCount} participants (${action})`);
        
        // Fetch updated participant list from API
        try {
          const response = await fetch(`http://localhost:5000/api/rooms/${roomCode}`);
          if (response.ok) {
            const roomData = await response.json();
            if (roomData.participants) {
              store.setParticipants(roomData.participants);
            }
          }
        } catch (error) {
          console.error('Failed to fetch updated participants:', error);
        }
      }
    });
    
    // Legacy video sync events
    socket.on('state:sync', (payload) => useRoomStore.getState().updateState(payload));
    socket.on('seek', ({ t }) => {
      const video = document.querySelector('video');
      if (video) video.currentTime = t;
    });
    socket.on('play', () => {
      const video = document.querySelector('video');
      if (video && video.paused) video.play();
    });
    socket.on('pause', ({ t }) => {
      const video = document.querySelector('video');
      if (video) {
        video.currentTime = t;
        if (!video.paused) video.pause();
      }
    });
  }
  return socket;
}

// Join a room via Socket.IO
export function joinRoom(roomCode, userId) {
  const socket = getSocket();
  console.log(`Joining room ${roomCode} as user ${userId}`);
  socket.emit('room:join', { roomCode, userId });
}

// Leave a room via Socket.IO
export function leaveRoom(roomCode) {
  const socket = getSocket();
  console.log(`Leaving room ${roomCode}`);
  socket.emit('room:leave', { roomCode });
}
