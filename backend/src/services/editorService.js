import SceneMarker from '../models/SceneMarker.js';
import EditSession from '../models/EditSession.js';
import generalUtils from '../utils/generalUtils.js';
import videoUtils from '../utils/videoUtils.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

/**
 * Editor Service - Manages video editing features including scene markers,
 * edit sessions, timeline management, and export functionality
 */
export class EditorService {
  constructor() {
    this.activeEditSessions = new Map(); // Cache for active edit sessions
    this.markerCache = new Map(); // Cache for video markers
    this.exportQueue = new Map(); // Track export jobs
    this.tempPath = process.env.TEMP_PATH || './temp/editor';
    
    // Cleanup exports every hour
    setInterval(() => this.cleanupExports(), 60 * 60 * 1000);
    
    // Initialize temp directory
    this.initializeTempDirectory();
  }

  /**
   * Initialize temporary directory for editor operations
   */
  async initializeTempDirectory() {
    try {
      await fs.promises.access(this.tempPath);
    } catch {
      await fs.promises.mkdir(this.tempPath, { recursive: true });
      logger.info(`Created editor temp directory: ${this.tempPath}`);
    }
  }

  /**
   * Add a scene marker to a video
   * @param {String} videoId - video ID
   * @param {Number} timestamp - timestamp in seconds
   * @param {String} label - marker label
   * @param {String} markerType - type of marker (scene, chapter, bookmark, etc.)
   * @param {String} userId - user creating the marker
   * @param {Object} options - additional marker options
   * @returns {Promise<Object>} created marker
   */
  async addMarker(videoId, timestamp, label, markerType, userId, options = {}) {
    try {
      logger.info('Adding scene marker:', {
        videoId,
        timestamp,
        label,
        markerType,
        userId
      });

      // Validate timestamp
      if (timestamp < 0) {
        throw new Error('Timestamp cannot be negative');
      }

      // Validate marker type
      const validTypes = ['scene', 'chapter', 'bookmark', 'cut', 'transition', 'highlight', 'note'];
      if (!validTypes.includes(markerType)) {
        throw new Error(`Invalid marker type. Must be one of: ${validTypes.join(', ')}`);
      }

      // Check for duplicate markers at the same timestamp (within 1 second)
      const existingMarker = await SceneMarker.findOne({
        video: videoId,
        timestamp: { $gte: timestamp - 1, $lte: timestamp + 1 },
        markerType
      });

      if (existingMarker && !options.allowDuplicate) {
        throw new Error(`${markerType} marker already exists near timestamp ${timestamp}`);
      }

      // Prepare marker data
      const markerData = {
        video: videoId,
        timestamp,
        label: label.trim(),
        markerType,
        createdBy: userId,
        
        // Optional metadata
        description: options.description || '',
        color: options.color || this.getDefaultMarkerColor(markerType),
        duration: options.duration || 0, // For range markers
        
        // Editor-specific data
        editSessionId: options.editSessionId || null,
        isKeyframe: options.isKeyframe || false,
        transitions: options.transitions || {},
        effects: options.effects || {},
        
        // Collaboration
        isPublic: options.isPublic || false,
        tags: options.tags || [],
        
        // Metadata
        confidence: options.confidence || 1.0, // For AI-generated markers
        source: options.source || 'manual', // manual, ai, import
        
        // Status
        isActive: true,
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const marker = new SceneMarker(markerData);
      await marker.save();

      // Update cache
      const cacheKey = `${videoId}_markers`;
      if (this.markerCache.has(cacheKey)) {
        const cachedMarkers = this.markerCache.get(cacheKey);
        cachedMarkers.push(marker);
        cachedMarkers.sort((a, b) => a.timestamp - b.timestamp);
      }

      // Update edit session if provided
      if (options.editSessionId) {
        await this.updateEditSession(options.editSessionId, {
          lastMarkerAdded: marker._id,
          lastActivity: new Date()
        });
      }

      logger.info('Scene marker added successfully:', {
        markerId: marker._id,
        videoId,
        timestamp,
        markerType
      });

      return marker;

    } catch (error) {
      logger.error('Scene marker creation failed:', {
        videoId,
        timestamp,
        label,
        markerType,
        userId,
        error: error.message
      });
      throw new Error(`Failed to add marker: ${error.message}`);
    }
  }

  /**
   * List all markers for a video
   * @param {String} videoId - video ID
   * @param {Object} options - filtering and sorting options
   * @returns {Promise<Array>} list of markers
   */
  async listMarkers(videoId, options = {}) {
    try {
      const {
        markerType,
        startTime,
        endTime,
        userId,
        sortBy = 'timestamp',
        sortOrder = 'asc',
        limit,
        offset = 0
      } = options;

      // Check cache first
      const cacheKey = `${videoId}_markers`;
      let markers = this.markerCache.get(cacheKey);

      if (!markers) {
        // Build query
        const query = { video: videoId, isActive: true };
        
        if (markerType) {
          if (Array.isArray(markerType)) {
            query.markerType = { $in: markerType };
          } else {
            query.markerType = markerType;
          }
        }

        if (startTime !== undefined || endTime !== undefined) {
          query.timestamp = {};
          if (startTime !== undefined) query.timestamp.$gte = startTime;
          if (endTime !== undefined) query.timestamp.$lte = endTime;
        }

        if (userId) {
          query.createdBy = userId;
        }

        // Execute query
        let dbQuery = SceneMarker.find(query);
        
        // Apply sorting
        const sortObj = {};
        sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;
        dbQuery = dbQuery.sort(sortObj);

        // Apply pagination
        if (offset > 0) dbQuery = dbQuery.skip(offset);
        if (limit) dbQuery = dbQuery.limit(limit);

        // Populate user info
        dbQuery = dbQuery.populate('createdBy', 'username email');

        markers = await dbQuery.lean();

        // Cache the results (cache all markers for the video)
        if (!startTime && !endTime && !markerType && !userId) {
          this.markerCache.set(cacheKey, markers);
        }
      } else {
        // Apply filters to cached data
        let filteredMarkers = markers;

        if (markerType) {
          const types = Array.isArray(markerType) ? markerType : [markerType];
          filteredMarkers = filteredMarkers.filter(m => types.includes(m.markerType));
        }

        if (startTime !== undefined) {
          filteredMarkers = filteredMarkers.filter(m => m.timestamp >= startTime);
        }

        if (endTime !== undefined) {
          filteredMarkers = filteredMarkers.filter(m => m.timestamp <= endTime);
        }

        if (userId) {
          filteredMarkers = filteredMarkers.filter(m => 
            m.createdBy.toString() === userId || m.createdBy._id?.toString() === userId
          );
        }

        // Apply sorting
        filteredMarkers.sort((a, b) => {
          const aVal = a[sortBy];
          const bVal = b[sortBy];
          const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
          return sortOrder === 'desc' ? -comparison : comparison;
        });

        // Apply pagination
        if (offset > 0 || limit) {
          const endIndex = limit ? offset + limit : undefined;
          filteredMarkers = filteredMarkers.slice(offset, endIndex);
        }

        markers = filteredMarkers;
      }

      // Add formatted timestamps
      const formattedMarkers = markers.map(marker => ({
        ...marker,
        formattedTimestamp: generalUtils.formatDuration(marker.timestamp),
        formattedCreatedAt: marker.createdAt ? new Date(marker.createdAt).toISOString() : null
      }));

      logger.info('Markers retrieved:', {
        videoId,
        count: formattedMarkers.length,
        filters: { markerType, startTime, endTime, userId }
      });

      return formattedMarkers;

    } catch (error) {
      logger.error('Marker listing failed:', {
        videoId,
        options,
        error: error.message
      });
      throw new Error(`Failed to list markers: ${error.message}`);
    }
  }

  /**
   * Update a scene marker
   * @param {String} markerId - marker ID
   * @param {Object} updates - fields to update
   * @param {String} userId - user making the update
   * @returns {Promise<Object>} updated marker
   */
  async updateMarker(markerId, updates, userId) {
    try {
      logger.info('Updating scene marker:', {
        markerId,
        updates: Object.keys(updates),
        userId
      });

      const marker = await SceneMarker.findById(markerId);
      
      if (!marker) {
        throw new Error('Marker not found');
      }

      // Check permissions
      if (marker.createdBy.toString() !== userId && !this.isAdmin(userId)) {
        throw new Error('Access denied');
      }

      // Validate updates
      const allowedUpdates = [
        'label', 'description', 'color', 'duration', 'markerType',
        'transitions', 'effects', 'tags', 'isPublic'
      ];

      const sanitizedUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key)) {
          sanitizedUpdates[key] = value;
        }
      }

      sanitizedUpdates.updatedAt = new Date();

      const updatedMarker = await SceneMarker.findByIdAndUpdate(
        markerId,
        sanitizedUpdates,
        { new: true, runValidators: true }
      ).populate('createdBy', 'username email');

      // Invalidate cache
      const cacheKey = `${marker.video}_markers`;
      this.markerCache.delete(cacheKey);

      logger.info('Scene marker updated successfully:', {
        markerId,
        videoId: marker.video,
        updates: Object.keys(sanitizedUpdates)
      });

      return updatedMarker;

    } catch (error) {
      logger.error('Marker update failed:', {
        markerId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete a scene marker
   * @param {String} markerId - marker ID
   * @param {String} userId - user requesting deletion
   * @returns {Promise<Boolean>} deletion success
   */
  async deleteMarker(markerId, userId) {
    try {
      logger.info('Deleting scene marker:', { markerId, userId });

      const marker = await SceneMarker.findById(markerId);
      
      if (!marker) {
        throw new Error('Marker not found');
      }

      // Check permissions
      if (marker.createdBy.toString() !== userId && !this.isAdmin(userId)) {
        throw new Error('Access denied');
      }

      // Soft delete by marking as inactive
      await SceneMarker.findByIdAndUpdate(markerId, {
        isActive: false,
        deletedAt: new Date(),
        deletedBy: userId
      });

      // Invalidate cache
      const cacheKey = `${marker.video}_markers`;
      this.markerCache.delete(cacheKey);

      logger.info('Scene marker deleted successfully:', {
        markerId,
        videoId: marker.video,
        userId
      });

      return true;

    } catch (error) {
      logger.error('Marker deletion failed:', {
        markerId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create a new edit session
   * @param {String} videoId - video ID
   * @param {String} userId - user creating the session
   * @param {Object} options - session options
   * @returns {Promise<Object>} created edit session
   */
  async createEditSession(videoId, userId, options = {}) {
    try {
      logger.info('Creating edit session:', {
        videoId,
        userId,
        options
      });

      const sessionId = generalUtils.generateUUID();

      const sessionData = {
        _id: sessionId,
        video: videoId,
        createdBy: userId,
        sessionName: options.name || `Edit Session ${Date.now()}`,
        description: options.description || '',
        
        // Timeline state
        timeline: {
          markers: [],
          cuts: [],
          transitions: [],
          effects: []
        },
        
        // Playback state
        currentTimestamp: 0,
        zoomLevel: 1,
        timelineStart: 0,
        timelineEnd: options.videoDuration || 0,
        
        // Collaboration
        isCollaborative: options.isCollaborative || false,
        invitedUsers: options.invitedUsers || [],
        permissions: options.permissions || {},
        
        // Version control
        version: 1,
        lastSaved: new Date(),
        autoSave: options.autoSave !== false,
        
        // Status
        isActive: true,
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const editSession = new EditSession(sessionData);
      await editSession.save();

      // Cache the session
      this.activeEditSessions.set(sessionId, editSession);

      logger.info('Edit session created successfully:', {
        sessionId,
        videoId,
        userId
      });

      return editSession;

    } catch (error) {
      logger.error('Edit session creation failed:', {
        videoId,
        userId,
        error: error.message
      });
      throw new Error(`Failed to create edit session: ${error.message}`);
    }
  }

  /**
   * Get edit session
   * @param {String} sessionId - edit session ID
   * @param {String} userId - requesting user ID
   * @returns {Promise<Object>} edit session data
   */
  async getEditSession(sessionId, userId) {
    try {
      // Check cache first
      let editSession = this.activeEditSessions.get(sessionId);

      if (!editSession) {
        editSession = await EditSession.findById(sessionId)
          .populate('video', 'title duration')
          .populate('createdBy', 'username email');

        if (editSession) {
          this.activeEditSessions.set(sessionId, editSession);
        }
      }

      if (!editSession) {
        throw new Error('Edit session not found');
      }

      // Check permissions
      if (!this.hasEditSessionAccess(editSession, userId)) {
        throw new Error('Access denied to edit session');
      }

      return editSession;

    } catch (error) {
      logger.error('Edit session retrieval failed:', {
        sessionId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update edit session
   * @param {String} sessionId - edit session ID
   * @param {Object} updates - updates to apply
   * @param {String} userId - user making the update
   * @returns {Promise<Object>} updated session
   */
  async updateEditSession(sessionId, updates, userId = null) {
    try {
      const editSession = await EditSession.findById(sessionId);

      if (!editSession) {
        throw new Error('Edit session not found');
      }

      if (userId && !this.hasEditSessionAccess(editSession, userId)) {
        throw new Error('Access denied to edit session');
      }

      // Prepare updates
      const updateData = {
        ...updates,
        updatedAt: new Date()
      };

      if (updates.timeline) {
        updateData.lastSaved = new Date();
        updateData.version = editSession.version + 1;
      }

      const updatedSession = await EditSession.findByIdAndUpdate(
        sessionId,
        updateData,
        { new: true }
      );

      // Update cache
      this.activeEditSessions.set(sessionId, updatedSession);

      return updatedSession;

    } catch (error) {
      logger.error('Edit session update failed:', {
        sessionId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Export markers in various formats
   * @param {String} videoId - video ID
   * @param {String} format - export format (JSON, EDL, SRT, CSV, XML)
   * @param {Object} options - export options
   * @returns {Promise<String>} exported data or file path
   */
  async exportMarkers(videoId, format = 'JSON', options = {}) {
    try {
      logger.info('Exporting markers:', {
        videoId,
        format,
        options
      });

      const validFormats = ['JSON', 'EDL', 'SRT', 'CSV', 'XML', 'FCPXML'];
      if (!validFormats.includes(format.toUpperCase())) {
        throw new Error(`Unsupported export format. Supported: ${validFormats.join(', ')}`);
      }

      // Get markers
      const markers = await this.listMarkers(videoId, {
        markerType: options.markerTypes,
        sortBy: 'timestamp',
        sortOrder: 'asc'
      });

      if (markers.length === 0) {
        throw new Error('No markers found for export');
      }

      // Export based on format
      let exportedData;
      let fileName;

      switch (format.toUpperCase()) {
        case 'JSON':
          exportedData = this.exportAsJSON(markers, options);
          fileName = `markers_${videoId}_${Date.now()}.json`;
          break;

        case 'EDL':
          exportedData = this.exportAsEDL(markers, options);
          fileName = `markers_${videoId}_${Date.now()}.edl`;
          break;

        case 'SRT':
          exportedData = this.exportAsSRT(markers, options);
          fileName = `markers_${videoId}_${Date.now()}.srt`;
          break;

        case 'CSV':
          exportedData = this.exportAsCSV(markers, options);
          fileName = `markers_${videoId}_${Date.now()}.csv`;
          break;

        case 'XML':
          exportedData = this.exportAsXML(markers, options);
          fileName = `markers_${videoId}_${Date.now()}.xml`;
          break;

        case 'FCPXML':
          exportedData = this.exportAsFCPXML(markers, options);
          fileName = `markers_${videoId}_${Date.now()}.fcpxml`;
          break;

        default:
          throw new Error(`Export format ${format} not implemented`);
      }

      // Save to file if requested
      if (options.saveToFile) {
        const filePath = path.join(this.tempPath, fileName);
        await writeFile(filePath, exportedData, 'utf8');

        logger.info('Markers exported to file:', {
          videoId,
          format,
          filePath,
          markerCount: markers.length
        });

        return filePath;
      }

      logger.info('Markers exported:', {
        videoId,
        format,
        markerCount: markers.length,
        dataLength: exportedData.length
      });

      return exportedData;

    } catch (error) {
      logger.error('Marker export failed:', {
        videoId,
        format,
        error: error.message
      });
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Import markers from various formats
   * @param {String} videoId - video ID
   * @param {String} data - import data
   * @param {String} format - import format
   * @param {String} userId - importing user ID
   * @param {Object} options - import options
   * @returns {Promise<Array>} imported markers
   */
  async importMarkers(videoId, data, format, userId, options = {}) {
    try {
      logger.info('Importing markers:', {
        videoId,
        format,
        userId,
        dataLength: data.length
      });

      let parsedMarkers;

      switch (format.toUpperCase()) {
        case 'JSON':
          parsedMarkers = this.parseJSONMarkers(data);
          break;

        case 'EDL':
          parsedMarkers = this.parseEDLMarkers(data);
          break;

        case 'SRT':
          parsedMarkers = this.parseSRTMarkers(data);
          break;

        case 'CSV':
          parsedMarkers = this.parseCSVMarkers(data);
          break;

        default:
          throw new Error(`Import format ${format} not supported`);
      }

      // Create markers
      const importedMarkers = [];
      for (const markerData of parsedMarkers) {
        try {
          const marker = await this.addMarker(
            videoId,
            markerData.timestamp,
            markerData.label,
            markerData.markerType || 'scene',
            userId,
            {
              ...markerData,
              source: 'import',
              editSessionId: options.editSessionId
            }
          );
          importedMarkers.push(marker);

        } catch (error) {
          logger.warn('Failed to import marker:', {
            markerData,
            error: error.message
          });
          
          if (!options.continueOnError) {
            throw error;
          }
        }
      }

      logger.info('Markers imported successfully:', {
        videoId,
        format,
        totalParsed: parsedMarkers.length,
        successfullyImported: importedMarkers.length
      });

      return importedMarkers;

    } catch (error) {
      logger.error('Marker import failed:', {
        videoId,
        format,
        userId,
        error: error.message
      });
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  /**
   * Generate auto-suggestions for edits using AI or rule-based analysis
   * @param {String} videoId - video ID
   * @param {Object} options - analysis options
   * @returns {Promise<Array>} edit suggestions
   */
  async generateEditSuggestions(videoId, options = {}) {
    try {
      logger.info('Generating edit suggestions:', { videoId, options });

      const suggestions = [];

      // Get video metadata for analysis
      const videoMetadata = await videoUtils.getVideoMetadata(videoId);
      if (!videoMetadata) {
        throw new Error('Could not retrieve video metadata');
      }

      // Scene detection suggestions
      if (options.detectScenes !== false) {
        const sceneChanges = await this.detectSceneChanges(videoId, options);
        suggestions.push(...sceneChanges.map(scene => ({
          type: 'scene',
          action: 'add_marker',
          timestamp: scene.timestamp,
          label: `Scene ${scene.index + 1}`,
          confidence: scene.confidence,
          reason: 'Scene change detected'
        })));
      }

      // Audio level analysis
      if (options.analyzeAudio) {
        const audioSuggestions = await this.analyzeAudioLevels(videoId, options);
        suggestions.push(...audioSuggestions);
      }

      // Motion detection
      if (options.detectMotion) {
        const motionSuggestions = await this.analyzeMotion(videoId, options);
        suggestions.push(...motionSuggestions);
      }

      // Face detection (if enabled)
      if (options.detectFaces) {
        const faceSuggestions = await this.analyzeFaces(videoId, options);
        suggestions.push(...faceSuggestions);
      }

      // Sort suggestions by confidence and timestamp
      suggestions.sort((a, b) => {
        if (a.confidence !== b.confidence) {
          return b.confidence - a.confidence; // Higher confidence first
        }
        return a.timestamp - b.timestamp; // Earlier timestamp first
      });

      logger.info('Edit suggestions generated:', {
        videoId,
        suggestionCount: suggestions.length,
        types: [...new Set(suggestions.map(s => s.type))]
      });

      return suggestions;

    } catch (error) {
      logger.error('Edit suggestion generation failed:', {
        videoId,
        error: error.message
      });
      throw new Error(`Failed to generate suggestions: ${error.message}`);
    }
  }

  /**
   * Apply auto-suggestions as markers
   * @param {String} videoId - video ID
   * @param {Array} suggestions - suggestions to apply
   * @param {String} userId - user applying suggestions
   * @param {Object} options - application options
   * @returns {Promise<Array>} created markers
   */
  async applySuggestions(videoId, suggestions, userId, options = {}) {
    try {
      logger.info('Applying edit suggestions:', {
        videoId,
        suggestionCount: suggestions.length,
        userId
      });

      const createdMarkers = [];
      const minConfidence = options.minConfidence || 0.7;

      for (const suggestion of suggestions) {
        if (suggestion.confidence < minConfidence) {
          continue; // Skip low-confidence suggestions
        }

        try {
          const marker = await this.addMarker(
            videoId,
            suggestion.timestamp,
            suggestion.label,
            suggestion.type,
            userId,
            {
              description: suggestion.reason,
              confidence: suggestion.confidence,
              source: 'ai',
              editSessionId: options.editSessionId
            }
          );
          createdMarkers.push(marker);

        } catch (error) {
          logger.warn('Failed to apply suggestion:', {
            suggestion,
            error: error.message
          });
        }
      }

      logger.info('Edit suggestions applied:', {
        videoId,
        appliedCount: createdMarkers.length,
        totalSuggestions: suggestions.length
      });

      return createdMarkers;

    } catch (error) {
      logger.error('Suggestion application failed:', {
        videoId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get default marker color for marker type
   * @param {String} markerType - type of marker
   * @returns {String} hex color code
   */
  getDefaultMarkerColor(markerType) {
    const colorMap = {
      scene: '#FF6B6B',      // Red
      chapter: '#4ECDC4',    // Teal
      bookmark: '#45B7D1',   // Blue
      cut: '#96CEB4',        // Green
      transition: '#FFEAA7', // Yellow
      highlight: '#DDA0DD',  // Plum
      note: '#98D8C8'        // Mint
    };

    return colorMap[markerType] || '#CCCCCC';
  }

  /**
   * Check if user has access to edit session
   * @param {Object} editSession - edit session object
   * @param {String} userId - user ID to check
   * @returns {Boolean} has access
   */
  hasEditSessionAccess(editSession, userId) {
    if (editSession.createdBy.toString() === userId) {
      return true;
    }

    if (editSession.isCollaborative) {
      return editSession.invitedUsers.includes(userId) ||
             editSession.permissions[userId]?.canEdit;
    }

    return false;
  }

  /**
   * Check if user has admin privileges
   * @param {String} userId - user ID to check
   * @returns {Boolean} is admin
   */
  isAdmin(userId) {
    // TODO: Implement actual admin check
    return false;
  }

  // Export format methods

  /**
   * Export markers as JSON
   * @param {Array} markers - markers to export
   * @param {Object} options - export options
   * @returns {String} JSON data
   */
  exportAsJSON(markers, options) {
    const exportData = {
      format: 'JSON',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      markers: markers.map(marker => ({
        id: marker._id,
        timestamp: marker.timestamp,
        label: marker.label,
        description: marker.description,
        markerType: marker.markerType,
        color: marker.color,
        duration: marker.duration,
        tags: marker.tags,
        createdBy: marker.createdBy?.username || 'Unknown',
        createdAt: marker.createdAt
      }))
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export markers as EDL (Edit Decision List)
   * @param {Array} markers - markers to export
   * @param {Object} options - export options
   * @returns {String} EDL data
   */
  exportAsEDL(markers, options) {
    let edl = 'TITLE: Video Markers Export\n';
    edl += 'FCM: NON-DROP FRAME\n\n';

    markers.forEach((marker, index) => {
      const editNumber = String(index + 1).padStart(3, '0');
      const timeCode = videoUtils.secondsToTimecode(marker.timestamp);
      
      edl += `${editNumber}  AX       AA/V  C        ${timeCode} ${timeCode} ${timeCode} ${timeCode}\n`;
      edl += `* FROM CLIP NAME: ${marker.label}\n`;
      if (marker.description) {
        edl += `* COMMENT: ${marker.description}\n`;
      }
      edl += '\n';
    });

    return edl;
  }

  /**
   * Export markers as SRT (SubRip) format
   * @param {Array} markers - markers to export
   * @param {Object} options - export options
   * @returns {String} SRT data
   */
  exportAsSRT(markers, options) {
    let srt = '';

    markers.forEach((marker, index) => {
      const startTime = videoUtils.secondsToSRTTime(marker.timestamp);
      const endTime = videoUtils.secondsToSRTTime(
        marker.timestamp + (marker.duration || 3)
      );

      srt += `${index + 1}\n`;
      srt += `${startTime} --> ${endTime}\n`;
      srt += `${marker.label}\n`;
      if (marker.description) {
        srt += `${marker.description}\n`;
      }
      srt += '\n';
    });

    return srt.trim();
  }

  /**
   * Export markers as CSV
   * @param {Array} markers - markers to export
   * @param {Object} options - export options
   * @returns {String} CSV data
   */
  exportAsCSV(markers, options) {
    const headers = [
      'Timestamp',
      'Label',
      'Type',
      'Description',
      'Duration',
      'Color',
      'Created By',
      'Created At'
    ];

    let csv = headers.join(',') + '\n';

    markers.forEach(marker => {
      const row = [
        marker.timestamp,
        `"${marker.label.replace(/"/g, '""')}"`,
        marker.markerType,
        `"${(marker.description || '').replace(/"/g, '""')}"`,
        marker.duration || 0,
        marker.color || '',
        `"${marker.createdBy?.username || 'Unknown'}"`,
        marker.createdAt ? new Date(marker.createdAt).toISOString() : ''
      ];

      csv += row.join(',') + '\n';
    });

    return csv;
  }

  /**
   * Export markers as XML
   * @param {Array} markers - markers to export
   * @param {Object} options - export options
   * @returns {String} XML data
   */
  exportAsXML(markers, options) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<markers>\n';

    markers.forEach(marker => {
      xml += '  <marker>\n';
      xml += `    <id>${marker._id}</id>\n`;
      xml += `    <timestamp>${marker.timestamp}</timestamp>\n`;
      xml += `    <label><![CDATA[${marker.label}]]></label>\n`;
      xml += `    <type>${marker.markerType}</type>\n`;
      if (marker.description) {
        xml += `    <description><![CDATA[${marker.description}]]></description>\n`;
      }
      if (marker.duration) {
        xml += `    <duration>${marker.duration}</duration>\n`;
      }
      xml += `    <color>${marker.color || ''}</color>\n`;
      xml += `    <createdBy>${marker.createdBy?.username || 'Unknown'}</createdBy>\n`;
      xml += `    <createdAt>${marker.createdAt ? new Date(marker.createdAt).toISOString() : ''}</createdAt>\n`;
      xml += '  </marker>\n';
    });

    xml += '</markers>\n';
    return xml;
  }

  /**
   * Export markers as Final Cut Pro XML
   * @param {Array} markers - markers to export
   * @param {Object} options - export options
   * @returns {String} FCPXML data
   */
  exportAsFCPXML(markers, options) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<!DOCTYPE fcpxml>\n';
    xml += '<fcpxml version="1.8">\n';
    xml += '  <resources>\n';
    xml += '  </resources>\n';
    xml += '  <library>\n';
    xml += '    <event name="Imported Markers">\n';
    xml += '      <project name="Video Markers">\n';
    xml += '        <sequence>\n';

    markers.forEach(marker => {
      const frames = Math.round(marker.timestamp * 25); // Assuming 25fps
      xml += `          <marker start="${frames}s" duration="1s" value="${marker.label}">\n`;
      if (marker.description) {
        xml += `            <note>${marker.description}</note>\n`;
      }
      xml += '          </marker>\n';
    });

    xml += '        </sequence>\n';
    xml += '      </project>\n';
    xml += '    </event>\n';
    xml += '  </library>\n';
    xml += '</fcpxml>\n';

    return xml;
  }

  // Import parsing methods

  /**
   * Parse JSON markers
   * @param {String} data - JSON data
   * @returns {Array} parsed markers
   */
  parseJSONMarkers(data) {
    try {
      const parsed = JSON.parse(data);
      return parsed.markers || parsed;
    } catch (error) {
      throw new Error('Invalid JSON format');
    }
  }

  /**
   * Parse EDL markers
   * @param {String} data - EDL data
   * @returns {Array} parsed markers
   */
  parseEDLMarkers(data) {
    const markers = [];
    const lines = data.split('\n');
    
    // Simplified EDL parsing - implement full EDL parser as needed
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('*') && line.includes('FROM CLIP NAME:')) {
        const label = line.replace('* FROM CLIP NAME:', '').trim();
        const timestamp = 0; // Extract from previous line timecode
        
        markers.push({
          timestamp,
          label,
          markerType: 'scene'
        });
      }
    }

    return markers;
  }

  /**
   * Parse SRT markers
   * @param {String} data - SRT data
   * @returns {Array} parsed markers
   */
  parseSRTMarkers(data) {
    const markers = [];
    const blocks = data.split('\n\n');

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length >= 3) {
        const timecode = lines[1];
        const label = lines[2];
        const description = lines[3] || '';

        const startTime = videoUtils.srtTimeToSeconds(timecode.split(' --> ')[0]);

        markers.push({
          timestamp: startTime,
          label,
          description,
          markerType: 'scene'
        });
      }
    }

    return markers;
  }

  /**
   * Parse CSV markers
   * @param {String} data - CSV data
   * @returns {Array} parsed markers
   */
  parseCSVMarkers(data) {
    const markers = [];
    const lines = data.split('\n');
    const headers = lines[0].split(',');

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length >= 3) {
        markers.push({
          timestamp: parseFloat(values[0]) || 0,
          label: values[1] || `Marker ${i}`,
          markerType: values[2] || 'scene',
          description: values[3] || '',
          duration: parseFloat(values[4]) || 0
        });
      }
    }

    return markers;
  }

  /**
   * Parse a CSV line handling quoted values
   * @param {String} line - CSV line
   * @returns {Array} parsed values
   */
  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  // Analysis methods (simplified implementations)

  /**
   * Detect scene changes in video
   * @param {String} videoId - video ID
   * @param {Object} options - detection options
   * @returns {Promise<Array>} detected scene changes
   */
  async detectSceneChanges(videoId, options) {
    // Simplified implementation - would use actual video analysis
    logger.info('Scene change detection not fully implemented');
    return [];
  }

  /**
   * Analyze audio levels
   * @param {String} videoId - video ID
   * @param {Object} options - analysis options
   * @returns {Promise<Array>} audio analysis suggestions
   */
  async analyzeAudioLevels(videoId, options) {
    // Simplified implementation
    logger.info('Audio level analysis not fully implemented');
    return [];
  }

  /**
   * Analyze motion in video
   * @param {String} videoId - video ID
   * @param {Object} options - analysis options
   * @returns {Promise<Array>} motion analysis suggestions
   */
  async analyzeMotion(videoId, options) {
    // Simplified implementation
    logger.info('Motion analysis not fully implemented');
    return [];
  }

  /**
   * Analyze faces in video
   * @param {String} videoId - video ID
   * @param {Object} options - analysis options
   * @returns {Promise<Array>} face analysis suggestions
   */
  async analyzeFaces(videoId, options) {
    // Simplified implementation
    logger.info('Face analysis not fully implemented');
    return [];
  }

  /**
   * Clean up old export files
   */
  async cleanupExports() {
    try {
      const files = await fs.promises.readdir(this.tempPath);
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours

      for (const file of files) {
        const filePath = path.join(this.tempPath, file);
        const stats = await fs.promises.stat(filePath);
        
        if (stats.mtime < cutoffTime) {
          await fs.promises.unlink(filePath);
          logger.info(`Cleaned up old export file: ${filePath}`);
        }
      }

    } catch (error) {
      logger.error('Export cleanup failed:', error);
    }
  }

  /**
   * Get service statistics
   * @returns {Object} service statistics
   */
  getServiceStats() {
    return {
      activeEditSessions: this.activeEditSessions.size,
      cachedMarkers: this.markerCache.size,
      exportQueue: this.exportQueue.size
    };
  }
}

// Create singleton instance
const editorService = new EditorService();

export default editorService;
