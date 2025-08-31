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
            // Update host and controller info from room data
            if (roomData.hostId) {
              store.setHost(roomData.hostId);
            }
            if (roomData.controllers && Array.isArray(roomData.controllers)) {
              store.setControllers(roomData.controllers);
            }
          }
        } catch (error) {
          console.error('Failed to fetch updated participants:', error);
        }
      }
    });

    // Handle successful room join
    socket.on('room:joined', (roomData) => {
      console.log('Successfully joined room:', roomData);
      const store = useRoomStore.getState();
      
      // Update room state with received data
      if (roomData.hostId) {
        store.setHost(roomData.hostId);
      }
      if (roomData.controllers && Array.isArray(roomData.controllers)) {
        store.setControllers(roomData.controllers);
      }
      if (roomData.participants) {
        store.setParticipants(roomData.participants);
      }
      if (roomData.currentState?.videoUrl) {
        store.updateState({ videoUrl: roomData.currentState.videoUrl });
      }
    });
    
    // Legacy video sync events
    socket.on('state:sync', (payload) => useRoomStore.getState().updateState(payload));
    socket.on('seek', ({ t }) => {
      useRoomStore.getState().updateState({ t });
    });
    socket.on('play', () => {
      useRoomStore.getState().updateState({ paused: false });
    });
    socket.on('pause', ({ t }) => {
      const updates = { paused: true };
      if (typeof t === 'number') updates.t = t;
      useRoomStore.getState().updateState(updates);
    });

    // Receive canonical video updates for the room
    socket.on('room:video-updated', ({ roomCode, videoUrl }) => {
      console.log('Received video update:', { roomCode, videoUrl });
      const store = useRoomStore.getState();
      if (store.code !== roomCode) return;
      
      store.updateState({ videoUrl });
      
      // Force sync for HTML5 video elements (ReactPlayer handles its own updates)
      const video = document.querySelector('video');
      if (video && !videoUrl.includes('youtube') && !videoUrl.includes('youtu.be')) {
        if (video.src !== videoUrl) {
          console.log('Updating video src from socket:', videoUrl);
          video.src = videoUrl;
          video.load();
        }
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

// Set canonical video URL for the current room via Socket.IO
export function setRoomVideo(roomCode, videoUrl) {
  const socket = getSocket();
  socket.emit('room:set-video', { roomCode, videoUrl });
}
