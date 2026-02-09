const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');
const { authenticateUser } = require('../middleware/auth');

// All wallet routes require user authentication
router.use(authenticateUser);

// Get balance
router.get('/balance', walletController.getBalance);

// Get transactions
router.get('/transactions', walletController.getTransactions);

// Get specific transaction
router.get('/transactions/:transactionId', walletController.getTransactionStatus);

module.exports = router;


