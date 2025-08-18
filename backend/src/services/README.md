# Video Player Services

This directory contains the complete service layer for the video player application, providing business logic and core functionality.

## Service Overview

### 🎥 Video Service (`videoService.js`)
**Core video management functionality**
- Video upload and processing
- Metadata extraction using FFprobe
- File storage and organization
- Video streaming with range support
- Search and filtering
- Analytics and statistics

**Key Features:**
- Automatic thumbnail generation
- Quality classification (HD, 4K)
- Secure file handling
- Transcoding job queuing
- Comprehensive error handling

### 🔄 Sync Service (`syncService.js`)
**Multi-device synchronization**
- Real-time session management
- Lag compensation algorithms
- Participant tracking
- Heartbeat monitoring
- Session discovery via access codes

**Key Features:**
- Sub-second synchronization accuracy
- Automatic lag detection and compensation
- Host migration support
- Redis-backed session storage
- WebSocket integration

### 🤖 AI Service (`aiService.js`)
**AI-powered content analysis**
- OpenAI Whisper transcription
- GPT-powered summarization
- Chapter generation
- Content analysis and tagging
- Sentiment analysis

**Key Features:**
- Multiple AI model support
- Caching and optimization
- Batch processing
- Error recovery
- Token usage tracking

### 🌲 Branching Service (`branchingService.js`)
**Interactive branching videos**
- Decision point management
- User choice tracking
- Path analytics
- Session state management
- Story progression logic

**Key Features:**
- Complex branching structures
- Real-time choice tracking
- Analytics and insights
- Session persistence
- Collaboration support

### ✂️ Editor Service (`editorService.js`)
**Video editing and markers**
- Scene marker management
- Timeline editing
- Multi-format export (EDL, SRT, CSV, XML, FCPXML)
- Auto-suggestion generation
- Collaborative editing

**Key Features:**
- Professional export formats
- AI-powered suggestions
- Real-time collaboration
- Version control
- Import/export workflows

### 👤 User Service (`userService.js`)
**User management and authentication**
- Registration and authentication
- Profile management
- Session handling
- Watch history tracking
- Achievement system

**Key Features:**
- Secure password handling
- JWT session management
- 2FA support
- Activity tracking
- Privacy controls

## Quick Start

### Basic Usage

```javascript
import services from './services/index.js';

// Upload and process a video
const video = await services.video.storeAndProcessVideo(
  fileBuffer,
  fileMeta,
  userId,
  { title: 'My Video', isPublic: true }
);

// Create a sync session
const session = await services.sync.createSession(
  video._id,
  'Movie Night',
  hostUserId
);

// Add editing markers
const marker = await services.editor.addMarker(
  video._id,
  120.5,
  'Important Scene',
  'scene',
  userId
);
```

### Complete Workflow Example

```javascript
import { runAllExamples } from './services/examples.js';

// Run comprehensive examples
const results = await runAllExamples();
console.log('Workflow completed:', results);
```

## Service Architecture

### Singleton Pattern
All services use the singleton pattern for:
- Consistent state management
- Resource optimization
- Cache sharing
- Event coordination

### Event-Driven Communication
Services emit events for:
- Real-time updates
- Cross-service coordination
- Analytics tracking
- Error handling

### Caching Strategy
Multi-layer caching:
- In-memory for hot data
- Redis for distributed cache
- Database for persistence
- File system for large objects

### Error Handling
Comprehensive error handling:
- Service-level try/catch
- Graceful degradation
- Detailed logging
- User-friendly messages

## Configuration

### Environment Variables

```env
# Video Storage
UPLOAD_PATH=./uploads/videos
THUMBNAIL_PATH=./uploads/thumbnails
TEMP_PATH=./temp

# AI Services
OPENAI_API_KEY=your-openai-key
GOOGLE_AI_API_KEY=your-google-key

# Database
MONGODB_URI=mongodb://localhost:27017/videoplayer
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key
```

### Service Configuration

Each service accepts configuration options:

```javascript
const videoService = new VideoService({
  uploadPath: './custom/upload/path',
  maxFileSize: 100 * 1024 * 1024, // 100MB
  supportedFormats: ['mp4', 'avi', 'mov']
});
```

## API Integration

### Express.js Integration

```javascript
import express from 'express';
import services from './services/index.js';

const app = express();

// Video upload endpoint
app.post('/api/videos', async (req, res) => {
  try {
    const video = await services.video.storeAndProcessVideo(
      req.file.buffer,
      req.file,
      req.user.id
    );
    res.json(video);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Socket.IO Integration

```javascript
import { Server } from 'socket.io';
import services from './services/index.js';

const io = new Server(server);

// Listen for sync events
services.sync.on('sync-update', (data) => {
  io.to(data.sessionId).emit('sync-update', data);
});
```

## Testing

### Unit Tests
Each service includes comprehensive unit tests:

```bash
npm test -- --grep "VideoService"
npm test -- --grep "SyncService"
```

### Integration Tests
Full workflow testing:

```bash
npm run test:integration
```

### Performance Tests
Benchmark testing:

```bash
npm run test:performance
```

## Monitoring

### Health Checks

```javascript
import { serviceManager } from './services/index.js';

// Get service health
const health = serviceManager.getHealthStatus();
console.log('System health:', health.overall);
```

### Metrics Collection

```javascript
// Get service statistics
const stats = serviceManager.getAggregatedStats();
console.log('Service metrics:', stats);
```

## Deployment

### Production Considerations

1. **Scaling**: Services are designed for horizontal scaling
2. **Monitoring**: Built-in health checks and metrics
3. **Security**: Encrypted data and secure authentication
4. **Performance**: Optimized caching and async operations

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/server.js"]
```

### Environment Setup

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/videoplayer
      - REDIS_URL=redis://redis:6379
  mongo:
    image: mongo:latest
  redis:
    image: redis:alpine
```

## Contributing

### Adding New Services

1. Create service class extending base patterns
2. Implement required methods: `getServiceStats()`, `initialize()`, `shutdown()`
3. Add comprehensive error handling and logging
4. Include examples in `examples.js`
5. Update service manager exports

### Service Guidelines

- Use async/await for all operations
- Implement proper error boundaries
- Add comprehensive logging
- Include performance monitoring
- Write unit and integration tests

## Documentation

### API Documentation
Each service method includes JSDoc documentation with:
- Parameter descriptions
- Return value types
- Error conditions
- Usage examples

### Examples
Comprehensive examples in `examples.js` demonstrate:
- Basic usage patterns
- Integration workflows
- Error handling
- Performance optimization

## Support

For questions, issues, or contributions:
1. Check the examples in `examples.js`
2. Review service documentation
3. Run health checks for debugging
4. Check logs for detailed error information

---

**Built with ❤️ for scalable video applications**
