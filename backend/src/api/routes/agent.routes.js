const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agent.controller');
const { authenticateAgent, requirePermission } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiter');

// All agent routes require agent authentication
router.use(authenticateAgent);

// Agent identity — who am I and who is my user?
// This should be the FIRST call any agent makes
router.get('/me', agentController.getAgentIdentity);

// Search products & services
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

// Approve order (in-chat approval — agent approves on behalf of user)
router.post(
  '/orders/:orderId/approve',
  requirePermission('purchase'),
  agentController.approveOrder
);

// Reject order (in-chat rejection — agent rejects on behalf of user)
router.post(
  '/orders/:orderId/reject',
  requirePermission('purchase'),
  agentController.rejectOrder
);

// Get order status
router.get(
  '/orders/:orderId',
  agentController.getOrderStatus
);

// Get user's recent orders
router.get(
  '/users/:userId/orders',
  agentController.getUserOrders
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
