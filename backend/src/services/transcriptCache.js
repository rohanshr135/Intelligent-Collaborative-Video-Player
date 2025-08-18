// This is a placeholder for a caching service (e.g., Redis, in-memory, or DB-based).

const cache = new Map();

export const getCachedTranscript = (videoId) => {
  return cache.get(videoId);
};

export const setCachedTranscript = (videoId, transcript) => {
  cache.set(videoId, transcript);
};
