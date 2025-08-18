import logger from './logger.js';

/**
 * Synchronization utility functions for video playback coordination
 * Handles lag calculation, playback rate adjustments, and sync decisions
 */
export class SyncUtils {
  constructor() {
    // Configuration constants
    this.MAX_PLAYBACK_RATE = 1.5;
    this.MIN_PLAYBACK_RATE = 0.5;
    this.DEFAULT_PLAYBACK_RATE = 1.0;
    this.SYNC_TOLERANCE_MS = 100;
    this.LAG_THRESHOLD_MS = 1000;
    this.SKIP_THRESHOLD_MS = 3000;
  }

  /**
   * Calculate lag offset in milliseconds between two timestamps
   * @param {number} referenceTime - master/host timestamp (in seconds)
   * @param {number} participantTime - client timestamp (in seconds)
   * @param {number} networkDelay - estimated network delay in ms
   * @returns {number} lag in milliseconds (positive = behind, negative = ahead)
   */
  calculateLagMs(referenceTime, participantTime, networkDelay = 0) {
    if (typeof referenceTime !== 'number' || typeof participantTime !== 'number') {
      throw new Error('Reference and participant times must be numbers');
    }

    // Convert to milliseconds and account for network delay
    const refMs = referenceTime * 1000;
    const partMs = participantTime * 1000;
    const lagMs = refMs - partMs - networkDelay;

    return Math.round(lagMs);
  }

  /**
   * Determine optimal playback rate adjustment based on lag offset
   * @param {number} lagMs - lag in milliseconds
   * @param {Object} options - adjustment options
   * @returns {number} playback rate (clamped between min and max)
   */
  playbackRateFromLag(lagMs, options = {}) {
    const {
      aggressiveness = 1.0, // How aggressive the adjustment should be (0.5-2.0)
      maxAdjustment = 0.5,  // Maximum rate adjustment from 1.0
      toleranceMs = this.SYNC_TOLERANCE_MS
    } = options;

    // No adjustment needed if within tolerance
    if (Math.abs(lagMs) <= toleranceMs) {
      return this.DEFAULT_PLAYBACK_RATE;
    }

    let rate = this.DEFAULT_PLAYBACK_RATE;

    if (lagMs > 0) {
      // Client is behind, increase playback rate
      const adjustment = Math.min(
        (lagMs / 1500) * maxAdjustment * aggressiveness,
        maxAdjustment
      );
      rate = this.DEFAULT_PLAYBACK_RATE + adjustment;
    } else {
      // Client is ahead, decrease playback rate
      const adjustment = Math.min(
        (Math.abs(lagMs) / 1500) * maxAdjustment * aggressiveness,
        maxAdjustment
      );
      rate = this.DEFAULT_PLAYBACK_RATE - adjustment;
    }

    // Clamp to acceptable range
    return Math.max(
      this.MIN_PLAYBACK_RATE,
      Math.min(this.MAX_PLAYBACK_RATE, rate)
    );
  }

  /**
   * Determine if fast-forward skipping should occur based on lag and content analysis
   * @param {number} lagMs - current lag in milliseconds
   * @param {Array} silenceIntervals - array of [startMs, endMs] for silent segments
   * @param {Array} sceneChanges - array of timestamps where scene changes occur
   * @param {number} currentTimeMs - current playback time in milliseconds
   * @returns {Object} skip decision with target time
   */
  shouldSkipLag(lagMs, silenceIntervals = [], sceneChanges = [], currentTimeMs = 0) {
    // Don't skip if lag is not significant
    if (lagMs <= this.SKIP_THRESHOLD_MS) {
      return { shouldSkip: false, targetTime: null, reason: 'lag_too_small' };
    }

    // Check if currently in a silence interval
    const inSilence = silenceIntervals.some(([start, end]) => 
      currentTimeMs >= start && currentTimeMs <= end
    );

    if (inSilence) {
      // Find the end of current silence interval
      const currentSilence = silenceIntervals.find(([start, end]) => 
        currentTimeMs >= start && currentTimeMs <= end
      );
      
      if (currentSilence) {
        const silenceEndMs = currentSilence[1];
        const skipTargetMs = Math.min(currentTimeMs + lagMs, silenceEndMs);
        
        return {
          shouldSkip: true,
          targetTime: skipTargetMs / 1000, // Convert back to seconds
          reason: 'silence_detected',
          silenceEnd: silenceEndMs / 1000
        };
      }
    }

    // Check for scene changes - prefer to skip to scene boundaries
    if (sceneChanges.length > 0) {
      const futureScenes = sceneChanges.filter(time => time > currentTimeMs);
      
      if (futureScenes.length > 0) {
        const nextSceneMs = futureScenes[0];
        const targetTimeMs = currentTimeMs + lagMs;
        
        // If the target skip time is close to a scene change, skip to the scene
        if (Math.abs(targetTimeMs - nextSceneMs) <= 2000) {
          return {
            shouldSkip: true,
            targetTime: nextSceneMs / 1000,
            reason: 'scene_boundary',
            sceneTime: nextSceneMs / 1000
          };
        }
      }
    }

    // Default skip if lag is extreme (> 10 seconds)
    if (lagMs > 10000) {
      return {
        shouldSkip: true,
        targetTime: (currentTimeMs + lagMs) / 1000,
        reason: 'extreme_lag'
      };
    }

    return { shouldSkip: false, targetTime: null, reason: 'no_safe_skip_point' };
  }

  /**
   * Calculate network round-trip time and estimate one-way delay
   * @param {number} clientTimestamp - when client sent the message
   * @param {number} serverTimestamp - when server received the message
   * @param {number} responseTimestamp - when server sent the response
   * @returns {Object} network timing information
   */
  calculateNetworkDelay(clientTimestamp, serverTimestamp, responseTimestamp = Date.now()) {
    const roundTripTime = responseTimestamp - clientTimestamp;
    const serverProcessingTime = responseTimestamp - serverTimestamp;
    const networkTime = roundTripTime - serverProcessingTime;
    const estimatedOneWayDelay = networkTime / 2;

    return {
      roundTripTime,
      serverProcessingTime,
      networkTime,
      estimatedOneWayDelay,
      quality: this.getNetworkQuality(estimatedOneWayDelay)
    };
  }

  /**
   * Classify network quality based on delay
   * @param {number} delayMs - one-way network delay in milliseconds
   * @returns {string} quality classification
   */
  getNetworkQuality(delayMs) {
    if (delayMs <= 50) return 'excellent';
    if (delayMs <= 100) return 'good';
    if (delayMs <= 200) return 'fair';
    if (delayMs <= 500) return 'poor';
    return 'very_poor';
  }

  /**
   * Generate sync strategy based on current conditions
   * @param {Object} syncState - current synchronization state
   * @returns {Object} recommended sync strategy
   */
  generateSyncStrategy(syncState) {
    const {
      lagMs,
      networkDelay,
      bufferHealth,
      playbackRate,
      consecutiveLagEvents = 0,
      isPlaying = true
    } = syncState;

    const strategy = {
      action: 'maintain',
      playbackRate: this.DEFAULT_PLAYBACK_RATE,
      seekTo: null,
      priority: 'normal',
      reason: 'in_sync'
    };

    // Determine sync action based on lag severity
    if (Math.abs(lagMs) <= this.SYNC_TOLERANCE_MS) {
      // In sync - maintain current state
      strategy.action = 'maintain';
      strategy.playbackRate = this.DEFAULT_PLAYBACK_RATE;
    } else if (Math.abs(lagMs) <= this.LAG_THRESHOLD_MS) {
      // Minor lag - adjust playback rate
      strategy.action = 'adjust_rate';
      strategy.playbackRate = this.playbackRateFromLag(lagMs);
      strategy.reason = 'minor_lag_adjustment';
    } else if (Math.abs(lagMs) <= this.SKIP_THRESHOLD_MS) {
      // Moderate lag - more aggressive rate adjustment
      strategy.action = 'adjust_rate';
      strategy.playbackRate = this.playbackRateFromLag(lagMs, { aggressiveness: 1.5 });
      strategy.priority = 'high';
      strategy.reason = 'moderate_lag_adjustment';
    } else {
      // Major lag - consider seeking
      strategy.action = 'seek';
      strategy.seekTo = syncState.referenceTime;
      strategy.priority = 'critical';
      strategy.reason = 'major_lag_correction';
    }

    // Adjust strategy based on buffer health
    if (bufferHealth < 0.3) {
      strategy.priority = 'low';
      strategy.reason += '_low_buffer';
    }

    // Consider network conditions
    if (networkDelay > 200) {
      // High latency - be more conservative
      if (strategy.action === 'adjust_rate') {
        strategy.playbackRate = this.DEFAULT_PLAYBACK_RATE + 
          (strategy.playbackRate - this.DEFAULT_PLAYBACK_RATE) * 0.5;
      }
      strategy.reason += '_high_latency';
    }

    // Handle consecutive lag events
    if (consecutiveLagEvents > 3) {
      strategy.action = 'seek';
      strategy.priority = 'critical';
      strategy.reason = 'persistent_lag';
    }

    return strategy;
  }

  /**
   * Calculate buffer health score based on current buffer state
   * @param {number} bufferedSeconds - amount of content buffered
   * @param {number} playbackRate - current playback rate
   * @param {number} targetBuffer - target buffer size in seconds
   * @returns {number} buffer health score (0-1)
   */
  calculateBufferHealth(bufferedSeconds, playbackRate = 1.0, targetBuffer = 10) {
    if (bufferedSeconds <= 0) return 0;
    
    // Adjust for playback rate - faster playback drains buffer quicker
    const effectiveBuffer = bufferedSeconds / playbackRate;
    const health = Math.min(effectiveBuffer / targetBuffer, 1.0);
    
    return Math.max(0, health);
  }

  /**
   * Determine optimal sync interval based on conditions
   * @param {Object} conditions - current sync conditions
   * @returns {number} recommended sync interval in milliseconds
   */
  getOptimalSyncInterval(conditions = {}) {
    const {
      lagMs = 0,
      networkQuality = 'good',
      participantCount = 1,
      isPlaying = true
    } = conditions;

    let interval = 5000; // Base interval of 5 seconds

    // Adjust based on lag severity
    if (Math.abs(lagMs) > this.SKIP_THRESHOLD_MS) {
      interval = 1000; // High frequency for major issues
    } else if (Math.abs(lagMs) > this.LAG_THRESHOLD_MS) {
      interval = 2000; // Medium frequency for moderate issues
    } else if (Math.abs(lagMs) > this.SYNC_TOLERANCE_MS) {
      interval = 3000; // Slightly higher frequency for minor issues
    }

    // Adjust based on network quality
    switch (networkQuality) {
      case 'excellent':
        interval *= 0.8;
        break;
      case 'poor':
      case 'very_poor':
        interval *= 1.5;
        break;
    }

    // Adjust based on participant count (more participants = less frequent sync)
    if (participantCount > 10) {
      interval *= 1.3;
    } else if (participantCount > 5) {
      interval *= 1.1;
    }

    // Reduce frequency when paused
    if (!isPlaying) {
      interval *= 2;
    }

    return Math.max(1000, Math.min(10000, Math.round(interval)));
  }

  /**
   * Smooth playback rate transitions to avoid jarring changes
   * @param {number} currentRate - current playback rate
   * @param {number} targetRate - desired playback rate
   * @param {number} maxStep - maximum rate change per step
   * @returns {number} next playback rate step
   */
  smoothRateTransition(currentRate, targetRate, maxStep = 0.1) {
    const diff = targetRate - currentRate;
    
    if (Math.abs(diff) <= maxStep) {
      return targetRate;
    }
    
    return currentRate + Math.sign(diff) * maxStep;
  }

  /**
   * Log sync event for debugging and analytics
   * @param {string} eventType - type of sync event
   * @param {Object} data - event data
   */
  logSyncEvent(eventType, data) {
    logger.info('Sync event:', {
      type: eventType,
      timestamp: Date.now(),
      ...data
    });
  }
}

// Create singleton instance
const syncUtils = new SyncUtils();

export default syncUtils;

// Export individual functions for convenience
export const {
  calculateLagMs,
  playbackRateFromLag,
  shouldSkipLag,
  calculateNetworkDelay,
  getNetworkQuality,
  generateSyncStrategy,
  calculateBufferHealth,
  getOptimalSyncInterval,
  smoothRateTransition
} = syncUtils;
