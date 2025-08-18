/**
 * Services Index - Centralized exports for all service modules
 * Provides easy importing of all services across the application
 */

import videoService from './videoService.js';
import syncService from './syncService.js';
import aiService from './aiService.js';
import branchingService from './branchingService.js';
import editorService from './editorService.js';
import userService from './userService.js';

// Export individual services
export {
  videoService,
  syncService,
  aiService,
  branchingService,
  editorService,
  userService
};

// Export as default object for convenience
export default {
  video: videoService,
  sync: syncService,
  ai: aiService,
  branching: branchingService,
  editor: editorService,
  user: userService
};

/**
 * Service initialization and health check utilities
 */
export class ServiceManager {
  constructor() {
    this.services = {
      video: videoService,
      sync: syncService,
      ai: aiService,
      branching: branchingService,
      editor: editorService,
      user: userService
    };
  }

  /**
   * Get health status of all services
   * @returns {Object} health status
   */
  getHealthStatus() {
    const status = {
      timestamp: new Date().toISOString(),
      services: {},
      overall: 'healthy'
    };

    for (const [name, service] of Object.entries(this.services)) {
      try {
        const serviceStats = service.getServiceStats ? service.getServiceStats() : {};
        status.services[name] = {
          status: 'healthy',
          stats: serviceStats,
          lastChecked: new Date().toISOString()
        };
      } catch (error) {
        status.services[name] = {
          status: 'unhealthy',
          error: error.message,
          lastChecked: new Date().toISOString()
        };
        status.overall = 'degraded';
      }
    }

    return status;
  }

  /**
   * Get aggregated statistics from all services
   * @returns {Object} aggregated stats
   */
  getAggregatedStats() {
    const stats = {
      timestamp: new Date().toISOString(),
      services: {}
    };

    for (const [name, service] of Object.entries(this.services)) {
      try {
        if (service.getServiceStats) {
          stats.services[name] = service.getServiceStats();
        }
      } catch (error) {
        stats.services[name] = { error: error.message };
      }
    }

    return stats;
  }

  /**
   * Initialize all services (if they have init methods)
   * @returns {Promise<Object>} initialization results
   */
  async initializeServices() {
    const results = {
      timestamp: new Date().toISOString(),
      services: {},
      errors: []
    };

    for (const [name, service] of Object.entries(this.services)) {
      try {
        if (service.initialize && typeof service.initialize === 'function') {
          await service.initialize();
          results.services[name] = { status: 'initialized' };
        } else {
          results.services[name] = { status: 'no_init_required' };
        }
      } catch (error) {
        results.services[name] = { 
          status: 'failed', 
          error: error.message 
        };
        results.errors.push({
          service: name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Shutdown all services gracefully
   * @returns {Promise<Object>} shutdown results
   */
  async shutdownServices() {
    const results = {
      timestamp: new Date().toISOString(),
      services: {},
      errors: []
    };

    for (const [name, service] of Object.entries(this.services)) {
      try {
        if (service.shutdown && typeof service.shutdown === 'function') {
          await service.shutdown();
          results.services[name] = { status: 'shutdown' };
        } else {
          results.services[name] = { status: 'no_shutdown_required' };
        }
      } catch (error) {
        results.services[name] = { 
          status: 'failed', 
          error: error.message 
        };
        results.errors.push({
          service: name,
          error: error.message
        });
      }
    }

    return results;
  }
}

// Create singleton service manager
export const serviceManager = new ServiceManager();
