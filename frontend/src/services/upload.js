import { api } from './api.js';

// Upload a video file and return a shareable URL served from backend
export async function uploadAndGetUrl(file, userId) {
  const form = new FormData();
  form.append('video', file);
  if (userId) form.append('userId', userId);

  // Prefer a dedicated unauthenticated upload endpoint for rooms; fallback to existing videos if available
  const endpoint = '/videos/upload';

  const base = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';
  const res = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const data = await res.json();

  // If controller returns an id, expose stream URL, else attempt direct path
  if (data && data.id) {
    return `${base.replace('/api','')}/api/videos/${data.id}/stream`;
  }
  if (data && data.url) return data.url;

  // Fallback: if backend saved to /uploads, and returned filename
  if (data && data.filename) {
    return `${base.replace('/api','')}/uploads/${encodeURIComponent(data.filename)}`;
  }

  // Last resort: if the backend echoes back path
  if (data && data.path) {
    return `${base.replace('/api','')}${data.path.startsWith('/') ? '' : '/'}${data.path}`;
  }

  throw new Error('No URL returned from upload');
}
