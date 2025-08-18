import { v4 as uuidv4, v1 as uuidv1 } from 'uuid';
import { nanoid, customAlphabet } from 'nanoid';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import logger from './logger.js';

const stat = promisify(fs.stat);
const access = promisify(fs.access);

/**
 * General utility functions for common operations
 * Provides UUID generation, delays, formatting, validation, and more
 */
export class GeneralUtils {
  constructor() {
    // Configure custom nanoid alphabets
    this.roomIdAlphabet = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);
    this.shortIdAlphabet = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);
    this.numericAlphabet = customAlphabet('0123456789', 6);
  }

  /**
   * Generate UUID v4 (random)
   * @returns {string} UUID string
   */
  generateUUID() {
    return uuidv4();
  }

  /**
   * Generate UUID v1 (timestamp-based)
   * @returns {string} UUID string
   */
  generateTimeBasedUUID() {
    return uuidv1();
  }

  /**
   * Generate short ID using nanoid
   * @param {number} length - length of generated ID
   * @param {string} alphabet - custom alphabet to use
   * @returns {string} generated ID
   */
  generateShortId(length = 12, alphabet = null) {
    if (alphabet) {
      const customNanoid = customAlphabet(alphabet, length);
      return customNanoid();
    }
    return nanoid(length);
  }

  /**
   * Generate room ID (8 character alphanumeric)
   * @returns {string} room ID
   */
  generateRoomId() {
    return this.roomIdAlphabet();
  }

  /**
   * Generate numeric code (for OTP, verification, etc.)
   * @param {number} length - length of numeric code
   * @returns {string} numeric code
   */
  generateNumericCode(length = 6) {
    const generator = customAlphabet('0123456789', length);
    return generator();
  }

  /**
   * Create a delay/sleep function
   * @param {number} ms - milliseconds to delay
   * @returns {Promise} promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Format bytes to human-readable string
   * @param {number} bytes - number of bytes
   * @param {number} decimals - number of decimal places
   * @returns {string} formatted string
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    if (typeof bytes !== 'number' || bytes < 0) return 'Invalid size';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));

    return `${size} ${sizes[i]}`;
  }

  /**
   * Format duration in seconds to human-readable string
   * @param {number} seconds - duration in seconds
   * @param {Object} options - formatting options
   * @returns {string} formatted duration
   */
  formatDuration(seconds, options = {}) {
    const {
      format = 'auto', // 'auto', 'long', 'short', 'compact'
      includeMs = false,
      maxUnits = 2
    } = options;

    if (typeof seconds !== 'number' || seconds < 0) {
      return 'Invalid duration';
    }

    const units = [
      { name: 'year', short: 'y', value: 365 * 24 * 60 * 60 },
      { name: 'day', short: 'd', value: 24 * 60 * 60 },
      { name: 'hour', short: 'h', value: 60 * 60 },
      { name: 'minute', short: 'm', value: 60 },
      { name: 'second', short: 's', value: 1 }
    ];

    if (includeMs) {
      units.push({ name: 'millisecond', short: 'ms', value: 0.001 });
    }

    const parts = [];
    let remaining = seconds;

    for (const unit of units) {
      if (remaining >= unit.value) {
        const count = Math.floor(remaining / unit.value);
        remaining = remaining % unit.value;

        switch (format) {
          case 'long':
            parts.push(`${count} ${unit.name}${count !== 1 ? 's' : ''}`);
            break;
          case 'short':
            parts.push(`${count}${unit.short}`);
            break;
          case 'compact':
            parts.push(`${count}${unit.short}`);
            break;
          case 'auto':
          default:
            if (seconds < 60) {
              return `${seconds.toFixed(includeMs ? 1 : 0)}s`;
            } else if (seconds < 3600) {
              const mins = Math.floor(seconds / 60);
              const secs = Math.floor(seconds % 60);
              return `${mins}:${secs.toString().padStart(2, '0')}`;
            } else {
              const hours = Math.floor(seconds / 3600);
              const mins = Math.floor((seconds % 3600) / 60);
              const secs = Math.floor(seconds % 60);
              return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        }

        if (parts.length >= maxUnits) break;
      }
    }

    if (parts.length === 0) {
      return format === 'compact' ? '0s' : '0 seconds';
    }

    return parts.join(' ');
  }

  /**
   * Format number with locale-specific formatting
   * @param {number} number - number to format
   * @param {Object} options - formatting options
   * @returns {string} formatted number
   */
  formatNumber(number, options = {}) {
    const {
      locale = 'en-US',
      style = 'decimal',
      minimumFractionDigits = 0,
      maximumFractionDigits = 2,
      currency = 'USD'
    } = options;

    try {
      const formatter = new Intl.NumberFormat(locale, {
        style,
        minimumFractionDigits,
        maximumFractionDigits,
        ...(style === 'currency' && { currency })
      });

      return formatter.format(number);
    } catch (error) {
      logger.error('Number formatting failed:', { error: error.message, number, options });
      return number.toString();
    }
  }

  /**
   * Parse duration string to seconds
   * @param {string} duration - duration string (e.g., "1h 30m", "90s", "1:30:45")
   * @returns {number} duration in seconds
   */
  parseDuration(duration) {
    if (typeof duration !== 'string') {
      throw new Error('Duration must be a string');
    }

    // Handle HH:MM:SS format
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(duration)) {
      const parts = duration.split(':').map(Number);
      if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }

    // Handle text format (e.g., "1h 30m 45s")
    const regex = /(\d+(?:\.\d+)?)\s*([ydhms])/g;
    const units = {
      y: 365 * 24 * 60 * 60,
      d: 24 * 60 * 60,
      h: 60 * 60,
      m: 60,
      s: 1
    };

    let totalSeconds = 0;
    let match;

    while ((match = regex.exec(duration.toLowerCase())) !== null) {
      const value = parseFloat(match[1]);
      const unit = match[2];
      totalSeconds += value * (units[unit] || 0);
    }

    return totalSeconds;
  }

  /**
   * Validate email address
   * @param {string} email - email to validate
   * @returns {boolean} true if valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return typeof email === 'string' && emailRegex.test(email);
  }

  /**
   * Validate URL
   * @param {string} url - URL to validate
   * @param {Array} allowedProtocols - allowed protocols
   * @returns {boolean} true if valid
   */
  isValidUrl(url, allowedProtocols = ['http', 'https']) {
    try {
      const urlObj = new URL(url);
      return allowedProtocols.includes(urlObj.protocol.slice(0, -1));
    } catch {
      return false;
    }
  }

  /**
   * Sanitize filename for safe file system usage
   * @param {string} filename - filename to sanitize
   * @param {Object} options - sanitization options
   * @returns {string} sanitized filename
   */
  sanitizeFilename(filename, options = {}) {
    const {
      maxLength = 255,
      replacement = '_',
      preserveExtension = true
    } = options;

    if (typeof filename !== 'string') {
      throw new Error('Filename must be a string');
    }

    let sanitized = filename;
    let extension = '';

    // Extract extension if preserving
    if (preserveExtension) {
      const ext = path.extname(filename);
      if (ext) {
        extension = ext;
        sanitized = filename.slice(0, -ext.length);
      }
    }

    // Remove or replace unsafe characters
    sanitized = sanitized
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, replacement)
      .replace(/^\.+/, '') // Remove leading dots
      .replace(/\.+$/, '') // Remove trailing dots
      .trim();

    // Handle reserved names on Windows
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    if (reservedNames.includes(sanitized.toUpperCase())) {
      sanitized = `${sanitized}${replacement}file`;
    }

    // Ensure it's not empty
    if (!sanitized) {
      sanitized = 'untitled';
    }

    // Combine with extension
    const result = sanitized + extension;

    // Truncate if too long
    if (result.length > maxLength) {
      const availableLength = maxLength - extension.length;
      sanitized = sanitized.slice(0, availableLength);
      return sanitized + extension;
    }

    return result;
  }

  /**
   * Deep clone an object
   * @param {any} obj - object to clone
   * @returns {any} cloned object
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item));
    }

    if (typeof obj === 'object') {
      const cloned = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }

    return obj;
  }

  /**
   * Debounce function execution
   * @param {Function} func - function to debounce
   * @param {number} wait - wait time in milliseconds
   * @param {boolean} immediate - trigger on leading edge
   * @returns {Function} debounced function
   */
  debounce(func, wait, immediate = false) {
    let timeout;
    
    return function executedFunction(...args) {
      const later = () => {
        timeout = null;
        if (!immediate) func.apply(this, args);
      };
      
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      
      if (callNow) func.apply(this, args);
    };
  }

  /**
   * Throttle function execution
   * @param {Function} func - function to throttle
   * @param {number} limit - time limit in milliseconds
   * @returns {Function} throttled function
   */
  throttle(func, limit) {
    let inThrottle;
    
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Retry function with exponential backoff
   * @param {Function} fn - async function to retry
   * @param {Object} options - retry options
   * @returns {Promise} result of function execution
   */
  async retry(fn, options = {}) {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2,
      retryCondition = () => true
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt > maxRetries || !retryCondition(error)) {
          break;
        }

        logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, {
          error: error.message,
          attempt,
          maxRetries,
          delay
        });

        await this.delay(delay);
        delay = Math.min(delay * backoffFactor, maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Get file information safely
   * @param {string} filePath - path to file
   * @returns {Promise<Object|null>} file information or null if not accessible
   */
  async getFileInfo(filePath) {
    try {
      await access(filePath, fs.constants.F_OK);
      const stats = await stat(filePath);
      
      return {
        exists: true,
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        accessedAt: stats.atime,
        extension: path.extname(filePath),
        basename: path.basename(filePath),
        dirname: path.dirname(filePath)
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message
      };
    }
  }

  /**
   * Generate hash from string
   * @param {string} input - string to hash
   * @param {string} algorithm - hash algorithm
   * @returns {string} hash value
   */
  hashString(input, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(input).digest('hex');
  }

  /**
   * Compare two versions (semantic versioning)
   * @param {string} version1 - first version
   * @param {string} version2 - second version
   * @returns {number} -1, 0, or 1
   */
  compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);
    const maxLength = Math.max(v1parts.length, v2parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;

      if (v1part < v2part) return -1;
      if (v1part > v2part) return 1;
    }

    return 0;
  }

  /**
   * Create a simple cache with TTL
   * @param {number} ttl - time to live in milliseconds
   * @returns {Object} cache object with get/set/clear methods
   */
  createCache(ttl = 60000) {
    const cache = new Map();
    
    return {
      get(key) {
        const item = cache.get(key);
        if (!item) return undefined;
        
        if (Date.now() > item.expiry) {
          cache.delete(key);
          return undefined;
        }
        
        return item.value;
      },
      
      set(key, value) {
        cache.set(key, {
          value,
          expiry: Date.now() + ttl
        });
      },
      
      clear() {
        cache.clear();
      },
      
      size() {
        return cache.size;
      }
    };
  }

  /**
   * Get current timestamp in various formats
   * @param {string} format - format type
   * @returns {number|string} timestamp
   */
  getTimestamp(format = 'unix') {
    const now = new Date();
    
    switch (format) {
      case 'unix':
        return Math.floor(now.getTime() / 1000);
      case 'milliseconds':
        return now.getTime();
      case 'iso':
        return now.toISOString();
      case 'date':
        return now.toDateString();
      case 'time':
        return now.toTimeString();
      default:
        return now.getTime();
    }
  }
}

// Create singleton instance
const generalUtils = new GeneralUtils();

export default generalUtils;

// Export individual functions for convenience
export const {
  generateUUID,
  generateTimeBasedUUID,
  generateShortId,
  generateRoomId,
  generateNumericCode,
  delay,
  formatBytes,
  formatDuration,
  formatNumber,
  parseDuration,
  isValidEmail,
  isValidUrl,
  sanitizeFilename,
  deepClone,
  debounce,
  throttle,
  retry,
  getFileInfo,
  hashString,
  compareVersions,
  createCache,
  getTimestamp
} = generalUtils;
