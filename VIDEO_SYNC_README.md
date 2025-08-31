# Video Sync System - Implementation Guide

## Overview

This implementation provides a comprehensive video syncing system that allows users to create rooms, upload videos, and synchronize playback across multiple participants. The system includes automatic URL generation, host controls, temporary video storage, and lag compensation.

## Features

### 🎬 Video Room Creation
- **File Upload**: Support for video files up to 100MB
- **Automatic Processing**: Videos are processed and stored temporarily
- **Room Generation**: Unique 6-character room codes are generated automatically
- **Shareable Links**: Automatic generation of join URLs for participants

### 🎮 Host Controls
- **Playback Control**: Only the host can play, pause, and seek
- **Permission Management**: Host can grant control to other participants
- **Room Management**: Host can end sessions and extend expiration

### 👥 Participant Management
- **Easy Joining**: Participants join using room codes or links
- **Real-time Sync**: All participants see synchronized video playback
- **Lag Compensation**: Built-in lag detection and compensation
- **Participant Limits**: Configurable maximum participant counts

### ⏰ Temporary Storage
- **Automatic Expiration**: Videos expire based on duration + buffer time
- **Cleanup Service**: Automatic cleanup of expired rooms and videos
- **Storage Management**: Efficient temporary storage with TTL indexes

## Technical Implementation

### Backend Architecture

#### 1. Enhanced SyncRoom Model
```javascript
// New fields added to SyncRoom
{
  video: {
    title: String,
    duration: Number,
    fileSize: Number,
    mimeType: String,
    resolution: String,
    uploadedBy: String,
    uploadedAt: Date,
    expiresAt: Date,
    isTemporary: Boolean
  },
  settings: {
    allowControl: 'host' | 'all' | 'moderators',
    maxParticipants: Number,
    autoSync: Boolean,
    lagCompensation: Boolean
  },
  participants: [{
    userId: String,
    isHost: Boolean,
    canControl: Boolean,
    lastSeen: Date,
    lastSync: Date,
    lagMs: Number
  }]
}
```

#### 2. Room Service
- **Video Room Creation**: Handles video uploads and room setup
- **Automatic Cleanup**: Manages expired rooms and videos
- **Permission Management**: Controls who can modify playback
- **Statistics**: Provides room health and usage metrics

#### 3. Enhanced Socket Handler
- **Real-time Sync**: WebSocket-based video synchronization
- **Lag Compensation**: Server timestamp-based synchronization
- **Permission Validation**: Ensures only authorized users can control
- **Participant Management**: Handles joins, leaves, and status updates

### Frontend Components

#### 1. VideoRoomCreator
- **File Upload Interface**: Drag-and-drop video file selection
- **Room Configuration**: Set participant limits and permissions
- **Success Display**: Shows room details and shareable links

#### 2. VideoRoomJoiner
- **Room Code Entry**: Simple 6-character code input
- **Quick Join**: Support for paste-in join links
- **Room Information**: Displays room details before joining

## API Endpoints

### Room Management
```
POST /api/rooms                    # Create room with video upload
POST /api/rooms/:code/join         # Join existing room
GET  /api/rooms/:code/state        # Get current playback state
POST /api/rooms/:code/state        # Update playback state
GET  /api/rooms/:code              # Get room details
GET  /api/rooms/:code/stats        # Get room statistics
POST /api/rooms/:code/end          # End room session (host only)
```

### Video Management
```
POST /api/rooms/:code/video        # Set video URL (host only)
POST /api/rooms/:code/controllers  # Manage control permissions
```

## Usage Examples

### 1. Creating a Video Room

```javascript
// Frontend: Upload video and create room
const formData = new FormData();
formData.append('videoFile', videoFile);
formData.append('videoTitle', 'My Video');
formData.append('maxParticipants', 10);
formData.append('userId', 'host123');

const response = await fetch('/api/rooms', {
  method: 'POST',
  body: formData
});

const roomData = await response.json();
// Returns: { code: 'ABC123', joinUrl: '...', expiresAt: '...' }
```

### 2. Joining a Room

```javascript
// Frontend: Join using room code
const response = await fetch(`/api/rooms/${roomCode}/join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'participant456' })
});

const roomInfo = await response.json();
// Returns: room details, video info, participant list
```

### 3. Real-time Video Sync

```javascript
// Socket events for video synchronization
socket.emit('join_room', { roomCode: 'ABC123', userId: 'user123' });

// Host controls playback
socket.emit('playback_event', {
  roomCode: 'ABC123',
  type: 'play',
  timestamp: 45.2,
  userId: 'host123'
});

// All participants receive sync updates
socket.on('playback_event', (event) => {
  // Update video player state
  videoPlayer.currentTime = event.timestamp;
  if (event.paused) videoPlayer.pause();
  else videoPlayer.play();
});
```

## Configuration

### Environment Variables
```bash
# Video upload settings
UPLOAD_PATH=./uploads/videos
THUMBNAIL_PATH=./uploads/thumbnails
TEMP_PATH=./temp

# Room settings
MAX_VIDEO_SIZE=104857600  # 100MB in bytes
ROOM_EXPIRY_HOURS=6      # Default room expiration
VIDEO_BUFFER_HOURS=1      # Additional time after video ends
```

### Room Settings
```javascript
const defaultSettings = {
  allowControl: 'host',        // Who can control playback
  maxParticipants: 10,         // Maximum room capacity
  autoSync: true,             // Enable automatic synchronization
  lagCompensation: true       // Enable lag compensation
};
```

## Security Features

### Permission System
- **Host-Only Controls**: By default, only the room creator can control playback
- **Controller Management**: Host can grant control permissions to specific users
- **Room Ownership**: Only the host can modify room settings or end sessions

### File Validation
- **Type Checking**: Only video files are accepted
- **Size Limits**: Configurable maximum file sizes
- **Content Validation**: Server-side file type verification

### Access Control
- **Room Codes**: 6-character randomly generated codes
- **Expiration**: Automatic cleanup prevents long-term storage
- **Participant Limits**: Prevents room overcrowding

## Performance Optimizations

### Lag Compensation
- **Server Timestamps**: All events include server timestamps
- **Client Lag Detection**: Automatic calculation of client-server lag
- **Smart Sync**: Intelligent synchronization based on network conditions

### Cleanup Services
- **Automatic Expiration**: TTL indexes for automatic cleanup
- **Background Processing**: Non-blocking cleanup every 15 minutes
- **Storage Efficiency**: Temporary storage with automatic cleanup

### Real-time Updates
- **WebSocket Communication**: Low-latency real-time updates
- **Event Broadcasting**: Efficient room-based event distribution
- **Connection Management**: Automatic cleanup of disconnected users

## Monitoring and Debugging

### Logging
```javascript
// Comprehensive logging for debugging
logger.info('🎬 Video room created:', { code, hostId, videoTitle });
logger.info('👤 User joined room:', { userId, roomCode });
logger.info('🎮 Playback event:', { type, timestamp, userId });
logger.info('🧹 Cleanup completed:', { expiredRooms, expiredVideos });
```

### Room Statistics
```javascript
// Get room health metrics
const stats = await roomService.getRoomStats(roomCode);
// Returns: participant count, room age, time until expiry, etc.
```

### Debug Endpoints
```javascript
GET /api/rooms          # List all rooms (for testing)
GET /api/rooms/:code    # Get detailed room information
```

## Deployment Considerations

### Storage Requirements
- **Video Files**: Temporary storage for uploaded videos
- **Thumbnails**: Generated thumbnails for video previews
- **Database**: MongoDB with TTL indexes for automatic cleanup

### Scaling Considerations
- **File Storage**: Consider cloud storage for production (S3, etc.)
- **CDN Integration**: Use CDN for video streaming in production
- **Load Balancing**: Multiple server instances for high availability

### Monitoring
- **Room Health**: Monitor active rooms and participant counts
- **Storage Usage**: Track temporary file storage and cleanup
- **Performance Metrics**: Monitor lag compensation and sync accuracy

## Troubleshooting

### Common Issues

#### 1. Video Not Syncing
- Check if user has control permissions
- Verify WebSocket connection is active
- Check for JavaScript errors in browser console

#### 2. Room Not Found
- Verify room code is correct (6 characters, uppercase)
- Check if room has expired
- Ensure room status is 'active'

#### 3. Upload Failures
- Check file size limits
- Verify file type is supported video format
- Check server storage permissions

#### 4. Permission Denied
- Only hosts can control playback by default
- Host must grant control permissions to other users
- Check user ID matches room participant list

### Debug Commands
```bash
# Check room status
curl /api/rooms/ABC123

# List all active rooms
curl /api/rooms

# Get room statistics
curl /api/rooms/ABC123/stats
```

## Future Enhancements

### Planned Features
- **Video Quality Selection**: Multiple quality options for different network conditions
- **Advanced Permissions**: Role-based access control (moderator, viewer, etc.)
- **Recording**: Option to record synchronized sessions
- **Analytics**: Detailed usage analytics and reporting
- **Mobile Optimization**: Enhanced mobile experience and controls

### Integration Possibilities
- **Authentication**: User account integration
- **Social Features**: Share rooms on social media
- **API Integration**: Third-party service integration
- **Webhook Support**: External service notifications

## Support

For technical support or questions about the video sync system:
- Check the logs for detailed error information
- Verify room and user permissions
- Test with different video formats and sizes
- Monitor network connectivity and WebSocket status

---

This implementation provides a robust foundation for synchronized video watching with automatic room management, host controls, and participant synchronization. The system is designed to be scalable, secure, and user-friendly while maintaining high performance and reliability.
