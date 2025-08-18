/**
 * Service Examples - Comprehensive usage examples for all video player services
 * This file demonstrates how to use each service in real-world scenarios
 */

import services from './index.js';
import logger from '../utils/logger.js';

const {
  video: videoService,
  sync: syncService,
  ai: aiService,
  branching: branchingService,
  editor: editorService,
  user: userService
} = services;

/**
 * Video Service Examples
 */
export class VideoServiceExamples {
  /**
   * Example: Complete video upload and processing workflow
   */
  static async uploadAndProcessVideo() {
    try {
      console.log('=== Video Upload and Processing Example ===');
      
      // Simulate file upload
      const fileBuffer = Buffer.from('fake video data');
      const fileMeta = {
        originalname: 'sample-video.mp4',
        mimetype: 'video/mp4',
        size: 1024000
      };
      const userId = 'user123';
      
      // Upload and process video
      const video = await videoService.storeAndProcessVideo(
        fileBuffer,
        fileMeta,
        userId,
        {
          title: 'My Awesome Video',
          description: 'A demo video for testing',
          isPublic: true,
          enableTranscoding: false // Disable for demo
        }
      );
      
      console.log('Video processed:', {
        id: video._id,
        title: video.title,
        duration: video.duration,
        resolution: video.resolution
      });
      
      // Update video metadata
      const updatedVideo = await videoService.updateVideoMetadata(
        video._id,
        {
          title: 'Updated Video Title',
          description: 'Updated description',
          tags: ['demo', 'example', 'test']
        },
        userId
      );
      
      console.log('Video metadata updated:', updatedVideo.title);
      
      // Search for videos
      const searchResults = await videoService.searchVideos(
        { query: 'awesome' },
        { page: 1, limit: 10 }
      );
      
      console.log('Search results:', {
        total: searchResults.pagination.total,
        videos: searchResults.videos.length
      });
      
      return video._id;
      
    } catch (error) {
      console.error('Video service example failed:', error.message);
      throw error;
    }
  }

  /**
   * Example: Video streaming setup
   */
  static async setupVideoStreaming(videoId, userId) {
    try {
      console.log('=== Video Streaming Example ===');
      
      // Get streaming info without range
      const streamInfo = await videoService.getStreamingInfo(videoId, null, userId);
      console.log('Stream info:', {
        fileSize: streamInfo.fileSize,
        mimeType: streamInfo.mimeType,
        contentLength: streamInfo.contentLength
      });
      
      // Get streaming info with range header (partial content)
      const rangeStreamInfo = await videoService.getStreamingInfo(
        videoId,
        'bytes=0-1023',
        userId
      );
      console.log('Range stream info:', {
        start: rangeStreamInfo.start,
        end: rangeStreamInfo.end,
        contentLength: rangeStreamInfo.contentLength
      });
      
      return streamInfo;
      
    } catch (error) {
      console.error('Video streaming example failed:', error.message);
      throw error;
    }
  }
}

/**
 * Sync Service Examples
 */
export class SyncServiceExamples {
  /**
   * Example: Create and manage sync session
   */
  static async createSyncSession(videoId, hostUserId) {
    try {
      console.log('=== Sync Session Management Example ===');
      
      // Create sync session
      const session = await syncService.createSession(
        videoId,
        'Movie Night Session',
        hostUserId,
        {
          maxParticipants: 10,
          allowParticipantControl: false,
          enableLagCompensation: true
        }
      );
      
      console.log('Sync session created:', {
        id: session._id,
        accessCode: session.accessCode,
        sessionName: session.sessionName
      });
      
      // Add participants
      const participant1 = await syncService.joinSession(
        session._id,
        'user456',
        'device1',
        'iPhone 12',
        { userAgent: 'iOS App 1.0' }
      );
      
      const participant2 = await syncService.joinSession(
        session._id,
        'user789',
        'device2',
        'Chrome Browser',
        { userAgent: 'Chrome/91.0' }
      );
      
      console.log('Participants joined:', {
        participant1: participant1._id,
        participant2: participant2._id
      });
      
      // Update playback state
      const syncUpdate = await syncService.updatePlaybackState(
        session._id,
        {
          timestamp: 120.5,
          isPlaying: true,
          playbackRate: 1.0,
          eventType: 'play'
        },
        hostUserId
      );
      
      console.log('Playback state updated:', {
        timestamp: syncUpdate.session.currentTimestamp,
        isPlaying: syncUpdate.session.isPlaying,
        participants: syncUpdate.participants
      });
      
      // Update participant heartbeat
      const lagInfo = await syncService.updateParticipantHeartbeat(
        participant1._id,
        {
          clientTime: new Date(),
          currentPosition: 121.0,
          isPlaying: true,
          playbackRate: 1.0
        }
      );
      
      console.log('Participant lag info:', {
        networkLag: lagInfo.networkLag,
        averageLag: lagInfo.averageLag,
        syncQuality: lagInfo.syncQuality
      });
      
      return session._id;
      
    } catch (error) {
      console.error('Sync service example failed:', error.message);
      throw error;
    }
  }

  /**
   * Example: Session discovery and joining
   */
  static async joinSessionByCode(accessCode, userId) {
    try {
      console.log('=== Session Discovery Example ===');
      
      // Find session by access code
      const session = await syncService.findSessionByAccessCode(accessCode);
      
      if (session) {
        console.log('Session found:', {
          id: session._id,
          name: session.sessionName,
          video: session.video.title
        });
        
        // Join the session
        const participant = await syncService.joinSession(
          session._id,
          userId,
          'web-device',
          'Web Browser'
        );
        
        console.log('Joined session as participant:', participant._id);
        return participant;
      } else {
        console.log('Session not found with access code:', accessCode);
        return null;
      }
      
    } catch (error) {
      console.error('Session join example failed:', error.message);
      throw error;
    }
  }
}

/**
 * AI Service Examples
 */
export class AIServiceExamples {
  /**
   * Example: Video transcription workflow
   */
  static async transcribeVideo(videoId, audioFilePath) {
    try {
      console.log('=== AI Transcription Example ===');
      
      // Transcribe video
      const transcript = await aiService.transcribeVideo(
        videoId,
        audioFilePath,
        {
          language: 'en',
          model: 'whisper-1',
          extractAudio: true
        }
      );
      
      console.log('Transcription completed:', {
        id: transcript._id,
        language: transcript.language,
        wordCount: transcript.wordCount,
        confidence: transcript.averageConfidence
      });
      
      // Get transcript segments
      console.log('First few segments:');
      transcript.segments.slice(0, 3).forEach((segment, index) => {
        console.log(`${index + 1}. [${segment.start}s - ${segment.end}s]: ${segment.text}`);
      });
      
      return transcript;
      
    } catch (error) {
      console.error('AI transcription example failed:', error.message);
      throw error;
    }
  }

  /**
   * Example: Content summarization
   */
  static async generateSummaries(videoId) {
    try {
      console.log('=== AI Summarization Example ===');
      
      // Generate summary at 5 minutes
      const summary5min = await aiService.summarizeAtTimestamp(
        videoId,
        300, // 5 minutes
        {
          maxLength: 150,
          style: 'concise',
          includeKeyPoints: true
        }
      );
      
      console.log('5-minute summary:', {
        id: summary5min._id,
        length: summary5min.summaryLength,
        keyPoints: summary5min.keyPoints?.length || 0
      });
      console.log('Summary text:', summary5min.summaryText);
      
      // Generate chapters
      const chapters = await aiService.generateChapters(
        videoId,
        {
          minChapterLength: 60,
          maxChapters: 10,
          style: 'descriptive'
        }
      );
      
      console.log('Generated chapters:', chapters.length);
      chapters.forEach((chapter, index) => {
        console.log(`Chapter ${index + 1}: ${chapter.title} (${chapter.startTime}s - ${chapter.endTime}s)`);
      });
      
      // Analyze content
      const analysis = await aiService.analyzeVideoContent(
        videoId,
        {
          analyzeTopics: true,
          analyzeSentiment: true,
          extractKeywords: true
        }
      );
      
      console.log('Content analysis:', {
        topics: analysis.topics?.length || 0,
        sentiment: analysis.overallSentiment,
        keywords: analysis.keywords?.length || 0
      });
      
      return { summary5min, chapters, analysis };
      
    } catch (error) {
      console.error('AI summarization example failed:', error.message);
      throw error;
    }
  }
}

/**
 * Branching Service Examples
 */
export class BranchingServiceExamples {
  /**
   * Example: Interactive branching video
   */
  static async createBranchingVideo(videoId, userId) {
    try {
      console.log('=== Branching Video Example ===');
      
      // Define branching structure
      const branchStructure = {
        decisionPoints: [
          {
            id: 'choice1',
            title: 'Character Introduction',
            description: 'Choose how to introduce the main character',
            timestamp: 30,
            timeLimit: 15,
            choices: [
              {
                id: 'dramatic',
                label: 'Dramatic entrance',
                description: 'Character makes a dramatic entrance',
                nextPath: 'dramatic_path',
                nextTimestamp: 45
              },
              {
                id: 'subtle',
                label: 'Subtle introduction',
                description: 'Character is introduced subtly',
                nextPath: 'subtle_path',
                nextTimestamp: 40
              }
            ]
          },
          {
            id: 'choice2',
            title: 'Story Direction',
            description: 'Choose the story direction',
            timestamp: 120,
            timeLimit: 20,
            choices: [
              {
                id: 'action',
                label: 'Action sequence',
                description: 'Focus on action and adventure',
                nextPath: 'action_path',
                nextTimestamp: 140
              },
              {
                id: 'mystery',
                label: 'Mystery plot',
                description: 'Develop the mystery elements',
                nextPath: 'mystery_path',
                nextTimestamp: 135
              },
              {
                id: 'romance',
                label: 'Romantic subplot',
                description: 'Explore romantic relationships',
                nextPath: 'romance_path',
                nextTimestamp: 130
              }
            ]
          }
        ]
      };
      
      // Create branching video
      const branchingVideo = await branchingService.createBranching(
        videoId,
        branchStructure,
        userId,
        {
          title: 'Interactive Adventure Story',
          description: 'Choose your own adventure',
          isPublic: true,
          allowRestart: true
        }
      );
      
      console.log('Branching video created:', {
        id: branchingVideo._id,
        title: branchingVideo.title,
        decisionPoints: branchingVideo.totalDecisionPoints,
        totalPaths: branchingVideo.totalPaths
      });
      
      // Publish the branching video
      const published = await branchingService.publishBranching(
        branchingVideo._id,
        userId
      );
      
      console.log('Branching video published:', published.isPublished);
      
      return branchingVideo._id;
      
    } catch (error) {
      console.error('Branching video example failed:', error.message);
      throw error;
    }
  }

  /**
   * Example: User interaction with branching video
   */
  static async playBranchingVideo(branchingId, userId) {
    try {
      console.log('=== Branching Video Interaction Example ===');
      
      // Start branching session
      const session = await branchingService.startBranchingSession(
        branchingId,
        userId,
        null,
        { deviceInfo: { type: 'web', browser: 'Chrome' } }
      );
      
      console.log('Branching session started:', {
        sessionId: session.sessionId,
        title: session.branchingVideo.title,
        currentPath: session.sessionData.currentPath
      });
      
      // Make first choice
      const choice1Result = await branchingService.recordUserChoice(
        session.sessionId,
        'choice1',
        'dramatic',
        {
          timestamp: 30,
          timeSpentDeciding: 8000 // 8 seconds
        }
      );
      
      console.log('First choice made:', {
        choice: choice1Result.choice.choiceMade,
        nextPath: choice1Result.nextState.path,
        nextDecisionPoint: choice1Result.nextState.nextDecisionPoint?.id
      });
      
      // Make second choice
      const choice2Result = await branchingService.recordUserChoice(
        session.sessionId,
        'choice2',
        'mystery',
        {
          timestamp: 120,
          timeSpentDeciding: 12000 // 12 seconds
        }
      );
      
      console.log('Second choice made:', {
        choice: choice2Result.choice.choiceMade,
        isCompleted: choice2Result.nextState.isCompleted,
        completionPercentage: choice2Result.sessionData.completionPercentage
      });
      
      // Get user choice history
      const choiceHistory = await branchingService.getUserChoiceHistory(userId, branchingId);
      console.log('User choice history:', choiceHistory.length, 'choices');
      
      return session.sessionId;
      
    } catch (error) {
      console.error('Branching video interaction example failed:', error.message);
      throw error;
    }
  }
}

/**
 * Editor Service Examples
 */
export class EditorServiceExamples {
  /**
   * Example: Video editing with markers
   */
  static async editVideoWithMarkers(videoId, userId) {
    try {
      console.log('=== Video Editor Example ===');
      
      // Create edit session
      const editSession = await editorService.createEditSession(
        videoId,
        userId,
        {
          name: 'Tutorial Edit Session',
          description: 'Editing a tutorial video',
          isCollaborative: false
        }
      );
      
      console.log('Edit session created:', {
        id: editSession._id,
        name: editSession.sessionName
      });
      
      // Add various types of markers
      const markers = [];
      
      // Scene markers
      markers.push(await editorService.addMarker(
        videoId,
        10.5,
        'Introduction Scene',
        'scene',
        userId,
        {
          description: 'Opening introduction',
          editSessionId: editSession._id
        }
      ));
      
      markers.push(await editorService.addMarker(
        videoId,
        45.2,
        'Main Content',
        'scene',
        userId,
        {
          description: 'Main tutorial content begins',
          editSessionId: editSession._id
        }
      ));
      
      // Chapter markers
      markers.push(await editorService.addMarker(
        videoId,
        120.0,
        'Chapter 1: Basics',
        'chapter',
        userId,
        {
          description: 'Introduction to basic concepts',
          editSessionId: editSession._id
        }
      ));
      
      // Bookmark markers
      markers.push(await editorService.addMarker(
        videoId,
        180.5,
        'Important Tip',
        'bookmark',
        userId,
        {
          description: 'Key learning point',
          editSessionId: editSession._id,
          tags: ['important', 'tip']
        }
      ));
      
      console.log('Added markers:', markers.length);
      
      // List all markers
      const allMarkers = await editorService.listMarkers(videoId, {
        sortBy: 'timestamp',
        sortOrder: 'asc'
      });
      
      console.log('All markers for video:');
      allMarkers.forEach((marker, index) => {
        console.log(`${index + 1}. [${marker.formattedTimestamp}] ${marker.markerType}: ${marker.label}`);
      });
      
      return editSession._id;
      
    } catch (error) {
      console.error('Video editor example failed:', error.message);
      throw error;
    }
  }

  /**
   * Example: Marker export and import
   */
  static async exportImportMarkers(videoId, userId) {
    try {
      console.log('=== Marker Export/Import Example ===');
      
      // Export markers in different formats
      const jsonExport = await editorService.exportMarkers(videoId, 'JSON');
      console.log('JSON export length:', jsonExport.length);
      
      const edlExport = await editorService.exportMarkers(videoId, 'EDL');
      console.log('EDL export preview:', edlExport.substring(0, 200) + '...');
      
      const csvExport = await editorService.exportMarkers(videoId, 'CSV');
      console.log('CSV export lines:', csvExport.split('\n').length);
      
      // Save to file
      const filePath = await editorService.exportMarkers(
        videoId,
        'JSON',
        { saveToFile: true }
      );
      console.log('Markers exported to file:', filePath);
      
      // Simulate importing markers (using JSON export)
      const importData = JSON.stringify({
        markers: [
          {
            timestamp: 250.0,
            label: 'Imported Marker',
            markerType: 'scene',
            description: 'This marker was imported'
          },
          {
            timestamp: 300.5,
            label: 'Another Import',
            markerType: 'bookmark',
            description: 'Second imported marker'
          }
        ]
      });
      
      const importedMarkers = await editorService.importMarkers(
        videoId,
        importData,
        'JSON',
        userId,
        { continueOnError: true }
      );
      
      console.log('Imported markers:', importedMarkers.length);
      
      return { jsonExport, importedMarkers };
      
    } catch (error) {
      console.error('Marker export/import example failed:', error.message);
      throw error;
    }
  }

  /**
   * Example: Auto-suggestions
   */
  static async generateEditSuggestions(videoId) {
    try {
      console.log('=== Edit Suggestions Example ===');
      
      // Generate edit suggestions
      const suggestions = await editorService.generateEditSuggestions(
        videoId,
        {
          detectScenes: true,
          analyzeAudio: true,
          detectMotion: true
        }
      );
      
      console.log('Generated suggestions:', suggestions.length);
      suggestions.forEach((suggestion, index) => {
        console.log(`${index + 1}. ${suggestion.type} at ${suggestion.timestamp}s: ${suggestion.label} (${suggestion.confidence})`);
      });
      
      // Apply high-confidence suggestions
      const appliedSuggestions = await editorService.applySuggestions(
        videoId,
        suggestions,
        'user123',
        { minConfidence: 0.8 }
      );
      
      console.log('Applied suggestions:', appliedSuggestions.length);
      
      return suggestions;
      
    } catch (error) {
      console.error('Edit suggestions example failed:', error.message);
      throw error;
    }
  }
}

/**
 * User Service Examples
 */
export class UserServiceExamples {
  /**
   * Example: User registration and authentication
   */
  static async userAuthFlow() {
    try {
      console.log('=== User Authentication Example ===');
      
      // Register new user
      const newUser = await userService.registerUser(
        {
          username: 'demouser123',
          email: 'demo@example.com',
          password: 'SecurePassword123!',
          firstName: 'Demo',
          lastName: 'User',
          displayName: 'Demo User'
        },
        {
          sendVerificationEmail: false, // Skip for demo
          ipAddress: '127.0.0.1',
          userAgent: 'Demo Client 1.0'
        }
      );
      
      console.log('User registered:', {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.displayName
      });
      
      // Authenticate user
      const authResult = await userService.authenticateUser(
        'demouser123',
        'SecurePassword123!',
        {
          ipAddress: '127.0.0.1',
          userAgent: 'Demo Client 1.0',
          requireEmailVerification: false
        }
      );
      
      console.log('User authenticated:', {
        userId: authResult.user._id,
        sessionId: authResult.session.sessionId,
        accessToken: authResult.accessToken.substring(0, 20) + '...'
      });
      
      // Validate session
      const sessionValidation = await userService.validateSession(
        authResult.session.sessionId,
        authResult.accessToken
      );
      
      console.log('Session validation:', {
        valid: sessionValidation.valid,
        userId: sessionValidation.userId
      });
      
      return authResult;
      
    } catch (error) {
      console.error('User auth example failed:', error.message);
      throw error;
    }
  }

  /**
   * Example: User profile and preferences
   */
  static async userProfileManagement(userId) {
    try {
      console.log('=== User Profile Management Example ===');
      
      // Update user profile
      const updatedProfile = await userService.updateUserProfile(
        userId,
        {
          displayName: 'Updated Demo User',
          bio: 'I love watching videos and exploring new content!',
          preferences: {
            theme: 'light',
            language: 'en',
            autoplay: false,
            notifications: {
              email: true,
              push: true,
              marketing: false
            }
          }
        }
      );
      
      console.log('Profile updated:', {
        displayName: updatedProfile.displayName,
        bio: updatedProfile.bio,
        theme: updatedProfile.preferences.theme
      });
      
      // Get user statistics
      const userStats = await userService.getUserStatistics(userId);
      
      console.log('User statistics:', {
        totalWatchTime: userStats.watchStats.formattedWatchTime,
        totalVideos: userStats.watchStats.totalVideos,
        completionRate: userStats.watchStats.completionRate,
        achievements: userStats.achievements.length
      });
      
      return updatedProfile;
      
    } catch (error) {
      console.error('User profile management example failed:', error.message);
      throw error;
    }
  }

  /**
   * Example: Watch history tracking
   */
  static async trackWatchHistory(userId, videoId) {
    try {
      console.log('=== Watch History Tracking Example ===');
      
      // Track video views with different progress
      const viewRecords = [];
      
      // Initial view
      viewRecords.push(await userService.trackVideoView(
        userId,
        videoId,
        {
          watchTime: 30,
          totalDuration: 600,
          lastPosition: 30,
          completed: false,
          quality: '720p',
          deviceType: 'desktop',
          sessionId: 'session1'
        }
      ));
      
      // Progress update
      viewRecords.push(await userService.trackVideoView(
        userId,
        videoId,
        {
          watchTime: 120,
          totalDuration: 600,
          lastPosition: 120,
          completed: false,
          quality: '720p',
          deviceType: 'desktop',
          sessionId: 'session1'
        }
      ));
      
      // Completion
      viewRecords.push(await userService.trackVideoView(
        userId,
        videoId,
        {
          watchTime: 580,
          totalDuration: 600,
          lastPosition: 600,
          completed: true,
          quality: '720p',
          deviceType: 'desktop',
          sessionId: 'session1'
        }
      ));
      
      console.log('View tracking completed:', viewRecords.length, 'updates');
      
      // Get watch history
      const watchHistory = await userService.getUserWatchHistory(
        userId,
        { page: 1, limit: 10 }
      );
      
      console.log('Watch history:', {
        total: watchHistory.pagination.total,
        entries: watchHistory.history.length
      });
      
      watchHistory.history.forEach((entry, index) => {
        console.log(`${index + 1}. ${entry.video?.title}: ${entry.watchProgress}% complete`);
      });
      
      return watchHistory;
      
    } catch (error) {
      console.error('Watch history tracking example failed:', error.message);
      throw error;
    }
  }
}

/**
 * Integration Examples - Demonstrating how services work together
 */
export class IntegrationExamples {
  /**
   * Example: Complete video workflow from upload to interactive viewing
   */
  static async completeVideoWorkflow() {
    try {
      console.log('\n=== COMPLETE VIDEO WORKFLOW EXAMPLE ===\n');
      
      // 1. User registration and authentication
      console.log('Step 1: User Authentication');
      const authResult = await UserServiceExamples.userAuthFlow();
      const userId = authResult.user._id;
      
      // 2. Video upload and processing
      console.log('\nStep 2: Video Upload');
      const videoId = await VideoServiceExamples.uploadAndProcessVideo();
      
      // 3. AI processing (transcription and analysis)
      console.log('\nStep 3: AI Processing');
      try {
        // Note: This would require actual audio file for real transcription
        console.log('AI processing skipped in demo (requires actual audio file)');
        // const aiResults = await AIServiceExamples.generateSummaries(videoId);
      } catch (error) {
        console.log('AI processing skipped:', error.message);
      }
      
      // 4. Video editing with markers
      console.log('\nStep 4: Video Editing');
      const editSessionId = await EditorServiceExamples.editVideoWithMarkers(videoId, userId);
      
      // 5. Create branching video
      console.log('\nStep 5: Branching Video Creation');
      const branchingId = await BranchingServiceExamples.createBranchingVideo(videoId, userId);
      
      // 6. Sync session for collaborative viewing
      console.log('\nStep 6: Sync Session');
      const syncSessionId = await SyncServiceExamples.createSyncSession(videoId, userId);
      
      // 7. Track viewing activity
      console.log('\nStep 7: Watch History');
      const watchHistory = await UserServiceExamples.trackWatchHistory(userId, videoId);
      
      // 8. Export markers
      console.log('\nStep 8: Marker Export');
      const exportResult = await EditorServiceExamples.exportImportMarkers(videoId, userId);
      
      console.log('\n=== WORKFLOW COMPLETED SUCCESSFULLY ===');
      console.log('Summary:', {
        userId,
        videoId,
        editSessionId,
        branchingId,
        syncSessionId,
        watchHistoryEntries: watchHistory.pagination.total
      });
      
      return {
        userId,
        videoId,
        editSessionId,
        branchingId,
        syncSessionId,
        authResult,
        watchHistory,
        exportResult
      };
      
    } catch (error) {
      console.error('Complete workflow example failed:', error.message);
      throw error;
    }
  }

  /**
   * Example: Real-time collaborative editing session
   */
  static async collaborativeEditingSession() {
    try {
      console.log('\n=== COLLABORATIVE EDITING EXAMPLE ===\n');
      
      // Setup users
      const host = await UserServiceExamples.userAuthFlow();
      const videoId = await VideoServiceExamples.uploadAndProcessVideo();
      
      // Create collaborative edit session
      const editSession = await editorService.createEditSession(
        videoId,
        host.user._id,
        {
          name: 'Collaborative Edit',
          isCollaborative: true,
          invitedUsers: ['user456', 'user789']
        }
      );
      
      // Create sync session for real-time collaboration
      const syncSession = await syncService.createSession(
        videoId,
        'Collaborative Editing Session',
        host.user._id,
        {
          allowParticipantControl: true,
          maxParticipants: 5
        }
      );
      
      // Simulate collaborative marker adding
      const collaborativeMarkers = [];
      
      // Host adds markers
      collaborativeMarkers.push(await editorService.addMarker(
        videoId,
        60,
        'Host Marker 1',
        'scene',
        host.user._id,
        { editSessionId: editSession._id }
      ));
      
      // Simulate other users joining and adding markers
      // (In real implementation, these would be separate user sessions)
      collaborativeMarkers.push(await editorService.addMarker(
        videoId,
        120,
        'Collaborative Marker',
        'bookmark',
        host.user._id, // Using host ID for demo
        { 
          editSessionId: editSession._id,
          description: 'Added by collaborator'
        }
      ));
      
      // Update sync session with marker events
      await syncService.updatePlaybackState(
        syncSession._id,
        {
          timestamp: 60,
          isPlaying: false,
          playbackRate: 1.0,
          eventType: 'marker_added'
        },
        host.user._id
      );
      
      console.log('Collaborative session created:', {
        editSessionId: editSession._id,
        syncSessionId: syncSession._id,
        markersAdded: collaborativeMarkers.length
      });
      
      return {
        editSession,
        syncSession,
        collaborativeMarkers
      };
      
    } catch (error) {
      console.error('Collaborative editing example failed:', error.message);
      throw error;
    }
  }

  /**
   * Example: AI-enhanced video analysis pipeline
   */
  static async aiEnhancedAnalysis(videoId) {
    try {
      console.log('\n=== AI-ENHANCED ANALYSIS EXAMPLE ===\n');
      
      // This example shows how AI services integrate with other services
      // Note: Requires actual video file and API keys for full functionality
      
      console.log('AI-enhanced analysis would include:');
      console.log('1. Automatic transcription');
      console.log('2. Content summarization');
      console.log('3. Chapter generation');
      console.log('4. Scene detection');
      console.log('5. Auto-marker creation');
      console.log('6. Branching point suggestions');
      
      // Simulate AI workflow
      const analysisResults = {
        transcription: { status: 'would_process', estimatedTime: '2-5 minutes' },
        summarization: { status: 'would_process', estimatedTime: '30 seconds' },
        chapters: { status: 'would_process', estimatedTime: '1 minute' },
        sceneDetection: { status: 'would_process', estimatedTime: '3-10 minutes' },
        autoMarkers: { status: 'would_generate', estimated: '10-20 markers' },
        branchingSuggestions: { status: 'would_suggest', estimated: '3-5 decision points' }
      };
      
      console.log('Analysis pipeline results:', analysisResults);
      
      return analysisResults;
      
    } catch (error) {
      console.error('AI-enhanced analysis example failed:', error.message);
      throw error;
    }
  }
}

/**
 * Performance and Monitoring Examples
 */
export class MonitoringExamples {
  /**
   * Example: Service health monitoring
   */
  static async serviceHealthCheck() {
    try {
      console.log('\n=== SERVICE HEALTH MONITORING ===\n');
      
      // Get health status from service manager
      const { serviceManager } = await import('./index.js');
      const healthStatus = serviceManager.getHealthStatus();
      
      console.log('Overall system health:', healthStatus.overall);
      console.log('Service status:');
      
      for (const [serviceName, status] of Object.entries(healthStatus.services)) {
        console.log(`- ${serviceName}: ${status.status}`);
        if (status.stats) {
          const stats = Object.entries(status.stats)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
          console.log(`  Stats: ${stats}`);
        }
      }
      
      // Get aggregated statistics
      const aggregatedStats = serviceManager.getAggregatedStats();
      console.log('\nAggregated Statistics:');
      
      for (const [serviceName, stats] of Object.entries(aggregatedStats.services)) {
        if (!stats.error) {
          console.log(`${serviceName}:`, stats);
        }
      }
      
      return { healthStatus, aggregatedStats };
      
    } catch (error) {
      console.error('Service health check failed:', error.message);
      throw error;
    }
  }

  /**
   * Example: Performance benchmarking
   */
  static async performanceBenchmark() {
    try {
      console.log('\n=== PERFORMANCE BENCHMARK ===\n');
      
      const benchmarks = {};
      
      // Benchmark video operations
      console.log('Benchmarking video operations...');
      const videoStart = Date.now();
      
      try {
        const videoId = await VideoServiceExamples.uploadAndProcessVideo();
        benchmarks.videoUpload = Date.now() - videoStart;
        console.log(`Video upload: ${benchmarks.videoUpload}ms`);
        
        // Benchmark marker operations
        const markerStart = Date.now();
        await EditorServiceExamples.editVideoWithMarkers(videoId, 'benchmark-user');
        benchmarks.markerOperations = Date.now() - markerStart;
        console.log(`Marker operations: ${benchmarks.markerOperations}ms`);
        
        // Benchmark sync operations
        const syncStart = Date.now();
        await SyncServiceExamples.createSyncSession(videoId, 'benchmark-user');
        benchmarks.syncOperations = Date.now() - syncStart;
        console.log(`Sync operations: ${benchmarks.syncOperations}ms`);
        
      } catch (error) {
        console.log('Benchmark error:', error.message);
      }
      
      // Service response times
      console.log('\nService response time analysis:');
      const responseTimes = {};
      
      for (const serviceName of ['video', 'sync', 'editor', 'user']) {
        const start = Date.now();
        try {
          // Call a lightweight method if available
          const service = services[serviceName];
          if (service.getServiceStats) {
            service.getServiceStats();
          }
          responseTimes[serviceName] = Date.now() - start;
        } catch (error) {
          responseTimes[serviceName] = 'error';
        }
      }
      
      console.log('Response times:', responseTimes);
      
      return { benchmarks, responseTimes };
      
    } catch (error) {
      console.error('Performance benchmark failed:', error.message);
      throw error;
    }
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  try {
    console.log('='.repeat(60));
    console.log('VIDEO PLAYER SERVICES - COMPREHENSIVE EXAMPLES');
    console.log('='.repeat(60));
    
    // Run integration examples
    const workflowResult = await IntegrationExamples.completeVideoWorkflow();
    
    // Run monitoring examples
    const healthCheck = await MonitoringExamples.serviceHealthCheck();
    const benchmark = await MonitoringExamples.performanceBenchmark();
    
    // Run collaborative example
    const collaborative = await IntegrationExamples.collaborativeEditingSession();
    
    console.log('\n' + '='.repeat(60));
    console.log('ALL EXAMPLES COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    
    return {
      workflow: workflowResult,
      health: healthCheck,
      benchmark,
      collaborative
    };
    
  } catch (error) {
    console.error('Examples execution failed:', error.message);
    logger.error('Examples execution failed:', error);
    throw error;
  }
}

// Export all example classes
export default {
  VideoServiceExamples,
  SyncServiceExamples,
  AIServiceExamples,
  BranchingServiceExamples,
  EditorServiceExamples,
  UserServiceExamples,
  IntegrationExamples,
  MonitoringExamples,
  runAllExamples
};
