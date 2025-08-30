import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { nanoid } from 'nanoid';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

import logger from './utils/logger.js';
import connectDB from './config/db.js';
import syncHandler from './sockets/sync.js';
import { socketAuth, handleSocketConnection } from './sockets/roomSocket.js';

// Import all routes
import aiRoutes from './routes/ai.js';
import storyRoutes from './routes/story.js';
import markerRoutes from './routes/markers.js';
import roomRoutes from './routes/roomRoutes.js';
import userRoutes from './routes/userRoutes.js';
import videoRoutes from './routes/videoRoutes.js';
import syncRoutes from './routes/syncRoutes.js';
import branchingRoutes from './routes/branchingRoutes.js';
import editorRoutes from './routes/editorRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// Socket.IO Server Setup with CORS and security
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Connection limits and timeouts
  maxHttpBufferSize: 1e6, // 1MB
  pingTimeout: 60000,
  pingInterval: 25000,
  // Security settings
  allowEIO3: false,
  transports: ['websocket', 'polling'],
  upgradeTimeout: 10000,
  // Rate limiting
  connectTimeout: 45000
});

// Redis adapter for scaling (optional - only if Redis is available)
async function setupRedisAdapter() {
  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      
      await Promise.all([pubClient.connect(), subClient.connect()]);
      
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.IO Redis adapter connected successfully');
    } catch (error) {
      logger.warn('Redis not available for Socket.IO scaling, using memory store:', error.message);
    }
  }
}

// Setup Redis adapter
setupRedisAdapter();

// Socket.IO Authentication Middleware
io.use(socketAuth);

// Connection monitoring
const connectedUsers = new Map();
const roomStats = new Map();

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  // Track connection
  connectedUsers.set(socket.id, {
    userId: socket.userId,
    connectedAt: new Date(),
    lastActivity: new Date()
  });

  logger.info(`User ${socket.userId} connected (socket: ${socket.id}). Total connections: ${connectedUsers.size}`);

  // Main connection handler with all event listeners
  handleSocketConnection(io, socket);
  
  // Legacy sync handler for backward compatibility
  syncHandler(io, socket);

  // Connection monitoring
  socket.on('ping', () => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      userData.lastActivity = new Date();
    }
    socket.emit('pong', { serverTime: new Date().toISOString() });
  });

  // Enhanced disconnect handler
  socket.on('disconnect', (reason) => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      const sessionDuration = new Date() - userData.connectedAt;
      logger.info(`User ${userData.userId} disconnected (${reason}) after ${Math.round(sessionDuration / 1000)}s. Remaining: ${connectedUsers.size - 1}`);
      connectedUsers.delete(socket.id);
    }
  });

  // Error handling
  socket.on('error', (error) => {
    logger.error(`Socket error for user ${socket.userId}:`, error);
  });
});

// Socket.IO error handling
io.engine.on('connection_error', (err) => {
  logger.error('Socket.IO connection error:', {
    code: err.code,
    message: err.message,
    context: err.context,
    type: err.type
  });
});

// Express Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    connections: connectedUsers.size,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// MongoDB status endpoint
app.get('/db-status', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    if (dbState === 1) {
      // Test actual database operation
      await mongoose.connection.db.admin().ping();
      res.json({
        status: 'connected',
        state: states[dbState],
        database: mongoose.connection.name,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not connected',
        state: states[dbState],
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Socket.IO status endpoint
app.get('/socket-status', (req, res) => {
  const rooms = [];
  io.sockets.adapter.rooms.forEach((sockets, room) => {
    if (!sockets.has(room)) { // This is a room, not a socket ID
      rooms.push({
        room,
        participants: sockets.size
      });
    }
  });

  res.json({
    totalConnections: connectedUsers.size,
    totalRooms: rooms.length,
    rooms: rooms.slice(0, 20), // Limit to first 20 rooms
    serverTime: new Date().toISOString()
  });
});

// REST API Routes
app.use('/api/users', userRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/branching', branchingRoutes);
app.use('/api/editor', editorRoutes);
app.use('/api/analytics', analyticsRoutes);

// Legacy routes (for backward compatibility)
app.use('/api/story', storyRoutes);
app.use('/api/markers', markerRoutes);
app.use('/api/rooms', roomRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Intelligent Collaborative Video Player API',
    version: '1.0.0',
    status: 'running',
    features: [
      'Multi-device sync',
      'AI-powered transcription and summarization',
      'Interactive branching videos',
      'Collaborative editing tools',
      'Real-time analytics',
      'WebSocket communication'
    ],
    endpoints: {
      health: '/health',
      socketStatus: '/socket-status',
      api: '/api/*'
    },
    documentation: process.env.API_DOCS_URL || 'Available on request'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    data: null,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    error: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown:', err);
      process.exit(1);
    }
    
    logger.info('Server closed successfully');
    
    // Close database connections, Redis connections, etc.
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info(`🚀 Server running on ${HOST}:${PORT}`);
  logger.info(`📊 Socket.IO enabled with ${io.engine.clientsCount} initial connections`);
  logger.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`📡 CORS enabled for: ${process.env.FRONTEND_URL || 'localhost:3000, localhost:5173'}`);
  
  if (process.env.REDIS_URL) {
    logger.info(`🔄 Redis adapter configured for scaling`);
  }
});

// Export for testing
export { app, server, io };
