const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateUser } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

// Public routes
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);

// Agent registration (protected — only authenticated users can register agents)
router.post('/agent/register', authenticateUser, authController.registerAgent);

// Get current user profile
router.get('/me', authenticateUser, authController.getProfile);

module.exports = router;




