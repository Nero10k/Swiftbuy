const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');
const { authenticateUser } = require('../middleware/auth');

// All wallet routes require user authentication
router.use(authenticateUser);

// Karma setup & KYC
router.post('/setup', walletController.setupKarma);           // New users
router.post('/connect', walletController.connectExisting);     // Existing Karma users
router.get('/kyc-status', walletController.getKycStatus);

// Wallet status (for dashboard)
router.get('/status', walletController.getWalletStatus);

// Balance
router.get('/balance', walletController.getBalance);

// Transactions
router.get('/transactions', walletController.getTransactions);
router.get('/transactions/:transactionId', walletController.getTransactionStatus);

// Card management
router.post('/freeze', walletController.freezeCard);
router.post('/unfreeze', walletController.unfreezeCard);
router.patch('/limits', walletController.updateLimits);

module.exports = router;
