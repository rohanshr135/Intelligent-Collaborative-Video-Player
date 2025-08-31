#!/usr/bin/env node

/**
 * Test script for Video Sync functionality
 * Run with: node test-video-sync.js
 */

import mongoose from 'mongoose';
import { SyncRoom } from './src/models/SyncRoom.js';
import logger from './src/utils/logger.js';

// Test configuration
const TEST_CONFIG = {
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/video_sync_test',
  testHostId: 'test_host_123',
  testParticipantId: 'test_participant_456'
};

/**
 * Initialize database connection
 */
async function connectDB() {
  try {
    await mongoose.connect(TEST_CONFIG.mongoUri);
    logger.info('✅ Connected to MongoDB');
  } catch (error) {
    logger.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

/**
 * Clean up test data
 */
async function cleanup() {
  try {
    await SyncRoom.deleteMany({});
    logger.info('🧹 Test data cleaned up');
  } catch (error) {
    logger.error('❌ Failed to cleanup test data:', error);
  }
}

/**
 * Test 1: Create a video room
 */
async function testCreateRoom() {
  logger.info('\n🧪 Test 1: Creating video room...');
  
  try {
    const roomData = {
      code: 'TEST12',
      hostId: TEST_CONFIG.testHostId,
      video: {
        title: 'Test Video',
        duration: 120, // 2 minutes
        fileSize: 1024 * 1024, // 1MB
        mimeType: 'video/mp4',
        resolution: '1920x1080',
        uploadedBy: TEST_CONFIG.testHostId,
        uploadedAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
        isTemporary: true
      },
      currentState: {
        t: 0,
        paused: true,
        rate: 1,
        videoUrl: '/api/videos/test123/stream',
        videoHash: 'test123',
        lastUpdatedBy: TEST_CONFIG.testHostId,
        lastUpdatedAt: new Date()
      },
      participants: [{
        userId: TEST_CONFIG.testHostId,
        isHost: true,
        canControl: true,
        lastSeen: new Date(),
        lastSync: new Date()
      }],
      controllers: [TEST_CONFIG.testHostId],
      settings: {
        allowControl: 'host',
        maxParticipants: 5,
        autoSync: true,
        lagCompensation: true
      },
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      status: 'active'
    };

    const room = await SyncRoom.create(roomData);
    logger.info('✅ Room created successfully:', {
      code: room.code,
      hostId: room.hostId,
      videoTitle: room.video.title,
      participants: room.participants.length
    });

    return room;
  } catch (error) {
    logger.error('❌ Failed to create room:', error);
    throw error;
  }
}

/**
 * Test 2: Join room as participant
 */
async function testJoinRoom(room) {
  logger.info('\n🧪 Test 2: Joining room as participant...');
  
  try {
    // Simulate participant joining
    const now = new Date();
    const participant = {
      userId: TEST_CONFIG.testParticipantId,
      isHost: false,
      canControl: false,
      lastSeen: now,
      lastSync: now
    };

    room.participants.push(participant);
    await room.save();

    logger.info('✅ Participant joined successfully:', {
      participantId: participant.userId,
      totalParticipants: room.participants.length,
      canControl: participant.canControl
    });

    return room;
  } catch (error) {
    logger.error('❌ Failed to join room:', error);
    throw error;
  }
}

/**
 * Test 3: Update playback state
 */
async function testUpdateState(room) {
  logger.info('\n🧪 Test 3: Updating playback state...');
  
  try {
    // Simulate host updating playback state
    const newState = {
      t: 45.5,
      paused: false,
      rate: 1.0,
      lastUpdatedBy: TEST_CONFIG.testHostId,
      lastUpdatedAt: new Date()
    };

    room.currentState = { ...room.currentState, ...newState };
    await room.save();

    logger.info('✅ Playback state updated successfully:', {
      timestamp: room.currentState.t,
      paused: room.currentState.paused,
      rate: room.currentState.rate,
      updatedBy: room.currentState.lastUpdatedBy
    });

    return room;
  } catch (error) {
    logger.error('❌ Failed to update playback state:', error);
    throw error;
  }
}

/**
 * Test 4: Grant control to participant
 */
async function testGrantControl(room) {
  logger.info('\n🧪 Test 4: Granting control to participant...');
  
  try {
    // Grant control to participant
    room.controllers.push(TEST_CONFIG.testParticipantId);
    
    // Update participant permissions
    const participant = room.participants.find(p => p.userId === TEST_CONFIG.testParticipantId);
    if (participant) {
      participant.canControl = true;
    }
    
    await room.save();

    logger.info('✅ Control granted successfully:', {
      participantId: TEST_CONFIG.testParticipantId,
      controllers: room.controllers,
      participantCanControl: participant?.canControl
    });

    return room;
  } catch (error) {
    logger.error('❌ Failed to grant control:', error);
    throw error;
  }
}

/**
 * Test 5: Get room statistics
 */
async function testRoomStats(room) {
  logger.info('\n🧪 Test 5: Getting room statistics...');
  
  try {
    const now = new Date();
    const activeParticipants = room.participants.filter(p => (now - p.lastSeen) < 1000 * 60 * 5);
    
    const stats = {
      code: room.code,
      totalParticipants: room.participants.length,
      activeParticipants: activeParticipants.length,
      roomAge: Math.floor((now - room.createdAt) / 1000 / 60),
      timeUntilExpiry: Math.floor((room.expiresAt - now) / 1000 / 60),
      videoDuration: room.video?.duration || 0,
      currentPlaybackTime: room.currentState?.t || 0,
      isExpired: now > room.expiresAt,
      status: room.status
    };

    logger.info('✅ Room statistics retrieved:', stats);
    return stats;
  } catch (error) {
    logger.error('❌ Failed to get room statistics:', error);
    throw error;
  }
}

/**
 * Test 6: Test room expiration
 */
async function testRoomExpiration() {
  logger.info('\n🧪 Test 6: Testing room expiration...');
  
  try {
    // Create a room that expires in 1 second
    const expiringRoom = await SyncRoom.create({
      code: 'EXP123',
      hostId: TEST_CONFIG.testHostId,
      video: {
        title: 'Expiring Video',
        duration: 60,
        uploadedBy: TEST_CONFIG.testHostId,
        uploadedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000), // 1 second
        isTemporary: true
      },
      currentState: { t: 0, paused: true, rate: 1 },
      participants: [],
      controllers: [TEST_CONFIG.testHostId],
      settings: { allowControl: 'host', maxParticipants: 5, autoSync: true, lagCompensation: true },
      expiresAt: new Date(Date.now() + 1000),
      status: 'active'
    });

    logger.info('✅ Expiring room created:', { code: expiringRoom.code, expiresAt: expiringRoom.expiresAt });

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if room is expired
    const expiredRoom = await SyncRoom.findOne({ code: 'EXP123' });
    if (expiredRoom) {
      logger.info('ℹ️ Room still exists (TTL cleanup may be delayed):', { status: expiredRoom.status });
    } else {
      logger.info('✅ Room automatically expired and cleaned up');
    }

    return expiringRoom;
  } catch (error) {
    logger.error('❌ Failed to test room expiration:', error);
    throw error;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  try {
    logger.info('🚀 Starting Video Sync Tests...\n');
    
    // Test 1: Create room
    const room = await testCreateRoom();
    
    // Test 2: Join room
    const joinedRoom = await testJoinRoom(room);
    
    // Test 3: Update state
    const updatedRoom = await testUpdateState(joinedRoom);
    
    // Test 4: Grant control
    const controlledRoom = await testGrantControl(updatedRoom);
    
    // Test 5: Get stats
    await testRoomStats(controlledRoom);
    
    // Test 6: Test expiration
    await testRoomExpiration();
    
    logger.info('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    logger.error('\n💥 Test suite failed:', error);
    process.exit(1);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    await connectDB();
    await cleanup();
    await runTests();
    
    logger.info('\n✨ Test suite completed. Cleaning up...');
    await cleanup();
    
    process.exit(0);
  } catch (error) {
    logger.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
