const karmaClient = require('../../services/wallet/wallet.client');
const Transaction = require('../../models/Transaction');
const User = require('../../models/User');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../../utils/logger');

/**
 * Setup Karma Wallet — register + start KYC
 * POST /api/v1/wallet/setup
 */
const setupKarma = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    // If already registered, just return status
    if (user.karma?.accountId) {
      const status = karmaClient.checkStatus(user);
      return res.json({
        success: true,
        data: {
          alreadyRegistered: true,
          ...status,
          kycUrl: user.karma.kycUrl,
          kycStatus: user.karma.kycStatus,
        },
      });
    }

    // 1. Register with Karma
    logger.info(`Setting up Karma wallet for user ${user._id} (${user.email})`);
    const { accountId, skLive } = await karmaClient.register(user.email);

    // 2. Start KYC
    const { status: kycStatus, kycUrl } = await karmaClient.startKyc(skLive);

    // 3. Save to user
    user.karma = {
      accountId,
      skLive,
      kycStatus: kycStatus || 'pending_verification',
      kycUrl,
    };
    await user.save();

    logger.info(`Karma wallet created for user ${user._id}: account=${accountId}`);

    res.status(201).json({
      success: true,
      data: {
        accountId,
        kycStatus: user.karma.kycStatus,
        kycUrl,
        message: 'Karma account created. Complete KYC to enable spending.',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check KYC status and auto-create card if approved
 * GET /api/v1/wallet/kyc-status
 */
const getKycStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.karma?.accountId) {
      throw new AppError('Karma wallet not set up. Call POST /wallet/setup first.', 400, 'NO_KARMA_ACCOUNT');
    }

    // Poll Karma for latest KYC status
    const { status } = await karmaClient.getKycStatus(user.karma.skLive);

    // Update if changed
    if (status !== user.karma.kycStatus) {
      user.karma.kycStatus = status;
      await user.save();
      logger.info(`KYC status updated for user ${user._id}: ${status}`);
    }

    // If just approved and no card yet, auto-create one
    if (status === 'approved' && !user.karma.cardId) {
      try {
        const card = await karmaClient.createCard(user.karma.skLive, {
          name: `Swiftbuy - ${user.name}`,
          perTxnLimit: user.karma.perTxnLimit || 500,
          dailyLimit: user.karma.dailyLimit || 1000,
          monthlyLimit: user.karma.monthlyLimit || 5000,
        });

        user.karma.cardId = card.cardId;
        user.karma.skAgent = card.skAgent;
        user.karma.depositAddress = card.depositAddress;
        user.karma.cardLast4 = card.last4;

        // Also set legacy walletAddress for backwards compat
        user.walletAddress = card.depositAddress;
        await user.save();

        logger.info(`Karma card created for user ${user._id}: card=****${card.last4}`);

        return res.json({
          success: true,
          data: {
            kycStatus: 'approved',
            cardCreated: true,
            cardLast4: card.last4,
            depositAddress: card.depositAddress,
            message: 'KYC approved! Card created. Send USDC to your deposit address to start spending.',
          },
        });
      } catch (cardError) {
        logger.error(`Failed to auto-create card: ${cardError.message}`);
        // KYC is still approved, card creation failed — user can retry
      }
    }

    res.json({
      success: true,
      data: {
        kycStatus: status,
        kycUrl: user.karma.kycUrl,
        cardId: user.karma.cardId || null,
        cardLast4: user.karma.cardLast4 || null,
        depositAddress: user.karma.depositAddress || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get wallet balance (real from Karma)
 * GET /api/v1/wallet/balance
 */
const getBalance = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const status = karmaClient.checkStatus(user);

    if (!status.connected) {
      return res.json({
        success: true,
        data: {
          connected: false,
          balance: 0,
          currency: 'USDC',
          message: 'No Karma wallet connected. Set up your wallet first.',
        },
      });
    }

    if (!status.ready) {
      return res.json({
        success: true,
        data: {
          connected: true,
          ready: false,
          status: status.status,
          balance: 0,
          currency: 'USDC',
          kycStatus: user.karma.kycStatus,
          message: status.status === 'card_frozen'
            ? 'Your card is frozen. Unfreeze it to continue spending.'
            : 'Complete setup to view your balance.',
        },
      });
    }

    // Fetch real balance from Karma
    const balance = await karmaClient.getBalance(user.karma.skAgent);

    res.json({
      success: true,
      data: {
        connected: true,
        ready: true,
        balance: balance.available,
        totalBalance: balance.balance,
        currency: 'USDC',
        balanceUSD: balance.balanceUSD,
        depositAddress: balance.depositAddress || user.karma.depositAddress,
        cardLast4: user.karma.cardLast4,
        dailyRemaining: balance.dailyRemaining,
        monthlyRemaining: balance.monthlyRemaining,
        cardFrozen: user.karma.cardFrozen || false,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get transaction history from Karma
 * GET /api/v1/wallet/transactions
 */
const getTransactions = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const { limit = 20 } = req.query;

    // If Karma is connected, fetch from Karma
    if (user.karma?.skAgent) {
      try {
        const karmaTransactions = await karmaClient.getTransactions(user.karma.skAgent, parseInt(limit));

        return res.json({
          success: true,
          data: {
            transactions: karmaTransactions.transactions || karmaTransactions || [],
            source: 'karma',
          },
        });
      } catch (karmaErr) {
        logger.warn(`Karma transactions unavailable, falling back to local: ${karmaErr.message}`);
      }
    }

    // Fallback: local transaction records
    const transactions = await Transaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('orderId', 'orderId product.title');

    const total = await Transaction.countDocuments({ userId: req.user._id });

    res.json({
      success: true,
      data: {
        transactions,
        source: 'local',
        pagination: { total },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get specific transaction status
 * GET /api/v1/wallet/transactions/:transactionId
 */
const getTransactionStatus = async (req, res, next) => {
  try {
    const { transactionId } = req.params;

    const localTx = await Transaction.findOne({
      transactionId,
      userId: req.user._id,
    });

    if (!localTx) {
      throw new AppError('Transaction not found', 404, 'TX_NOT_FOUND');
    }

    res.json({
      success: true,
      data: { transaction: localTx },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Freeze card
 * POST /api/v1/wallet/freeze
 */
const freezeCard = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.karma?.cardId || !user.karma?.skLive) {
      throw new AppError('No Karma card to freeze', 400, 'NO_CARD');
    }

    await karmaClient.freezeCard(user.karma.skLive, user.karma.cardId);

    user.karma.cardFrozen = true;
    await user.save();

    logger.info(`Card frozen for user ${user._id}`);

    res.json({
      success: true,
      data: { cardFrozen: true, message: 'Card frozen. No purchases can be made.' },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unfreeze card
 * POST /api/v1/wallet/unfreeze
 */
const unfreezeCard = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.karma?.cardId || !user.karma?.skLive) {
      throw new AppError('No Karma card to unfreeze', 400, 'NO_CARD');
    }

    await karmaClient.unfreezeCard(user.karma.skLive, user.karma.cardId);

    user.karma.cardFrozen = false;
    await user.save();

    logger.info(`Card unfrozen for user ${user._id}`);

    res.json({
      success: true,
      data: { cardFrozen: false, message: 'Card unfrozen. Purchases are enabled.' },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update card limits
 * PATCH /api/v1/wallet/limits
 */
const updateLimits = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const { perTxnLimit, dailyLimit, monthlyLimit } = req.body;

    if (!user.karma?.cardId || !user.karma?.skLive) {
      throw new AppError('No Karma card to update', 400, 'NO_CARD');
    }

    const updates = {};
    if (perTxnLimit !== undefined) updates.per_txn_limit = perTxnLimit;
    if (dailyLimit !== undefined) updates.daily_limit = dailyLimit;
    if (monthlyLimit !== undefined) updates.monthly_limit = monthlyLimit;

    if (Object.keys(updates).length === 0) {
      throw new AppError('No limit updates provided', 400, 'VALIDATION_ERROR');
    }

    await karmaClient.updateCardLimits(user.karma.skLive, user.karma.cardId, updates);

    // Save locally too
    if (perTxnLimit !== undefined) user.karma.perTxnLimit = perTxnLimit;
    if (dailyLimit !== undefined) user.karma.dailyLimit = dailyLimit;
    if (monthlyLimit !== undefined) user.karma.monthlyLimit = monthlyLimit;
    await user.save();

    logger.info(`Card limits updated for user ${user._id}`, updates);

    res.json({
      success: true,
      data: {
        perTxnLimit: user.karma.perTxnLimit,
        dailyLimit: user.karma.dailyLimit,
        monthlyLimit: user.karma.monthlyLimit,
        message: 'Card limits updated.',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get full wallet status (for dashboard)
 * GET /api/v1/wallet/status
 */
const getWalletStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const status = karmaClient.checkStatus(user);

    res.json({
      success: true,
      data: {
        ...status,
        kycStatus: user.karma?.kycStatus || 'none',
        kycUrl: user.karma?.kycUrl || null,
        cardLast4: user.karma?.cardLast4 || null,
        depositAddress: user.karma?.depositAddress || null,
        cardFrozen: user.karma?.cardFrozen || false,
        perTxnLimit: user.karma?.perTxnLimit || 500,
        dailyLimit: user.karma?.dailyLimit || 1000,
        monthlyLimit: user.karma?.monthlyLimit || 5000,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  setupKarma,
  getKycStatus,
  getBalance,
  getTransactions,
  getTransactionStatus,
  freezeCard,
  unfreezeCard,
  updateLimits,
  getWalletStatus,
};
