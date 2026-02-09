const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agent.controller');
const { authenticateAgent, requirePermission } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiter');

// All agent routes require agent authentication
router.use(authenticateAgent);

// Search products
router.post(
  '/search',
  requirePermission('search'),
  searchLimiter,
  agentController.searchProducts
);

// Initiate purchase
router.post(
  '/purchase',
  requirePermission('purchase'),
  agentController.initiatePurchase
);

// Get order status
router.get(
  '/orders/:orderId',
  agentController.getOrderStatus
);

// Check wallet balance
router.get(
  '/wallet/:userId/balance',
  requirePermission('wallet_read'),
  agentController.getWalletBalance
);

// Get user profile (sizes, preferences, addresses)
router.get(
  '/users/:userId/profile',
  agentController.getUserProfile
);

module.exports = router;

