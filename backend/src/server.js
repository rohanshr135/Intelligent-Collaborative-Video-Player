import express from 'express';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import logger from './utils/logger.js';
import connectDB from './config/db.js';
import syncHandler from './sockets/sync.js';
import { socketAuth, handleSocketConnection } from './sockets/roomSocket.js';
import { setSocketIO } from './controllers/chatController.js';

// Import all routes
import aiRoutes from './routes/ai.js';
import storyRoutes from './routes/story.js';
import markerRoutes from './routes/markers.js';
import roomRoutes from './routes/roomRoutes.js';

// New collaborative feature routes
import chatRoutes from './routes/chat.js';
import notesRoutes from './routes/notes.js';
import subtitlesRoutes from './routes/subtitles.js';
import summaryRoutes from './routes/summary.js';

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// Socket.IO Server Setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Set up Socket.IO instance for controllers
setSocketIO(io);

// Socket.IO Authentication Middleware
io.use(socketAuth);

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  logger.info(`📱 New socket connection: ${socket.id}`);

  // Main connection handler with all event listeners
  handleSocketConnection(io, socket);
  
  // Legacy sync handler for backward compatibility
  syncHandler(io, socket);

  // Disconnect handler
  socket.on('disconnect', (reason) => {
    logger.info(`🔌 Socket disconnected: ${socket.id} (${reason})`);
  });

  // Error handling
  socket.on('error', (error) => {
    logger.error(`❌ Socket error: ${socket.id}:`, error);
  });
});

// Express Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// REST API Routes
app.use('/api/rooms', roomRoutes);
app.use('/api/ai', aiRoutes);

// New collaborative feature routes
app.use('/api/chat', chatRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/subtitles', subtitlesRoutes);
app.use('/api/summary', summaryRoutes);

// Legacy routes (for backward compatibility)
app.use('/api/story', storyRoutes);
app.use('/api/markers', markerRoutes);

// Static serving for uploaded assets
app.use('/uploads', express.static(path.resolve('uploads')));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Intelligent Collaborative Video Player API',
    version: '1.0.0',
    status: 'running'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info(`🚀 Server running on ${HOST}:${PORT}`);
  logger.info(`📊 Socket.IO enabled`);
  logger.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`📡 CORS enabled for: ${process.env.FRONTEND_URL || 'localhost:3000, localhost:5173, localhost:5174'}`);
});

// Export for testing
export { app, server, io };
