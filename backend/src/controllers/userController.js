import userService from '../services/userService.js';
import logger from '../utils/logger.js';

/**
 * Create a new user account
 */
export const createUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    
    const user = await userService.createUser({ username, email, password });
    
    logger.info(`User created: ${user.id} (${user.email})`);
    res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt
    });
  } catch (error) {
    logger.error('Error creating user:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to create user' });
  }
};

/**
 * User login
 */
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const result = await userService.authenticateUser(email, password);
    
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }
    
    logger.info(`User logged in: ${result.user.id} (${result.user.email})`);
    res.json({
      user: {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email
      },
      token: result.token,
      refreshToken: result.refreshToken
    });
  } catch (error) {
    logger.error('Error during login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

/**
 * Get user profile
 */
export const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await userService.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      preferences: user.preferences
    });
  } catch (error) {
    logger.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

/**
 * Update user profile
 */
export const updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    // Remove sensitive fields that shouldn't be updated via this endpoint
    delete updates.password;
    delete updates.email;
    delete updates.id;
    
    const user = await userService.updateUser(userId, updates);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      preferences: user.preferences
    });
  } catch (error) {
    logger.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
};

/**
 * Change user password
 */
export const changePassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }
    
    const result = await userService.changePassword(userId, currentPassword, newPassword);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    logger.info(`Password changed for user: ${userId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

/**
 * Get user's viewing history
 */
export const getViewingHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const history = await userService.getViewingHistory(userId, page, limit);
    
    res.json(history);
  } catch (error) {
    logger.error('Error fetching viewing history:', error);
    res.status(500).json({ error: 'Failed to fetch viewing history' });
  }
};

/**
 * Update user preferences
 */
export const updatePreferences = async (req, res) => {
  try {
    const { userId } = req.params;
    const { preferences } = req.body;
    
    const user = await userService.updatePreferences(userId, preferences);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ preferences: user.preferences });
  } catch (error) {
    logger.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
};

/**
 * Delete user account
 */
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password confirmation is required' });
    }
    
    const result = await userService.deleteUser(userId, password);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    logger.info(`User deleted: ${userId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

/**
 * Refresh authentication token
 */
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    
    const result = await userService.refreshAuthToken(refreshToken);
    
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }
    
    res.json({
      token: result.token,
      refreshToken: result.refreshToken
    });
  } catch (error) {
    logger.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
};

/**
 * User logout
 */
export const logoutUser = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      await userService.revokeRefreshToken(refreshToken);
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error during logout:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};
