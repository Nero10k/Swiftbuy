const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticateUser } = require('../middleware/auth');

// All user routes require authentication
router.use(authenticateUser);

// Onboarding
router.post('/onboarding', userController.completeOnboarding);

// Dashboard
router.get('/dashboard', userController.getDashboard);

// Orders
router.get('/orders', userController.getOrders);
router.post('/orders/:orderId/approve', userController.approveOrder);
router.post('/orders/:orderId/reject', userController.rejectOrder);

// Transactions
router.get('/transactions', userController.getTransactions);

// Settings
router.patch('/settings', userController.updateSettings);

// Addresses
router.post('/addresses', userController.addAddress);

// Wallet
router.post('/wallet/connect', userController.connectWallet);

// Agents
router.get('/agents', userController.getAgents);
router.post('/agents', userController.registerAgent);
router.delete('/agents/:agentId', userController.deleteAgent);

module.exports = router;

