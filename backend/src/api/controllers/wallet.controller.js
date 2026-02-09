const walletClient = require('../../services/wallet/wallet.client');
const Transaction = require('../../models/Transaction');
const User = require('../../models/User');
const { AppError } = require('../middleware/errorHandler');

/**
 * Get wallet balance for authenticated user
 * GET /api/v1/wallet/balance
 */
const getBalance = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user.walletAddress) {
      throw new AppError('No wallet connected', 400, 'NO_WALLET');
    }

    const balance = await walletClient.getBalance(user.walletAddress);

    res.json({
      success: true,
      data: {
        address: user.walletAddress,
        balance: balance.balance,
        currency: balance.currency,
        balanceUSD: balance.balanceUSD,
        lastUpdated: balance.lastUpdated,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get transaction history for authenticated user
 * GET /api/v1/wallet/transactions
 */
const getTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type } = req.query;

    const filter = { userId: req.user._id };
    if (type) filter.type = type;

    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('orderId', 'orderId product.title');

    const total = await Transaction.countDocuments(filter);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific transaction status
 * GET /api/v1/wallet/transactions/:transactionId
 */
const getTransactionStatus = async (req, res, next) => {
  try {
    const { transactionId } = req.params;

    // Check our DB first
    const localTx = await Transaction.findOne({
      transactionId,
      userId: req.user._id,
    });

    if (!localTx) {
      throw new AppError('Transaction not found', 404, 'TX_NOT_FOUND');
    }

    // Get live status from wallet API
    let walletStatus = null;
    if (localTx.walletTransactionId) {
      try {
        walletStatus = await walletClient.getTransactionStatus(localTx.walletTransactionId);
      } catch {
        // Wallet API might be unavailable, return local data
      }
    }

    res.json({
      success: true,
      data: {
        transaction: localTx,
        walletStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getBalance, getTransactions, getTransactionStatus };


