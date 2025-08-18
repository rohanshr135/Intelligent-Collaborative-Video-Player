import React, { useRef, useEffect, useCallback } from 'react';
import { useRoomStore } from '../state/useRoomStore.js';
import { getSocket } from '../services/socket.js';

export default function VideoPlayer() {
  const videoRef = useRef(null);
  const { code, state, updateState } = useRoomStore();

  const emitState = useCallback((partial) => {
    if (!code) return;
    const payload = { ...state, ...partial };
    getSocket().emit('state:update', payload);
    updateState(partial);
  }, [code, state, updateState]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => getSocket().emit('play');
    const onPause = () => getSocket().emit('pause', { t: v.currentTime });
    const onSeeked = () => getSocket().emit('seek', { t: v.currentTime });
    const onRate = () => emitState({ rate: v.playbackRate });
    const timeInterval = setInterval(() => {
      if (!v.paused) emitState({ t: v.currentTime });
    }, 600);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('ratechange', onRate);
    return () => {
      clearInterval(timeInterval);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('ratechange', onRate);
    };
  }, [emitState]);

  return (
    <div className="space-y-2">
      <video ref={videoRef} className="w-full max-h-[60vh] bg-black" controls />
      <LocalFileLoader onLoad={(src, hash) => emitState({ videoHash: hash, t: 0 })} videoRef={videoRef} />
    </div>
  );
}

function LocalFileLoader({ onLoad, videoRef }) {
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (videoRef.current) videoRef.current.src = url;
    const hash = await hashFile(file);
    onLoad(url, hash);
  };
  return <input type="file" accept="video/*" onChange={handleFile} className="text-sm" />;
}

async function hashFile(file) {
  const chunkSize = 1024 * 512;
  const head = file.slice(0, chunkSize);
  const tail = file.slice(file.size - chunkSize, file.size);
  const buffer = await new Blob([head, tail, new TextEncoder().encode(String(file.size))]).arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
