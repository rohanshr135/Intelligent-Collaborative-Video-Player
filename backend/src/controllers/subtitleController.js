import { Subtitle } from '../models/Subtitle.js';
import logger from '../utils/logger.js';

/**
 * Upload subtitles for a video
 */
export const uploadSubtitles = async (req, res) => {
  try {
    const { roomCode, language, format, subtitleData, userId, username } = req.body;
    
    if (!roomCode || !language || !format || !subtitleData || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: roomCode, language, format, subtitleData, userId' 
      });
    }

    // Parse subtitle data based on format
    let cues = [];
    
    if (format === 'srt') {
      cues = parseSRT(subtitleData);
    } else if (format === 'vtt') {
      cues = parseVTT(subtitleData);
    } else if (format === 'json') {
      cues = JSON.parse(subtitleData);
    } else {
      return res.status(400).json({ error: 'Unsupported subtitle format' });
    }

    const subtitle = new Subtitle({
      roomCode,
      language,
      format,
      cues,
      uploadedBy: userId,
      uploaderName: username || 'Unknown'
    });
    
    await subtitle.save();
    
    logger.info(`📺 Subtitles uploaded for room ${roomCode} in ${language} by ${username || userId}`);
    
    res.status(201).json({
      success: true,
      subtitle: {
        id: subtitle._id,
        language: subtitle.language,
        format: subtitle.format,
        cueCount: subtitle.cues.length,
        uploadedAt: subtitle.uploadedAt
      }
    });
  } catch (error) {
    logger.error(`❌ Error uploading subtitles: ${error.message}`);
    res.status(500).json({ error: 'Failed to upload subtitles' });
  }
};

/**
 * Get subtitles for a room
 */
export const getSubtitles = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { language, startTime, endTime } = req.query;
    
    let query = { roomCode };
    if (language) {
      query.language = language;
    }
    
    const subtitles = await Subtitle.find(query).lean();
    
    if (subtitles.length === 0) {
      return res.json({ subtitles: [] });
    }
    
    // Filter cues by time range if specified
    if (startTime !== undefined || endTime !== undefined) {
      subtitles.forEach(subtitle => {
        subtitle.cues = subtitle.cues.filter(cue => {
          if (startTime !== undefined && cue.startTime < parseFloat(startTime)) return false;
          if (endTime !== undefined && cue.endTime > parseFloat(endTime)) return false;
          return true;
        });
      });
    }
    
    res.json({ subtitles });
  } catch (error) {
    logger.error(`❌ Error fetching subtitles: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch subtitles' });
  }
};

/**
 * Get available subtitle languages for a room
 */
export const getLanguages = async (req, res) => {
  try {
    const { roomCode } = req.params;
    
    const languages = await Subtitle.distinct('language', { roomCode });
    
    res.json({ languages });
  } catch (error) {
    logger.error(`❌ Error fetching subtitle languages: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch languages' });
  }
};

/**
 * Update subtitle cues
 */
export const updateSubtitles = async (req, res) => {
  try {
    const { subtitleId } = req.params;
    const { cues, userId } = req.body;
    
    if (!cues || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: cues, userId' 
      });
    }

    const subtitle = await Subtitle.findById(subtitleId);
    
    if (!subtitle) {
      return res.status(404).json({ error: 'Subtitles not found' });
    }
    
    // Only the uploader can edit subtitles
    if (subtitle.uploadedBy !== userId) {
      return res.status(403).json({ error: 'Unauthorized to edit these subtitles' });
    }
    
    subtitle.cues = cues;
    subtitle.updatedAt = new Date();
    
    await subtitle.save();
    
    logger.info(`📺 Subtitles updated: ${subtitleId}`);
    
    res.json({
      success: true,
      subtitle: {
        id: subtitle._id,
        language: subtitle.language,
        cueCount: subtitle.cues.length,
        updatedAt: subtitle.updatedAt
      }
    });
  } catch (error) {
    logger.error(`❌ Error updating subtitles: ${error.message}`);
    res.status(500).json({ error: 'Failed to update subtitles' });
  }
};

/**
 * Delete subtitles
 */
export const deleteSubtitles = async (req, res) => {
  try {
    const { subtitleId } = req.params;
    const { userId } = req.body;
    
    const subtitle = await Subtitle.findById(subtitleId);
    
    if (!subtitle) {
      return res.status(404).json({ error: 'Subtitles not found' });
    }
    
    // Only the uploader can delete subtitles
    if (subtitle.uploadedBy !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete these subtitles' });
    }
    
    await Subtitle.findByIdAndDelete(subtitleId);
    
    logger.info(`🗑️ Subtitles deleted: ${subtitleId}`);
    
    res.json({
      success: true,
      message: 'Subtitles deleted'
    });
  } catch (error) {
    logger.error(`❌ Error deleting subtitles: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete subtitles' });
  }
};

/**
 * Search subtitles by text content
 */
export const searchSubtitles = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { query, language } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    let searchFilter = { 
      roomCode,
      'cues.text': { $regex: query, $options: 'i' }
    };
    
    if (language) {
      searchFilter.language = language;
    }
    
    const subtitles = await Subtitle.find(searchFilter).lean();
    
    // Filter and highlight matching cues
    const results = [];
    
    subtitles.forEach(subtitle => {
      const matchingCues = subtitle.cues.filter(cue => 
        cue.text.toLowerCase().includes(query.toLowerCase())
      ).map(cue => ({
        ...cue,
        highlightedText: cue.text.replace(
          new RegExp(query, 'gi'),
          `<mark>$&</mark>`
        )
      }));
      
      if (matchingCues.length > 0) {
        results.push({
          subtitleId: subtitle._id,
          language: subtitle.language,
          matches: matchingCues
        });
      }
    });
    
    res.json({
      query,
      totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
      results
    });
  } catch (error) {
    logger.error(`❌ Error searching subtitles: ${error.message}`);
    res.status(500).json({ error: 'Failed to search subtitles' });
  }
};

/**
 * Export subtitles in various formats
 */
export const exportSubtitles = async (req, res) => {
  try {
    const { subtitleId } = req.params;
    const { format = 'srt' } = req.query;
    
    const subtitle = await Subtitle.findById(subtitleId).lean();
    
    if (!subtitle) {
      return res.status(404).json({ error: 'Subtitles not found' });
    }
    
    if (format === 'srt') {
      const srtContent = convertToSRT(subtitle.cues);
      res.type('text/plain').send(srtContent);
    } else if (format === 'vtt') {
      const vttContent = convertToVTT(subtitle.cues);
      res.type('text/vtt').send(vttContent);
    } else if (format === 'json') {
      res.json({
        language: subtitle.language,
        cues: subtitle.cues
      });
    } else {
      res.status(400).json({ error: 'Invalid format. Supported formats: srt, vtt, json' });
    }
  } catch (error) {
    logger.error(`❌ Error exporting subtitles: ${error.message}`);
    res.status(500).json({ error: 'Failed to export subtitles' });
  }
};

// Helper functions for parsing different subtitle formats

function parseSRT(srtData) {
  const cues = [];
  const blocks = srtData.trim().split('\n\n');
  
  blocks.forEach(block => {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
      if (timeMatch) {
        const startTime = parseTimeToSeconds(timeMatch[1].replace(',', '.'));
        const endTime = parseTimeToSeconds(timeMatch[2].replace(',', '.'));
        const text = lines.slice(2).join('\n');
        
        cues.push({ startTime, endTime, text });
      }
    }
  });
  
  return cues;
}

function parseVTT(vttData) {
  const cues = [];
  const lines = vttData.split('\n');
  let i = 0;
  
  // Skip header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }
  
  while (i < lines.length) {
    const line = lines[i];
    if (line.includes('-->')) {
      const timeMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/);
      if (timeMatch) {
        const startTime = parseTimeToSeconds(timeMatch[1]);
        const endTime = parseTimeToSeconds(timeMatch[2]);
        
        i++;
        let text = '';
        while (i < lines.length && lines[i].trim() !== '') {
          text += (text ? '\n' : '') + lines[i];
          i++;
        }
        
        cues.push({ startTime, endTime, text });
      }
    }
    i++;
  }
  
  return cues;
}

function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);
  const secondsParts = parts[2].split(/[.,]/);
  const seconds = parseInt(secondsParts[0]);
  const milliseconds = parseInt(secondsParts[1]) || 0;
  
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function convertToSRT(cues) {
  let srtContent = '';
  
  cues.forEach((cue, index) => {
    const startTime = formatTimeForSRT(cue.startTime);
    const endTime = formatTimeForSRT(cue.endTime);
    
    srtContent += `${index + 1}\n`;
    srtContent += `${startTime} --> ${endTime}\n`;
    srtContent += `${cue.text}\n\n`;
  });
  
  return srtContent;
}

function convertToVTT(cues) {
  let vttContent = 'WEBVTT\n\n';
  
  cues.forEach(cue => {
    const startTime = formatTimeForVTT(cue.startTime);
    const endTime = formatTimeForVTT(cue.endTime);
    
    vttContent += `${startTime} --> ${endTime}\n`;
    vttContent += `${cue.text}\n\n`;
  });
  
  return vttContent;
}

function formatTimeForSRT(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function formatTimeForVTT(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}
