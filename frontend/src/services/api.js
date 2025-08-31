const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

// HTTP client utility
class ApiClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${endpoint}?${query}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: data,
    });
  }

  put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: data,
    });
  }

  delete(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'DELETE',
      body: data,
    });
  }
}

// Create API client instance
export const api = new ApiClient(API_BASE);

// Legacy room functions
export async function createRoom(userData = {}) {
  try {
    return await api.post('/rooms', userData);
  } catch (error) {
    console.error('Failed to create room:', error);
    return { error: error.message };
  }
}

export async function joinRoom(code, userData = {}) {
  try {
    return await api.post(`/rooms/${code}/join`, userData);
  } catch (error) {
    console.error('Failed to join room:', error);
    return { error: error.message };
  }
}

export async function fetchState(code) {
  try {
    return await api.get(`/rooms/${code}/state`);
  } catch (error) {
    console.error('Failed to fetch room state:', error);
    return { error: error.message };
  }
}

export async function updateState(code, state) {
  try {
    return await api.post(`/rooms/${code}/state`, state);
  } catch (error) {
    console.error('Failed to update room state:', error);
    return { error: error.message };
  }
}

export async function setRoomVideoUrl(code, videoUrl) {
  try {
    return await api.post(`/rooms/${code}/video`, { videoUrl });
  } catch (error) {
    console.error('Failed to set room video URL:', error);
    return { error: error.message };
  }
}
