import { ChatMessage } from '../models/ChatMessage.js';
import logger from '../utils/logger.js';

// Get io instance from app
let io;
export const setSocketIO = (ioInstance) => {
  io = ioInstance;
};

/**
 * Send a chat message
 */
export const sendMessage = async (req, res) => {
  try {
    const { roomCode, userId, username, message, videoTimestamp } = req.body;
    
    if (!roomCode || !userId || !username || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: roomCode, userId, username, message' 
      });
    }

    // Detect timestamp references in message
    const timestampRegex = /@(\d{1,2}):(\d{2})/g;
    let referencedTimestamp = null;
    let messageType = 'text';
    
    const timestampMatch = message.match(timestampRegex);
    if (timestampMatch) {
      const timeStr = timestampMatch[0].substring(1); // Remove @
      const [minutes, seconds] = timeStr.split(':').map(Number);
      referencedTimestamp = minutes * 60 + seconds;
      messageType = 'timestamp';
    }
    
    const chatMessage = new ChatMessage({
      roomCode,
      userId,
      username,
      message,
      videoTimestamp,
      messageType,
      referencedTimestamp
    });
    
    await chatMessage.save();
    
    // Broadcast to all room participants via Socket.IO
    if (io) {
      io.to(roomCode).emit('chat:message', {
        _id: chatMessage._id,
        roomCode: chatMessage.roomCode,
        userId: chatMessage.userId,
        username: chatMessage.username,
        message: chatMessage.message,
        videoTimestamp: chatMessage.videoTimestamp,
        messageType: chatMessage.messageType,
        referencedTimestamp: chatMessage.referencedTimestamp,
        timestamp: chatMessage.timestamp,
        isEdited: chatMessage.isEdited
      });
    }
    
    logger.info(`💬 Chat message sent in room ${roomCode} by ${username}`);
    
    res.status(201).json({
      success: true,
      message: chatMessage
    });
  } catch (error) {
    logger.error(`❌ Error sending chat message: ${error.message}`);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

/**
 * Get chat messages for a room
 */
export const getMessages = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { limit = 50, before } = req.query;
    
    let query = { roomCode };
    
    if (before) {
      query.timestamp = { $lt: new Date(before) };
    }
    
    const messages = await ChatMessage.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
    
    res.json({
      messages: messages.reverse() // Return in chronological order
    });
  } catch (error) {
    logger.error(`❌ Error fetching chat messages: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

/**
 * Edit a chat message
 */
export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId, newMessage } = req.body;
    
    if (!userId || !newMessage) {
      return res.status(400).json({ 
        error: 'Missing userId or newMessage' 
      });
    }

    const message = await ChatMessage.findById(messageId);
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (message.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to edit this message' });
    }
    
    message.message = newMessage;
    message.isEdited = true;
    message.editedAt = new Date();
    
    await message.save();
    
    logger.info(`✏️ Chat message edited: ${messageId}`);
    
    res.json({
      success: true,
      message
    });
  } catch (error) {
    logger.error(`❌ Error editing chat message: ${error.message}`);
    res.status(500).json({ error: 'Failed to edit message' });
  }
};

/**
 * Delete a chat message
 */
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId } = req.body;
    
    const message = await ChatMessage.findById(messageId);
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (message.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete this message' });
    }
    
    await ChatMessage.findByIdAndDelete(messageId);
    
    logger.info(`🗑️ Chat message deleted: ${messageId}`);
    
    res.json({
      success: true,
      message: 'Message deleted'
    });
  } catch (error) {
    logger.error(`❌ Error deleting chat message: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

/**
 * Get chat statistics for a room
 */
export const getChatStats = async (req, res) => {
  try {
    const { roomCode } = req.params;
    
    const stats = await ChatMessage.aggregate([
      { $match: { roomCode } },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
          timestampReferences: {
            $sum: {
              $cond: [{ $eq: ['$messageType', 'timestamp'] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalMessages: 1,
          uniqueUserCount: { $size: '$uniqueUsers' },
          timestampReferences: 1
        }
      }
    ]);
    
    const result = stats[0] || {
      totalMessages: 0,
      uniqueUserCount: 0,
      timestampReferences: 0
    };
    
    res.json({
      chatStats: result
    });
  } catch (error) {
    logger.error(`❌ Error fetching chat stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch chat statistics' });
  }
};
