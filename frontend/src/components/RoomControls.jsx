import React, { useState } from 'react';
import { createRoom, joinRoom } from '../services/api.js';
import { useRoomStore } from '../state/useRoomStore.js';
import { getSocket } from '../services/socket.js';

export default function RoomControls() {
  const { code, setCode } = useRoomStore();
  const [input, setInput] = useState('');

  const handleCreate = async () => {
    const res = await createRoom();
    setCode(res.code);
    getSocket().emit('join', { code: res.code });
  };

  const handleJoin = async () => {
    if (!input) return;
    const res = await joinRoom(input);
    if (res.error) return alert(res.error);
    setCode(input);
    getSocket().emit('join', { code: input });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={handleCreate} className="px-3 py-1 bg-indigo-600 rounded text-sm">Create Room</button>
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Room Code" className="bg-gray-800 px-2 py-1 rounded text-sm" />
      <button onClick={handleJoin} className="px-3 py-1 bg-teal-600 rounded text-sm">Join</button>
      {code && <span className="text-xs text-gray-400">Current Room: {code}</span>}
    </div>
  );
}
