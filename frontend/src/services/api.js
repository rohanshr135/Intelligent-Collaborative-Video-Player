const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

export async function createRoom() {
  const res = await fetch(`${API_BASE}/rooms`, { method: 'POST' });
  return res.json();
}

export async function joinRoom(code, userId) {
  const res = await fetch(`${API_BASE}/rooms/${code}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
  return res.json();
}

export async function fetchState(code) {
  const res = await fetch(`${API_BASE}/rooms/${code}/state`);
  return res.json();
}

export async function updateState(code, state) {
  const res = await fetch(`${API_BASE}/rooms/${code}/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
  return res.json();
}
