const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { authenticateUser } = require('../middleware/auth');

// All chat routes require user authentication
router.use(authenticateUser);

// Welcome message (new conversation)
router.get('/welcome', chatController.getWelcome);

// Send a message
router.post('/message', chatController.sendMessage);

// List conversations
router.get('/conversations', chatController.listConversations);

// Get a specific conversation
router.get('/conversations/:conversationId', chatController.getConversation);

module.exports = router;



