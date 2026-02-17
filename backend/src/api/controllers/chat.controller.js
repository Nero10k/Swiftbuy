const chatService = require('../../services/chat/chat.service');
const ChatMessage = require('../../models/ChatMessage');
const { AppError } = require('../middleware/errorHandler');
const { generateId } = require('../../utils/helpers');

/**
 * Chat: Send a message
 * POST /api/v1/chat/message
 */
const sendMessage = async (req, res, next) => {
  try {
    const { message, conversationId } = req.body;

    if (!message || !message.trim()) {
      throw new AppError('Message is required', 400, 'VALIDATION_ERROR');
    }

    // Use existing conversation or create new one
    const convId = conversationId || `conv_${generateId('')}`;

    const response = await chatService.processMessage(
      req.user._id,
      convId,
      message.trim()
    );

    res.json({
      success: true,
      data: {
        conversationId: convId,
        message: response,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Chat: Get welcome message for new conversation
 * GET /api/v1/chat/welcome
 */
const getWelcome = async (req, res, next) => {
  try {
    const welcome = await chatService.getWelcomeMessage(req.user._id);

    res.json({
      success: true,
      data: {
        conversationId: `conv_${generateId('')}`,
        message: welcome,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Chat: Get conversation history
 * GET /api/v1/chat/conversations/:conversationId
 */
const getConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    const messages = await ChatMessage.getConversation(conversationId, 100);

    // Verify ownership
    if (messages.length > 0 && messages[0].userId.toString() !== req.user._id.toString()) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    res.json({
      success: true,
      data: { messages },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Chat: List user's conversations
 * GET /api/v1/chat/conversations
 */
const listConversations = async (req, res, next) => {
  try {
    const conversations = await ChatMessage.getUserConversations(req.user._id);

    res.json({
      success: true,
      data: { conversations },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendMessage,
  getWelcome,
  getConversation,
  listConversations,
};



