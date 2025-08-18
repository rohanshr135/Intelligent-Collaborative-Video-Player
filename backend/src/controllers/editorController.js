import editorService from '../services/editorService.js';
import logger from '../utils/logger.js';

/**
 * Create a new editor project
 */
export const createProject = async (req, res) => {
  try {
    const { name, videoId, userId } = req.body;
    
    if (!name || !videoId) {
      return res.status(400).json({ error: 'Project name and video ID are required' });
    }
    
    const project = await editorService.createProject({ name, videoId, userId });
    
    logger.info(`Editor project created: ${project.id} for video ${videoId}`);
    res.status(201).json(project);
  } catch (error) {
    logger.error('Error creating editor project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
};

/**
 * Get editor project by ID
 */
export const getProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const project = await editorService.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    logger.error('Error fetching editor project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
};

/**
 * Add scene marker to project
 */
export const addSceneMarker = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { timestamp, label, type, metadata } = req.body;
    
    if (timestamp === undefined || !label) {
      return res.status(400).json({ error: 'Timestamp and label are required' });
    }
    
    const marker = await editorService.addSceneMarker(projectId, {
      timestamp,
      label,
      type: type || 'scene',
      metadata
    });
    
    res.status(201).json(marker);
  } catch (error) {
    logger.error('Error adding scene marker:', error);
    res.status(500).json({ error: 'Failed to add scene marker' });
  }
};

/**
 * Get scene markers for project
 */
export const getSceneMarkers = async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const markers = await editorService.getSceneMarkers(projectId);
    
    res.json(markers);
  } catch (error) {
    logger.error('Error fetching scene markers:', error);
    res.status(500).json({ error: 'Failed to fetch scene markers' });
  }
};

/**
 * Update scene marker
 */
export const updateSceneMarker = async (req, res) => {
  try {
    const { markerId } = req.params;
    const updates = req.body;
    
    const marker = await editorService.updateSceneMarker(markerId, updates);
    
    if (!marker) {
      return res.status(404).json({ error: 'Scene marker not found' });
    }
    
    res.json(marker);
  } catch (error) {
    logger.error('Error updating scene marker:', error);
    res.status(500).json({ error: 'Failed to update scene marker' });
  }
};

/**
 * Delete scene marker
 */
export const deleteSceneMarker = async (req, res) => {
  try {
    const { markerId } = req.params;
    
    await editorService.deleteSceneMarker(markerId);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting scene marker:', error);
    res.status(500).json({ error: 'Failed to delete scene marker' });
  }
};

/**
 * Generate AI-suggested cut points
 */
export const generateCutSuggestions = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { targetDuration, style } = req.body;
    
    const suggestions = await editorService.generateCutSuggestions(projectId, {
      targetDuration,
      style
    });
    
    res.json(suggestions);
  } catch (error) {
    logger.error('Error generating cut suggestions:', error);
    res.status(500).json({ error: 'Failed to generate cut suggestions' });
  }
};

/**
 * Export project in specified format
 */
export const exportProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { format = 'json', includeVideo = false } = req.body;
    
    const exportResult = await editorService.exportProject(projectId, format, includeVideo);
    
    if (format === 'download' && exportResult.downloadUrl) {
      res.redirect(exportResult.downloadUrl);
    } else {
      res.json(exportResult);
    }
  } catch (error) {
    logger.error('Error exporting project:', error);
    res.status(500).json({ error: 'Failed to export project' });
  }
};

/**
 * Import project from file
 */
export const importProject = async (req, res) => {
  try {
    const file = req.file;
    const { userId } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'Project file is required' });
    }
    
    const project = await editorService.importProject(file, userId);
    
    res.status(201).json(project);
  } catch (error) {
    logger.error('Error importing project:', error);
    res.status(500).json({ error: 'Failed to import project' });
  }
};

/**
 * Get user's editor projects
 */
export const getUserProjects = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const projects = await editorService.getUserProjects(userId, page, limit);
    
    res.json(projects);
  } catch (error) {
    logger.error('Error fetching user projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

/**
 * Update project metadata
 */
export const updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const updates = req.body;
    
    const project = await editorService.updateProject(projectId, updates);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    logger.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
};

/**
 * Delete project
 */
export const deleteProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userId } = req.body;
    
    await editorService.deleteProject(projectId, userId);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
};

/**
 * Generate timeline thumbnail preview
 */
export const generateTimelineThumbnails = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { interval = 10 } = req.query; // seconds
    
    const jobId = await editorService.generateTimelineThumbnails(projectId, parseInt(interval));
    
    res.status(202).json({ jobId, status: 'generating' });
  } catch (error) {
    logger.error('Error generating timeline thumbnails:', error);
    res.status(500).json({ error: 'Failed to generate thumbnails' });
  }
};
