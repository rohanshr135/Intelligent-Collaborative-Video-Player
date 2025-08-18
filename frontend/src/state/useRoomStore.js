import { create } from 'zustand';

export const useRoomStore = create((set) => ({
  code: null,
  state: { t: 0, paused: true, rate: 1, videoHash: null },
  socketConnected: false,
  setCode: (code) => set({ code }),
  updateState: (partial) => set((s) => ({ state: { ...s.state, ...partial } })),
  setSocketConnected: (v) => set({ socketConnected: v })
}));
