import crypto from 'crypto';
import logger from './logger.js';

/**
 * Encryption utility functions for securing sensitive data
 * Provides AES encryption, hashing, and secure token generation
 */
export class EncryptionUtils {
  constructor() {
    // Encryption configuration
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32; // 256 bits

    // Initialize encryption key
    this.encryptionKey = this.getOrCreateEncryptionKey();
    
    // Hash configuration
    this.hashAlgorithm = 'sha256';
    this.hashIterations = 100000; // PBKDF2 iterations
  }

  /**
   * Get or create the master encryption key
   * @returns {Buffer} encryption key
   */
  getOrCreateEncryptionKey() {
    let key;
    
    if (process.env.ENCRYPTION_KEY) {
      // Use provided key
      if (process.env.ENCRYPTION_KEY.length === 64) {
        // Hex encoded key
        key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
      } else {
        // Derive key from string
        key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'video-player-salt', this.keyLength);
      }
    } else {
      logger.warn('No ENCRYPTION_KEY environment variable set. Using derived key from default secret.');
      // Fallback to derived key (not recommended for production)
      key = crypto.scryptSync('default-video-player-secret', 'video-player-salt', this.keyLength);
    }

    if (key.length !== this.keyLength) {
      throw new Error(`Invalid encryption key length. Expected ${this.keyLength} bytes.`);
    }

    return key;
  }

  /**
   * Encrypt text data using AES-256-GCM
   * @param {string} text - text to encrypt
   * @param {string} associatedData - optional associated data for authentication
   * @returns {string} encrypted data in format: iv:tag:encrypted
   */
  encrypt(text, associatedData = '') {
    try {
      if (typeof text !== 'string') {
        throw new Error('Text must be a string');
      }

      // Generate random IV
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
      cipher.setAAD(Buffer.from(associatedData, 'utf8'));

      // Encrypt the text
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get the authentication tag
      const tag = cipher.getAuthTag();

      // Return format: iv:tag:encrypted
      return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
    } catch (error) {
      logger.error('Encryption failed:', {
        error: error.message,
        textLength: text?.length || 0
      });
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt text data using AES-256-GCM
   * @param {string} encryptedData - encrypted data in format: iv:tag:encrypted
   * @param {string} associatedData - optional associated data for authentication
   * @returns {string} decrypted text
   */
  decrypt(encryptedData, associatedData = '') {
    try {
      if (typeof encryptedData !== 'string') {
        throw new Error('Encrypted data must be a string');
      }

      // Parse the encrypted data
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const [ivHex, tagHex, encrypted] = parts;
      
      // Convert hex strings back to buffers
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');

      // Create decipher
      const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
      decipher.setAuthTag(tag);
      decipher.setAAD(Buffer.from(associatedData, 'utf8'));

      // Decrypt the data
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', {
        error: error.message,
        dataLength: encryptedData?.length || 0
      });
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Hash a password using PBKDF2
   * @param {string} password - password to hash
   * @param {string} salt - optional salt (will generate if not provided)
   * @returns {Object} hash result with salt and hash
   */
  hashPassword(password, salt = null) {
    try {
      if (typeof password !== 'string') {
        throw new Error('Password must be a string');
      }

      // Generate salt if not provided
      if (!salt) {
        salt = crypto.randomBytes(this.saltLength).toString('hex');
      }

      // Hash the password
      const hash = crypto.pbkdf2Sync(
        password,
        salt,
        this.hashIterations,
        this.keyLength,
        this.hashAlgorithm
      );

      return {
        salt,
        hash: hash.toString('hex'),
        iterations: this.hashIterations,
        algorithm: this.hashAlgorithm
      };
    } catch (error) {
      logger.error('Password hashing failed:', {
        error: error.message
      });
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  }

  /**
   * Verify a password against a hash
   * @param {string} password - password to verify
   * @param {string} salt - salt used in original hash
   * @param {string} originalHash - original hash to compare against
   * @returns {boolean} true if password matches
   */
  verifyPassword(password, salt, originalHash) {
    try {
      const hashResult = this.hashPassword(password, salt);
      return crypto.timingSafeEqual(
        Buffer.from(hashResult.hash, 'hex'),
        Buffer.from(originalHash, 'hex')
      );
    } catch (error) {
      logger.error('Password verification failed:', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Generate a secure random token
   * @param {number} length - token length in bytes
   * @param {string} encoding - output encoding ('hex', 'base64', 'base64url')
   * @returns {string} generated token
   */
  generateSecureToken(length = 32, encoding = 'hex') {
    try {
      const token = crypto.randomBytes(length);
      
      switch (encoding) {
        case 'base64':
          return token.toString('base64');
        case 'base64url':
          return token.toString('base64url');
        case 'hex':
        default:
          return token.toString('hex');
      }
    } catch (error) {
      logger.error('Token generation failed:', {
        error: error.message,
        length,
        encoding
      });
      throw new Error(`Token generation failed: ${error.message}`);
    }
  }

  /**
   * Generate a cryptographically secure UUID
   * @returns {string} UUID string
   */
  generateSecureUUID() {
    return crypto.randomUUID();
  }

  /**
   * Hash data using SHA-256
   * @param {string|Buffer} data - data to hash
   * @param {string} encoding - output encoding
   * @returns {string} hash value
   */
  hash(data, encoding = 'hex') {
    try {
      const hash = crypto.createHash('sha256');
      hash.update(data);
      return hash.digest(encoding);
    } catch (error) {
      logger.error('Hashing failed:', {
        error: error.message,
        dataType: typeof data
      });
      throw new Error(`Hashing failed: ${error.message}`);
    }
  }

  /**
   * Create HMAC signature
   * @param {string} data - data to sign
   * @param {string} secret - secret key for signing
   * @param {string} algorithm - HMAC algorithm
   * @returns {string} HMAC signature
   */
  createHMAC(data, secret = null, algorithm = 'sha256') {
    try {
      const key = secret || this.encryptionKey.toString('hex');
      const hmac = crypto.createHmac(algorithm, key);
      hmac.update(data);
      return hmac.digest('hex');
    } catch (error) {
      logger.error('HMAC creation failed:', {
        error: error.message,
        algorithm
      });
      throw new Error(`HMAC creation failed: ${error.message}`);
    }
  }

  /**
   * Verify HMAC signature
   * @param {string} data - original data
   * @param {string} signature - signature to verify
   * @param {string} secret - secret key used for signing
   * @param {string} algorithm - HMAC algorithm
   * @returns {boolean} true if signature is valid
   */
  verifyHMAC(data, signature, secret = null, algorithm = 'sha256') {
    try {
      const expectedSignature = this.createHMAC(data, secret, algorithm);
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      logger.error('HMAC verification failed:', {
        error: error.message,
        algorithm
      });
      return false;
    }
  }

  /**
   * Encrypt sensitive object data
   * @param {Object} obj - object to encrypt
   * @param {Array} sensitiveFields - fields to encrypt
   * @returns {Object} object with encrypted fields
   */
  encryptObjectFields(obj, sensitiveFields) {
    try {
      const result = { ...obj };
      
      for (const field of sensitiveFields) {
        if (result[field] !== undefined) {
          result[field] = this.encrypt(String(result[field]));
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Object field encryption failed:', {
        error: error.message,
        fields: sensitiveFields
      });
      throw new Error(`Object field encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt sensitive object data
   * @param {Object} obj - object with encrypted fields
   * @param {Array} sensitiveFields - fields to decrypt
   * @returns {Object} object with decrypted fields
   */
  decryptObjectFields(obj, sensitiveFields) {
    try {
      const result = { ...obj };
      
      for (const field of sensitiveFields) {
        if (result[field] !== undefined) {
          result[field] = this.decrypt(result[field]);
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Object field decryption failed:', {
        error: error.message,
        fields: sensitiveFields
      });
      throw new Error(`Object field decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate API key with metadata
   * @param {Object} metadata - key metadata
   * @returns {Object} API key information
   */
  generateAPIKey(metadata = {}) {
    try {
      const keyId = this.generateSecureUUID();
      const secret = this.generateSecureToken(32, 'base64url');
      const hash = this.hash(secret);
      
      const apiKey = {
        keyId,
        secret,
        hash,
        metadata: {
          createdAt: new Date().toISOString(),
          ...metadata
        }
      };

      logger.info('API key generated:', {
        keyId,
        metadata: apiKey.metadata
      });

      return apiKey;
    } catch (error) {
      logger.error('API key generation failed:', {
        error: error.message,
        metadata
      });
      throw new Error(`API key generation failed: ${error.message}`);
    }
  }

  /**
   * Rotate encryption key (for key rotation strategies)
   * @param {string} newKey - new encryption key
   * @returns {Buffer} old encryption key for data migration
   */
  rotateEncryptionKey(newKey) {
    try {
      const oldKey = Buffer.from(this.encryptionKey);
      
      if (typeof newKey === 'string') {
        if (newKey.length === 64) {
          this.encryptionKey = Buffer.from(newKey, 'hex');
        } else {
          this.encryptionKey = crypto.scryptSync(newKey, 'video-player-salt', this.keyLength);
        }
      } else if (Buffer.isBuffer(newKey)) {
        this.encryptionKey = newKey;
      } else {
        throw new Error('Invalid new key format');
      }

      logger.info('Encryption key rotated successfully');
      return oldKey;
    } catch (error) {
      logger.error('Key rotation failed:', {
        error: error.message
      });
      throw new Error(`Key rotation failed: ${error.message}`);
    }
  }

  /**
   * Get encryption algorithm information
   * @returns {Object} algorithm details
   */
  getAlgorithmInfo() {
    return {
      encryption: this.algorithm,
      hash: this.hashAlgorithm,
      keyLength: this.keyLength,
      ivLength: this.ivLength,
      tagLength: this.tagLength,
      saltLength: this.saltLength,
      hashIterations: this.hashIterations
    };
  }
}

// Create singleton instance
const encryptionUtils = new EncryptionUtils();

export default encryptionUtils;

// Export individual functions for convenience
export const {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  generateSecureToken,
  generateSecureUUID,
  hash,
  createHMAC,
  verifyHMAC,
  encryptObjectFields,
  decryptObjectFields,
  generateAPIKey
} = encryptionUtils;
