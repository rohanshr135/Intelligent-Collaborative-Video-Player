import { create } from 'zustand';

export const useRoomStore = create((set) => ({
  code: null,
  state: { t: 0, paused: true, rate: 1, videoHash: null },
  socketConnected: false,
  user: null,
  participants: [],
  
  // User management
  setUser: (user) => set({ user }),
  setParticipants: (participants) => set({ participants }),
  
  // Room management
  setCode: (code) => set({ code }),
  updateState: (partial) => set((s) => ({ state: { ...s.state, ...partial } })),
  setSocketConnected: (v) => set({ socketConnected: v }),
  
  // Initialize user with random ID and name if not exists
  initializeUser: () => set((state) => {
    if (!state.user) {
      const userId = 'user_' + Math.random().toString(36).substr(2, 9);
      const userName = 'User ' + Math.floor(Math.random() * 1000);
      return { 
        user: { 
          id: userId, 
          name: userName,
          joinedAt: new Date()
        } 
      };
    }
    return state;
  }),
  
  // Clear room data on disconnect
  clearRoom: () => set({ 
    code: null, 
    participants: [], 
    state: { t: 0, paused: true, rate: 1, videoHash: null } 
  })
}));
