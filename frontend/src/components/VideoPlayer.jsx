import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { useRoomStore } from '../state/useRoomStore.js';
import { getSocket, setRoomVideo } from '../services/socket.js';
import ReactPlayer from 'react-player';
import { uploadAndGetUrl } from '../services/upload.js';

export default function VideoPlayer() {
  const videoRef = useRef(null);
  const { 
    state, 
    updateState,
    code: roomCode, 
    user, 
    hostId, 
    controllers,
    canControl 
  } = useRoomStore();
  
  // Calculate these values first, before using them in effects
  const url = state?.videoUrl || '';
  const isYouTube = useMemo(() => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url), [url]);
  
  const videoUrl = state.videoUrl || '';
  
  console.log('🎮 VideoPlayer render - canControl:', canControl(), 'User:', user?.id, 'Host:', hostId, 'Controllers:', controllers);

  const emitState = useCallback((partial) => {
    if (!roomCode) return;
    const payload = { ...state, ...partial };
    getSocket().emit('state:update', payload);
    updateState(partial);
  }, [roomCode, state, updateState]);

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

  // Load shared video URL when room state changes
  useEffect(() => {
    if (isYouTube) return; // ReactPlayer handles this
    const v = videoRef.current;
    if (!v || !state?.videoUrl) return;
    
    // Check if we need to update the video source
    const currentSrc = v.src;
    const newSrc = state.videoUrl;
    
    if (currentSrc !== newSrc) {
      console.log('Loading new video URL:', newSrc);
      v.src = newSrc;
      v.load();
      
      // Sync with room state after loading
      v.addEventListener('loadeddata', () => {
        if (typeof state.t === 'number') v.currentTime = state.t;
        if (!state.paused) v.play().catch(() => {});
      }, { once: true });
    }
  }, [state?.videoUrl, isYouTube]);

  // Sync video playback state with room state
  useEffect(() => {
    if (isYouTube) return; // ReactPlayer handles this
    const v = videoRef.current;
    if (!v) return;
    
    // Sync current time
    if (typeof state.t === 'number' && Math.abs(v.currentTime - state.t) > 1) {
      v.currentTime = state.t;
    }
    
    // Sync play/pause state
    if (state.paused && !v.paused) {
      v.pause();
    } else if (!state.paused && v.paused && v.src) {
      v.play().catch(() => {});
    }
    
    // Sync playback rate
    if (state.rate && v.playbackRate !== state.rate) {
      v.playbackRate = state.rate;
    }
  }, [state.t, state.paused, state.rate, isYouTube]);

  return (
    <div className="space-y-2">
      {/* Debug info */}
      <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
        <div>Room: {roomCode || 'None'}</div>
        <div>Video URL: {url || 'None'}</div>
        <div>Can Control: {canControl() ? 'Yes' : 'No'}</div>
        <div>Host: {hostId || 'None'}</div>
        <div>User: {user?.id || 'None'}</div>
        <div>Paused: {state.paused ? 'Yes' : 'No'}</div>
        <div>Time: {state.t?.toFixed(1) || 0}s</div>
      </div>
      
      {isYouTube ? (
        <ReactPlayer
          url={url}
          width="100%"
          height="60vh"
          controls
          playing={!state.paused}
          playbackRate={state.rate || 1}
          onProgress={({ playedSeconds }) => emitState({ t: playedSeconds })}
          onPlay={() => canControl() && getSocket().emit('play')}
          onPause={() => canControl() && getSocket().emit('pause', { t: state.t })}
          onSeek={(seconds) => canControl() && getSocket().emit('seek', { t: seconds })}
        />
      ) : (
        <>
          <video ref={videoRef} className="w-full max-h-[60vh] bg-black" controls />
          {/* Host or any participant can load a local file; blob URLs are not shareable to others. */}
          <LocalFileLoader onLoad={(src, hash) => {
            console.log('File loaded:', { src, hash, canControl: canControl() });
            // Update local playback state
            emitState({ videoHash: hash, t: 0 });
            // Only broadcast if it's a network URL accessible by everyone
            if (canControl() && roomCode && /^https?:/i.test(src)) {
              console.log('Broadcasting network URL:', src);
              setRoomVideo(roomCode, src);
            }
          }} videoRef={videoRef} />
        </>
      )}
    </div>
  );
}

function LocalFileLoader({ onLoad, videoRef }) {
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    console.log('File selected:', file.name, file.type);
    const url = URL.createObjectURL(file);
    if (videoRef.current) videoRef.current.src = url;
    const hash = await hashFile(file);
    onLoad(url, hash);
    
    // If user can control, upload to backend and broadcast the shareable URL
    const store = useRoomStore.getState();
    const canControlRoom = store.canControl();
    
    console.log('Upload check:', { canControl: canControlRoom, roomCode: store.code, userId: store.user?.id });
    
    if (canControlRoom && store.code) {
      try {
        console.log('Starting upload...');
        const remoteUrl = await uploadAndGetUrl(file, store.user?.id);
        console.log('Upload completed, URL:', remoteUrl);
        
        if (remoteUrl) {
          setRoomVideo(store.code, remoteUrl);
          store.updateState({ videoUrl: remoteUrl, t: 0 });
        }
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
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
