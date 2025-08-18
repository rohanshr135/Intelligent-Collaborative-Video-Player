import { createClient } from 'redis';
import { config } from '../config/env.js';
import logger from './logger.js';

/**
 * Centralized Redis client factory
 * Implements singleton pattern to avoid multiple connections
 */
class RedisClientManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Get or create Redis client instance
   * @returns {Object} Redis client
   */
  async getClient() {
    if (!this.client) {
      this.client = createClient({
        url: config.redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              logger.error('Redis reconnection failed after 3 attempts');
              return false;
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('error', (err) => {
        logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        logger.warn('Redis client disconnected');
        this.isConnected = false;
      });

      try {
        if (!this.client.isOpen) {
          await this.client.connect();
        }
      } catch (error) {
        logger.error('Failed to connect to Redis:', error);
        // Don't throw error, allow app to continue without Redis
      }
    }

    return this.client;
  }

  /**
   * Check if Redis is available
   * @returns {boolean} Connection status
   */
  isAvailable() {
    return this.client && this.isConnected && this.client.isOpen;
  }

  /**
   * Close Redis connection
   */
  async disconnect() {
    if (this.client && this.client.isOpen) {
      await this.client.disconnect();
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Get Redis info for health checks
   * @returns {Object} Redis status info
   */
  async getInfo() {
    if (!this.isAvailable()) {
      return { connected: false, error: 'Redis not available' };
    }

    try {
      const info = await this.client.info();
      return {
        connected: true,
        info: info
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
const redisManager = new RedisClientManager();

export default redisManager;

/**
 * Helper function to get Redis client
 * @returns {Promise<Object>} Redis client
 */
export const getRedisClient = () => redisManager.getClient();

/**
 * Helper function to check Redis availability
 * @returns {boolean} Connection status
 */
export const isRedisAvailable = () => redisManager.isAvailable();
