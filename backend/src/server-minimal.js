import express from 'express';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { nanoid } from 'nanoid';

dotenv.config();

const app = express();
const server = http.createServer(app);

// In-memory storage for testing
const rooms = new Map();
const participants = new Map();

// Socket.IO Server Setup
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Express Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'Minimal server running without MongoDB'
  });
});

// Create room endpoint
app.post('/api/rooms', (req, res) => {
  try {
    const code = nanoid(6).toUpperCase();
    const hostId = req.body?.userId || `host_${Date.now()}`;
    
    const room = {
      code,
      hostId,
      controllers: [hostId],
      settings: {
        maxParticipants: parseInt(req.body.maxParticipants) || 10,
        allowControl: 'host',
        autoSync: true,
        lagCompensation: true
      },
      participants: [{
        userId: hostId,
        isHost: true,
        canControl: true,
        lastSeen: new Date(),
        lastSync: new Date()
      }],
      currentState: {
        t: 0,
        paused: true,
        rate: 1,
        lastUpdatedBy: hostId,
        lastUpdatedAt: new Date()
      },
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
      status: 'active',
      createdAt: new Date()
    };

    rooms.set(code, room);
    
    console.log(`🎬 Room created: ${code} by host: ${hostId}`);
    
    res.json({ 
      code, 
      roomId: code, 
      hostId,
      joinUrl: `http://localhost:5000/join/${code}`,
      expiresAt: room.expiresAt
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: error.message });
  }
});

// Join room endpoint
app.post('/api/rooms/:code/join', (req, res) => {
  try {
    const { code } = req.params;
    const { userId } = req.body;
    
    const room = rooms.get(code.toUpperCase());
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.status !== 'active') {
      return res.status(400).json({ error: 'Room is not active' });
    }

    if (new Date() > room.expiresAt) {
      return res.status(400).json({ error: 'Room has expired' });
    }

    if (room.participants.length >= room.settings.maxParticipants) {
      return res.status(400).json({ error: 'Room is at maximum capacity' });
    }

    const now = new Date();
    
    // Check if user is already in room
    const existingParticipant = room.participants.find(p => p.userId === userId);
    
    if (existingParticipant) {
      existingParticipant.lastSeen = now;
      existingParticipant.lastSync = now;
    } else {
      const isHost = userId === room.hostId;
      const canControl = isHost || room.controllers.includes(userId);
      
      room.participants.push({ 
        userId,
        isHost,
        canControl,
        lastSeen: now,
        lastSync: now
      });
    }
    
    console.log(`👤 User ${userId} joined room: ${room.code}`);
    
    res.json({ 
      code: room.code, 
      state: room.currentState, 
      participants: room.participants, 
      hostId: room.hostId, 
      controllers: room.controllers,
      settings: room.settings,
      expiresAt: room.expiresAt,
      joinUrl: `http://localhost:5000/join/${room.code}`
    });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get room state endpoint
app.get('/api/rooms/:code/state', (req, res) => {
  try {
    const { code } = req.params;
    const room = rooms.get(code.toUpperCase());
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({
      ...room.currentState,
      settings: room.settings,
      expiresAt: room.expiresAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update room state endpoint
app.post('/api/rooms/:code/state', (req, res) => {
  try {
    const { code } = req.params;
    const { t, paused, rate, userId } = req.body;
    
    const room = rooms.get(code.toUpperCase());
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const participant = room.participants.find(p => p.userId === userId);
    if (!participant || !participant.canControl) {
      return res.status(403).json({ error: 'No permission to control playback' });
    }

    room.currentState = { 
      ...room.currentState, 
      t: parseFloat(t || 0), 
      paused: Boolean(paused), 
      rate: parseFloat(rate || 1),
      lastUpdatedBy: userId,
      lastUpdatedAt: new Date()
    };
    
    console.log(`🎮 State updated in room ${code} by ${userId}: ${paused ? 'paused' : 'playing'} at ${t}s`);
    
    res.json({ ok: true, state: room.currentState });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get room details endpoint
app.get('/api/rooms/:code', (req, res) => {
  try {
    const { code } = req.params;
    const room = rooms.get(code.toUpperCase());
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const now = new Date();
    room.participants = room.participants.filter(p => (now - p.lastSeen) < 1000 * 60 * 60);
    
    res.json({ 
      code: room.code,
      participants: room.participants,
      participantCount: room.participants.length,
      currentState: room.currentState,
      settings: room.settings,
      hostId: room.hostId,
      controllers: room.controllers,
      status: room.status,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      joinUrl: `http://localhost:5000/join/${room.code}`
    });
  } catch (error) {
    console.error('Error getting room details:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all rooms endpoint
app.get('/api/rooms', (req, res) => {
  try {
    const roomList = Array.from(rooms.values()).map(room => ({
      code: room.code,
      participantCount: room.participants.length,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      isExpired: new Date() > room.expiresAt,
      currentState: room.currentState,
      status: room.status
    }));
    
    res.json({ rooms: roomList, total: roomList.length });
  } catch (error) {
    console.error('Error listing rooms:', error);
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`📱 New socket connection: ${socket.id}`);

  // Join room
  socket.on('join_room', ({ roomCode, userId, deviceId, deviceName }) => {
    try {
      const room = rooms.get(roomCode.toUpperCase());
      if (!room) {
        return socket.emit('error', { 
          code: 'ROOM_NOT_FOUND', 
          message: 'Room not found' 
        });
      }

      socket.join(roomCode);
      socket.currentRoom = roomCode;
      socket.userId = userId;
      
      console.log(`Device ${deviceId} (${socket.id}) joined room ${roomCode}`);
      
      // Send current state to new participant
      socket.emit('room_joined', {
        roomCode,
        currentState: room.currentState,
        participants: room.participants,
        settings: room.settings,
        hostId: room.hostId,
        controllers: room.controllers,
        expiresAt: room.expiresAt
      });

      // Notify others
      socket.to(roomCode).emit('user_joined', { 
        userId,
        deviceId: deviceId || `device_${Date.now()}`,
        deviceName: deviceName || 'Unknown Device',
        isHost: userId === room.hostId,
        canControl: room.controllers.includes(userId) || userId === room.hostId
      });

      // Broadcast updated participant list
      io.to(roomCode).emit('participants_updated', {
        participants: room.participants,
        participantCount: room.participants.length
      });

    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { 
        code: 'JOIN_ERROR', 
        message: 'Failed to join room' 
      });
    }
  });

  // Playback events
  socket.on('playback_event', ({ roomCode, type, timestamp, playbackRate, userId }) => {
    try {
      if (!roomCode || !socket.currentRoom) {
        return socket.emit('error', { 
          code: 'NOT_IN_ROOM', 
          message: 'Not in any room' 
        });
      }

      const room = rooms.get(roomCode.toUpperCase());
      if (!room) return;

      const participant = room.participants.find(p => p.userId === userId);
      if (!participant || !participant.canControl) {
        return socket.emit('error', { 
          code: 'NO_PERMISSION', 
          message: 'No permission to control playback' 
        });
      }

      // Update room state
      const updateData = {
        timestamp: parseFloat(timestamp || 0),
        lastUpdate: new Date(),
        updatedBy: userId
      };

      if (type === 'play') {
        updateData.paused = false;
        updateData.playbackRate = parseFloat(playbackRate);
      } else if (type === 'pause') {
        updateData.paused = true;
      }

      room.currentState = { 
        ...room.currentState, 
        ...updateData,
        lastUpdatedBy: userId,
        lastUpdatedAt: new Date()
      };

      // Broadcast to all participants
      const eventData = {
        type,
        timestamp: updateData.timestamp,
        paused: room.currentState.paused,
        playbackRate: room.currentState.playbackRate,
        userId,
        serverTimestamp: new Date().toISOString(),
        roomCode
      };

      io.to(roomCode).emit('playback_event', eventData);

      console.log(`Playback event ${type} in room ${roomCode} by user ${userId}`);

    } catch (error) {
      console.error('Error handling playback event:', error);
      socket.emit('error', { 
        code: 'PLAYBACK_ERROR', 
        message: 'Failed to handle playback event' 
      });
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    try {
      if (socket.currentRoom && socket.userId) {
        const room = rooms.get(socket.currentRoom.toUpperCase());
        if (room) {
          room.participants = room.participants.filter(p => p.userId !== socket.userId);
          
          // Notify room
          socket.to(socket.currentRoom).emit('user_left', {
            userId: socket.userId,
            leftAt: new Date().toISOString(),
            roomCode: socket.currentRoom
          });

          // Broadcast updated participant list
          io.to(socket.currentRoom).emit('participants_updated', {
            participants: room.participants,
            participantCount: room.participants.length
          });

          console.log(`User ${socket.userId} left room ${socket.currentRoom} (disconnect)`);
        }
      }
    } catch (error) {
      console.error('Error handling disconnect cleanup:', error);
    }
    
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Minimal Video Sync Server',
    version: '1.0.0',
    status: 'running',
    message: 'This is a minimal server for testing video sync functionality'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🚀 Minimal server running on ${HOST}:${PORT}`);
  console.log(`📊 Socket.IO enabled`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 CORS enabled for: localhost:3000, localhost:5173, localhost:5174`);
  console.log(`⚠️  Running without MongoDB - using in-memory storage`);
});

export { app, server, io };
