/**
 * Utility Usage Examples
 * Demonstrates how to use the various utility functions in the video player application
 */

import {
  videoUtils,
  syncUtils,
  aiUtils,
  encryptionUtils,
  generalUtils,
  logger
} from './index.js';

// Example usage class
export class UtilityExamples {
  
  /**
   * Video processing example
   */
  async videoProcessingExample() {
    try {
      // Extract video metadata
      const videoPath = '/path/to/video.mp4';
      const metadata = await videoUtils.getVideoMetadata(videoPath);
      
      console.log('Video Information:');
      console.log(`Duration: ${videoUtils.secondsToTimecode(metadata.duration)}`);
      console.log(`Resolution: ${metadata.resolution}`);
      console.log(`Size: ${generalUtils.formatBytes(metadata.size)}`);
      console.log(`Quality: ${videoUtils.getVideoQuality(metadata.video.width, metadata.video.height)}`);
      
      // Validate video file
      const validation = await videoUtils.validateVideoFile(videoPath);
      if (!validation.isValid) {
        console.error('Video validation errors:', validation.errors);
      }
      
      // Generate thumbnail
      const thumbnailPath = '/path/to/thumbnail.jpg';
      await videoUtils.generateThumbnail(videoPath, thumbnailPath, 30); // 30 seconds
      
      logger.info('Video processing completed', { videoPath, thumbnailPath });
      
    } catch (error) {
      logger.error('Video processing failed:', error);
    }
  }

  /**
   * Synchronization example
   */
  syncExample() {
    const hostTime = 120.5; // Host is at 2 minutes 30.5 seconds
    const clientTime = 118.2; // Client is at 1 minute 58.2 seconds
    
    // Calculate lag
    const lagMs = syncUtils.calculateLagMs(hostTime, clientTime);
    console.log(`Client lag: ${lagMs}ms`);
    
    // Determine playback rate adjustment
    const newRate = syncUtils.playbackRateFromLag(lagMs);
    console.log(`Recommended playback rate: ${newRate}x`);
    
    // Check if skipping should occur
    const silenceIntervals = [[115000, 125000]]; // 1:55 to 2:05 is silent
    const skipDecision = syncUtils.shouldSkipLag(lagMs, silenceIntervals, [], clientTime * 1000);
    
    if (skipDecision.shouldSkip) {
      console.log(`Skip to: ${skipDecision.targetTime}s (${skipDecision.reason})`);
    }
    
    // Generate comprehensive sync strategy
    const syncState = {
      lagMs,
      networkDelay: 50,
      bufferHealth: 0.8,
      playbackRate: 1.0,
      isPlaying: true
    };
    
    const strategy = syncUtils.generateSyncStrategy(syncState);
    console.log('Sync strategy:', strategy);
  }

  /**
   * AI processing example
   */
  async aiProcessingExample() {
    try {
      const transcript = `
        Welcome to our tutorial on advanced video processing techniques.
        In this session, we'll explore how to implement real-time synchronization
        between multiple video players across different devices...
      `;
      
      // Summarize transcript
      const summary = await aiUtils.summarizeTranscript(transcript, {
        style: 'concise',
        maxLength: 100,
        contextType: 'educational'
      });
      console.log('Summary:', summary);
      
      // Analyze topics
      const topics = await aiUtils.analyzeTranscriptTopics(transcript, {
        maxTopics: 3
      });
      console.log('Topics:', topics);
      
      // Generate chapters (with timestamped transcript)
      const timestampedTranscript = `
        [00:00:00] Welcome to our tutorial on advanced video processing techniques.
        [00:01:30] In this session, we'll explore synchronization methods.
        [00:03:00] Let's start with the basics of WebRTC technology.
      `;
      
      const chapters = await aiUtils.generateChapters(timestampedTranscript, {
        maxChapters: 5
      });
      console.log('Generated chapters:', chapters);
      
    } catch (error) {
      logger.error('AI processing failed:', error);
    }
  }

  /**
   * Encryption example
   */
  encryptionExample() {
    try {
      // Encrypt sensitive data
      const sensitiveData = "user-secret-token-12345";
      const encrypted = encryptionUtils.encrypt(sensitiveData);
      console.log('Encrypted:', encrypted);
      
      // Decrypt data
      const decrypted = encryptionUtils.decrypt(encrypted);
      console.log('Decrypted:', decrypted);
      
      // Hash password
      const password = "mySecurePassword123!";
      const hashResult = encryptionUtils.hashPassword(password);
      console.log('Password hash:', hashResult);
      
      // Verify password
      const isValid = encryptionUtils.verifyPassword(password, hashResult.salt, hashResult.hash);
      console.log('Password valid:', isValid);
      
      // Generate secure tokens
      const apiKeyData = encryptionUtils.generateAPIKey({
        userId: '12345',
        permissions: ['read', 'write']
      });
      console.log('API Key:', apiKeyData);
      
      // Encrypt object fields
      const userProfile = {
        username: 'johndoe',
        email: 'john@example.com',
        apiKey: 'secret-api-key',
        creditCard: '1234-5678-9012-3456'
      };
      
      const encryptedProfile = encryptionUtils.encryptObjectFields(
        userProfile, 
        ['apiKey', 'creditCard']
      );
      console.log('Encrypted profile:', encryptedProfile);
      
    } catch (error) {
      logger.error('Encryption failed:', error);
    }
  }

  /**
   * General utilities example
   */
  generalUtilitiesExample() {
    // Generate various IDs
    const uuid = generalUtils.generateUUID();
    const roomId = generalUtils.generateRoomId();
    const shortId = generalUtils.generateShortId(8);
    const numericCode = generalUtils.generateNumericCode(6);
    
    console.log('Generated IDs:', { uuid, roomId, shortId, numericCode });
    
    // Format data
    const fileSize = 1536000000; // ~1.5GB
    const duration = 7285; // ~2 hours
    const timestamp = Date.now();
    
    console.log('Formatted data:');
    console.log(`File size: ${generalUtils.formatBytes(fileSize)}`);
    console.log(`Duration: ${generalUtils.formatDuration(duration)}`);
    console.log(`Duration (long): ${generalUtils.formatDuration(duration, { format: 'long' })}`);
    console.log(`Number: ${generalUtils.formatNumber(1234567.89, { locale: 'en-US' })}`);
    
    // Validate inputs
    const email = "user@example.com";
    const url = "https://example.com/video.mp4";
    const filename = "My Video File <>&.mp4";
    
    console.log('Validation results:');
    console.log(`Email valid: ${generalUtils.isValidEmail(email)}`);
    console.log(`URL valid: ${generalUtils.isValidUrl(url)}`);
    console.log(`Sanitized filename: ${generalUtils.sanitizeFilename(filename)}`);
    
    // Parse duration strings
    const durationStrings = ["1:30:45", "90m", "1h 30m 45s"];
    console.log('Parsed durations:');
    durationStrings.forEach(str => {
      try {
        const seconds = generalUtils.parseDuration(str);
        console.log(`"${str}" = ${seconds} seconds`);
      } catch (error) {
        console.log(`"${str}" = Invalid format`);
      }
    });
    
    // Create and use cache
    const cache = generalUtils.createCache(5000); // 5 second TTL
    cache.set('user:123', { name: 'John Doe', role: 'admin' });
    
    setTimeout(() => {
      const cachedUser = cache.get('user:123');
      console.log('Cached user:', cachedUser);
    }, 2000);
    
    // Debounce function example
    let callCount = 0;
    const debouncedFunction = generalUtils.debounce(() => {
      callCount++;
      console.log(`Debounced function called ${callCount} times`);
    }, 1000);
    
    // This will only execute once after 1 second
    debouncedFunction();
    debouncedFunction();
    debouncedFunction();
  }

  /**
   * Error handling and retry example
   */
  async errorHandlingExample() {
    // Retry with exponential backoff
    const unreliableOperation = async () => {
      if (Math.random() < 0.7) {
        throw new Error('Random failure');
      }
      return 'Success!';
    };
    
    try {
      const result = await generalUtils.retry(unreliableOperation, {
        maxRetries: 3,
        initialDelay: 1000,
        backoffFactor: 2,
        retryCondition: (error) => error.message === 'Random failure'
      });
      
      console.log('Retry result:', result);
    } catch (error) {
      logger.error('All retry attempts failed:', error);
    }
    
    // File info with error handling
    const files = ['/path/to/existing/file.txt', '/path/to/nonexistent/file.txt'];
    
    for (const filePath of files) {
      const fileInfo = await generalUtils.getFileInfo(filePath);
      if (fileInfo.exists) {
        console.log(`File info for ${filePath}:`, {
          size: generalUtils.formatBytes(fileInfo.size),
          modified: fileInfo.modifiedAt.toISOString()
        });
      } else {
        console.log(`File not found: ${filePath}`);
      }
    }
  }

  /**
   * Integration example - processing uploaded video
   */
  async processUploadedVideo(videoPath, userId) {
    try {
      logger.info('Starting video processing', { videoPath, userId });
      
      // 1. Validate video file
      const validation = await videoUtils.validateVideoFile(videoPath);
      if (!validation.isValid) {
        throw new Error(`Invalid video: ${validation.errors.join(', ')}`);
      }
      
      // 2. Extract metadata
      const metadata = validation.metadata;
      const videoId = generalUtils.generateUUID();
      
      // 3. Generate secure identifiers
      const roomId = generalUtils.generateRoomId();
      const accessToken = encryptionUtils.generateSecureToken(32, 'base64url');
      
      // 4. Create thumbnail
      const thumbnailDir = `/uploads/thumbnails/${userId}`;
      const thumbnailPath = `${thumbnailDir}/${videoId}.jpg`;
      await videoUtils.generateThumbnail(videoPath, thumbnailPath, 10);
      
      // 5. Format data for database
      const videoRecord = {
        id: videoId,
        userId,
        roomId,
        title: generalUtils.sanitizeFilename(metadata.filename),
        duration: metadata.duration,
        resolution: metadata.resolution,
        format: metadata.format,
        size: metadata.size,
        formattedSize: generalUtils.formatBytes(metadata.size),
        formattedDuration: generalUtils.formatDuration(metadata.duration),
        thumbnailPath,
        metadata: encryptionUtils.encryptObjectFields(metadata, ['raw']),
        accessToken: encryptionUtils.encrypt(accessToken),
        createdAt: generalUtils.getTimestamp('iso')
      };
      
      logger.info('Video processing completed', {
        videoId,
        roomId,
        duration: videoRecord.formattedDuration,
        size: videoRecord.formattedSize
      });
      
      return videoRecord;
      
    } catch (error) {
      logger.error('Video processing failed', {
        videoPath,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Real-time sync example
   */
  handleSyncUpdate(roomId, hostTime, participants) {
    try {
      const syncResults = [];
      
      for (const participant of participants) {
        // Calculate lag for each participant
        const lagMs = syncUtils.calculateLagMs(hostTime, participant.currentTime);
        const networkDelay = syncUtils.calculateNetworkDelay(
          participant.lastPingTime,
          Date.now() - 10, // Server processing time
          Date.now()
        );
        
        // Generate sync strategy
        const syncState = {
          lagMs,
          networkDelay: networkDelay.estimatedOneWayDelay,
          bufferHealth: participant.bufferHealth || 0.8,
          playbackRate: participant.playbackRate || 1.0,
          consecutiveLagEvents: participant.consecutiveLagEvents || 0,
          isPlaying: participant.isPlaying
        };
        
        const strategy = syncUtils.generateSyncStrategy(syncState);
        
        syncResults.push({
          participantId: participant.id,
          lagMs,
          networkQuality: networkDelay.quality,
          strategy,
          nextSyncInterval: syncUtils.getOptimalSyncInterval({
            lagMs,
            networkQuality: networkDelay.quality,
            participantCount: participants.length,
            isPlaying: participant.isPlaying
          })
        });
      }
      
      logger.info('Sync update processed', {
        roomId,
        participantCount: participants.length,
        avgLag: syncResults.reduce((sum, r) => sum + Math.abs(r.lagMs), 0) / syncResults.length
      });
      
      return syncResults;
      
    } catch (error) {
      logger.error('Sync update failed', { roomId, error: error.message });
      throw error;
    }
  }
}

// Export example usage
export default new UtilityExamples();
