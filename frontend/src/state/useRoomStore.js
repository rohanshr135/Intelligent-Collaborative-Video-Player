import { create } from 'zustand';

export const useRoomStore = create((set) => ({
  code: null,
  state: { t: 0, paused: true, rate: 1, videoHash: null, videoUrl: '' },
  socketConnected: false,
  user: null,
  participants: [],
  hostId: null,
  controllers: [],
  
  // User management
  setUser: (user) => set({ user }),
  setParticipants: (participants) => set({ participants }),
  setHost: (hostId) => {
    console.log('🏠 Setting host ID:', hostId);
    set({ hostId });
  },
  setControllers: (controllers) => {
    console.log('🎮 Setting controllers:', controllers);
    set({ controllers });
  },
  
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
    hostId: null,
    controllers: [],
    state: { t: 0, paused: true, rate: 1, videoHash: null, videoUrl: '' } 
  }),
  
  // Computed helper to check if current user can control the room
  canControl: () => {
    const state = useRoomStore.getState();
    const userId = state.user?.id;
    if (!userId) {
      console.log('❌ canControl: No user ID');
      return false;
    }
    
    // Check if user is host
    if (state.hostId === userId) {
      console.log('✅ canControl: User is host:', userId, '=', state.hostId);
      return true;
    }
    
    // Check if user is in controllers array
    const isController = state.controllers.includes(userId);
    console.log('🎮 canControl check:', { 
      userId, 
      hostId: state.hostId, 
      controllers: state.controllers, 
      isController,
      canControl: isController 
    });
    return isController;
  }
}));
