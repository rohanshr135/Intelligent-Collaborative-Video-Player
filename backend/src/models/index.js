// Main model exports for the Video Player application
export { User } from './User.js';
export { Video } from './Video.js';
export { VideoTranscript } from './VideoTranscript.js';
export { SyncSession } from './SyncSession.js';
export { SyncParticipant } from './SyncParticipant.js';
export { BranchingVideo } from './BranchingVideo.js';
export { DecisionPoint } from './DecisionPoint.js';
export { UserChoice } from './UserChoice.js';
export { ViewHistory } from './ViewHistory.js';
export { SceneMarker } from './SceneMarker.js';
export { AISummary } from './AISummary.js';
export { SyncRoom } from './SyncRoom.js';

// Import models for the collections object
import { User } from './User.js';
import { Video } from './Video.js';
import { VideoTranscript } from './VideoTranscript.js';
import { SyncSession } from './SyncSession.js';
import { SyncParticipant } from './SyncParticipant.js';
import { BranchingVideo } from './BranchingVideo.js';
import { DecisionPoint } from './DecisionPoint.js';
import { UserChoice } from './UserChoice.js';
import { ViewHistory } from './ViewHistory.js';
import { SceneMarker } from './SceneMarker.js';
import { AISummary } from './AISummary.js';
import { SyncRoom } from './SyncRoom.js';

// Model collections for batch operations
export const models = {
  User,
  Video,
  VideoTranscript,
  SyncSession,
  SyncParticipant,
  BranchingVideo,
  DecisionPoint,
  UserChoice,
  ViewHistory,
  SceneMarker,
  AISummary,
  SyncRoom
};

// Model names for dynamic access
export const modelNames = [
  'User',
  'Video',
  'VideoTranscript',
  'SyncSession',
  'SyncParticipant',
  'BranchingVideo',
  'DecisionPoint',
  'UserChoice',
  'ViewHistory',
  'SceneMarker',
  'AISummary',
  'SyncRoom'
];

// Helper function to get model by name
export function getModel(modelName) {
  return models[modelName];
}

// Helper function to initialize all models (useful for testing)
export async function initializeModels() {
  const initialized = {};
  
  for (const [name, model] of Object.entries(models)) {
    try {
      // Ensure indexes are created
      await model.ensureIndexes();
      initialized[name] = true;
    } catch (error) {
      console.error(`Failed to initialize ${name} model:`, error);
      initialized[name] = false;
    }
  }
  
  return initialized;
}

// Helper function to get all model statistics
export async function getModelStatistics() {
  const stats = {};
  
  for (const [name, model] of Object.entries(models)) {
    try {
      const count = await model.countDocuments();
      const indexes = await model.collection.getIndexes();
      
      stats[name] = {
        documentCount: count,
        indexCount: Object.keys(indexes).length,
        collectionName: model.collection.name
      };
    } catch (error) {
      stats[name] = {
        error: error.message
      };
    }
  }
  
  return stats;
}
