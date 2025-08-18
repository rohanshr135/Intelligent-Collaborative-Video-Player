import { io } from 'socket.io-client';
import { useRoomStore } from '../state/useRoomStore.js';

let socket;

export function getSocket() {
  if (!socket) {
    socket = io('http://localhost:5000/room');
    socket.on('connect', () => useRoomStore.getState().setSocketConnected(true));
    socket.on('disconnect', () => useRoomStore.getState().setSocketConnected(false));
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
