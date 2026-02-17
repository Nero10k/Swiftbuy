const karmaClient = require('../../services/wallet/wallet.client');
const Transaction = require('../../models/Transaction');
const User = require('../../models/User');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../../utils/logger');

/**
 * Connect an existing Karma account — user already has sk_live key
 * POST /api/v1/wallet/connect
 */
const connectExisting = async (req, res, next) => {
  try {
    const { skLive } = req.body;

    if (!skLive || !skLive.startsWith('sk_live_')) {
      throw new AppError(
        'A valid Karma owner key (sk_live_...) is required.',
        400,
        'VALIDATION_ERROR'
      );
    }

    const user = await User.findById(req.user._id);

    // If already connected with this key, tell them
    if (user.karma?.skLive === skLive) {
      const status = karmaClient.checkStatus(user);
      return res.json({
        success: true,
        data: {
          alreadyConnected: true,
          ...status,
          message: 'This Karma account is already connected.',
        },
      });
    }

    logger.info(`Connecting existing Karma account for user ${user._id}`);

    // 1. Verify the key works by checking KYC status
    const { status: kycStatus } = await karmaClient.getKycStatus(skLive);

    // 2. Save owner key + KYC status
    user.karma = {
      ...user.karma,
      skLive,
      kycStatus: kycStatus || 'none',
    };

    // 3. If KYC is approved, try to pull in existing cards
    if (kycStatus === 'approved') {
      try {
        const cards = await karmaClient.listCards(skLive);
        const cardList = cards.cards || cards || [];

        if (cardList.length > 0) {
          // Use the first card (or the one named "Swiftbuy" if it exists)
          const swiftbuyCard = cardList.find((c) => c.name?.toLowerCase().includes('swiftbuy'));
          const card = swiftbuyCard || cardList[0];

          user.karma.cardId = card.card_id || card.id;
          user.karma.skAgent = card.agent_api_key || card.sk_agent;
          user.karma.depositAddress = card.deposit_address;
          user.karma.cardLast4 = card.last4;
          user.karma.cardFrozen = card.frozen || false;
          user.walletAddress = card.deposit_address;

          logger.info(`Imported existing Karma card ****${card.last4} for user ${user._id}`);
        } else {
          // KYC approved but no card yet — create one for Swiftbuy
          const newCard = await karmaClient.createCard(skLive, {
            name: `Swiftbuy - ${user.name}`,
            perTxnLimit: 500,
            dailyLimit: 1000,
            monthlyLimit: 5000,
          });

          user.karma.cardId = newCard.cardId;
          user.karma.skAgent = newCard.skAgent;
          user.karma.depositAddress = newCard.depositAddress;
          user.karma.cardLast4 = newCard.last4;
          user.walletAddress = newCard.depositAddress;

          logger.info(`Created Swiftbuy card ****${newCard.last4} for existing Karma user ${user._id}`);
        }
      } catch (cardError) {
        logger.warn(`Could not import/create card: ${cardError.message}`);
      }
    } else {
      // KYC not yet approved — user needs to complete it on Karma dashboard
      logger.info(`Karma account connected for user ${user._id} but KYC is ${kycStatus}. User should complete KYC at agents.karmapay.xyz`);
    }

    await user.save();

    const status = karmaClient.checkStatus(user);

    res.json({
      success: true,
      data: {
        ...status,
        kycStatus: user.karma.kycStatus,
        kycUrl: user.karma.kycUrl || null,
        cardLast4: user.karma.cardLast4 || null,
        depositAddress: user.karma.depositAddress || null,
        message: status.ready
          ? `Karma account connected! Card ****${user.karma.cardLast4} is ready to spend.`
          : kycStatus === 'approved'
          ? 'Karma account connected. Setting up your card...'
          : 'Karma account connected. Complete KYC verification at agents.karmapay.xyz to activate your card.',
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

    if (!user.karma?.skLive) {
      throw new AppError('No Karma wallet connected. Connect your Karma account at POST /wallet/connect.', 400, 'NO_KARMA_ACCOUNT');
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
  connectExisting,
  getKycStatus,
  getBalance,
  getTransactions,
  getTransactionStatus,
  freezeCard,
  unfreezeCard,
  updateLimits,
  getWalletStatus,
};
