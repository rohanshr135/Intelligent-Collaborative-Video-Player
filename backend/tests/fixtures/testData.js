export const testUsers = {
  validUser: {
    username: 'testuser',
    email: 'test@example.com',
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User',
    acceptTerms: true
  },
  
  invalidUser: {
    username: 'tu', // too short
    email: 'invalid-email',
    password: '123', // too weak
    firstName: '',
    lastName: '',
    acceptTerms: false
  },
  
  adminUser: {
    username: 'admin',
    email: 'admin@example.com',
    password: 'AdminPassword123!',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    acceptTerms: true
  }
};

export const testVideos = {
  validVideo: {
    title: 'Test Video',
    description: 'A test video for testing purposes',
    tags: ['test', 'video'],
    category: 'education',
    isPrivate: false,
    allowDownload: true,
    metadata: {
      duration: 120,
      resolution: '1080p',
      fileSize: 50000000,
      format: 'mp4'
    }
  },
  
  invalidVideo: {
    title: '', // empty title
    description: 'A'.repeat(2001), // too long
    tags: Array(25).fill('tag'), // too many tags
    metadata: {
      duration: -10, // negative duration
      fileSize: 0
    }
  }
};

export const testSyncSessions = {
  validSession: {
    name: 'Test Sync Session',
    description: 'A test sync session',
    isPrivate: false,
    maxParticipants: 5,
    settings: {
      allowControl: 'host',
      allowChat: true,
      autoSync: true,
      syncDelay: 100
    }
  },
  
  invalidSession: {
    name: '', // empty name
    maxParticipants: 1, // too few
    settings: {
      syncDelay: 10000 // too high
    }
  }
};

export const testBranchingVideos = {
  validBranching: {
    title: 'Interactive Test Video',
    description: 'A test branching video',
    isPublic: true,
    decisionPoints: [
      {
        timestamp: 30,
        title: 'Choose your path',
        description: 'Select an option',
        choices: [
          {
            text: 'Option A',
            description: 'Go left',
            nextTimestamp: 45,
            conditions: {}
          },
          {
            text: 'Option B',
            description: 'Go right',
            nextTimestamp: 60,
            conditions: {}
          }
        ]
      }
    ]
  }
};

export const testSceneMarkers = {
  validMarker: {
    timestamp: 30.5,
    type: 'scene',
    title: 'Scene 1',
    description: 'First scene marker',
    metadata: {
      color: '#ff0000',
      category: 'intro'
    }
  },
  
  invalidMarker: {
    timestamp: -5, // negative timestamp
    type: 'invalid-type',
    title: '', // empty title
    metadata: {}
  }
};

export const mockFiles = {
  validVideoFile: {
    originalname: 'test-video.mp4',
    mimetype: 'video/mp4',
    size: 10000000,
    buffer: Buffer.from('fake video data')
  },
  
  invalidVideoFile: {
    originalname: 'test-file.txt',
    mimetype: 'text/plain',
    size: 200000000, // too large
    buffer: Buffer.from('not a video')
  }
};
