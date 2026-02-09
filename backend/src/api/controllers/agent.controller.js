const searchService = require('../../services/search/search.service');
const purchaseService = require('../../services/purchase/purchase.service');
const walletClient = require('../../services/wallet/wallet.client');
const learningService = require('../../services/intelligence/learning.service');
const User = require('../../models/User');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../../utils/logger');

/**
 * Agent: Search products
 * POST /api/v1/agent/search
 */
const searchProducts = async (req, res, next) => {
  try {
    const { user_id, query, filters = {}, limit = 10 } = req.body;

    if (!user_id || !query) {
      throw new AppError('user_id and query are required', 400, 'VALIDATION_ERROR');
    }

    // Verify user exists and agent is authorized
    const user = await User.findById(user_id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Execute search
    const results = await searchService.search(query, filters, limit);

    // Score products based on user preferences
    const scoredProducts = await Promise.all(
      results.products.map(async (product) => {
        const relevanceScore = await learningService.scoreProduct(user_id, product);
        return { ...product.toObject ? product.toObject() : product, relevanceScore };
      })
    );

    // Sort by relevance score (highest first)
    scoredProducts.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Record search for learning
    await learningService.recordSearch(user_id, query, filters);

    // Update agent stats
    logger.info(`Agent ${req.agent.id} searched for "${query}" for user ${user_id}`);

    res.json({
      success: true,
      data: {
        products: scoredProducts,
        meta: {
          ...results.meta,
          personalizedFor: user_id,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Agent: Initiate purchase
 * POST /api/v1/agent/purchase
 */
const initiatePurchase = async (req, res, next) => {
  try {
    const {
      user_id,
      product_id,
      shipping_address_id,
      auto_approve = false,
    } = req.body;

    if (!user_id || !product_id) {
      throw new AppError('user_id and product_id are required', 400, 'VALIDATION_ERROR');
    }

    const order = await purchaseService.initiatePurchase({
      userId: user_id,
      productId: product_id,
      shippingAddressId: shipping_address_id,
      autoApprove: auto_approve,
      agentId: req.agent.id,
      agentConversationId: req.body.conversation_id,
    });

    logger.info(`Agent ${req.agent.id} initiated purchase for user ${user_id}`);

    res.status(201).json({
      success: true,
      data: {
        order: {
          orderId: order.orderId,
          status: order.status,
          product: order.product,
          payment: {
            amount: order.payment.amount,
            currency: order.payment.currency,
          },
          requiresApproval: order.status === 'pending_approval',
          message: order.status === 'pending_approval'
            ? 'Order requires user approval. User will be notified.'
            : 'Order auto-approved and processing.',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Agent: Get order status
 * GET /api/v1/agent/orders/:orderId
 */
const getOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await purchaseService.getOrder(orderId);
    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    res.json({
      success: true,
      data: {
        orderId: order.orderId,
        status: order.status,
        product: order.product,
        payment: order.payment,
        tracking: order.tracking,
        statusHistory: order.statusHistory,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Agent: Check wallet balance
 * GET /api/v1/agent/wallet/:userId/balance
 */
const getWalletBalance = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (!user.walletAddress) {
      throw new AppError('User has no wallet connected', 400, 'NO_WALLET');
    }

    const balance = await walletClient.getBalance(user.walletAddress);

    res.json({
      success: true,
      data: {
        userId,
        wallet: {
          address: user.walletAddress,
          balance: balance.balance,
          currency: balance.currency,
          balanceUSD: balance.balanceUSD,
          lastUpdated: balance.lastUpdated,
        },
        spendingLimits: {
          daily: user.preferences.spendingLimit.daily,
          monthly: user.preferences.spendingLimit.monthly,
          autoApproveBelow: user.preferences.maxAutoApprove,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Agent: Get user profile (sizes, preferences, addresses)
 * GET /api/v1/agent/users/:userId/profile
 *
 * This is the key endpoint that lets agents know user's sizes, addresses, etc.
 */
const getUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    res.json({
      success: true,
      data: {
        userId: user._id,
        name: user.name,
        profile: {
          phone: user.profile?.phone,
          sizes: user.profile?.sizes || {},
          gender: user.profile?.gender,
          dietaryPreferences: user.profile?.dietaryPreferences || [],
          allergies: user.profile?.allergies || [],
          notes: user.profile?.notes,
        },
        preferences: {
          favoriteCategories: user.preferences?.favoriteCategories || [],
          preferredBrands: user.preferences?.preferredBrands || [],
          requireApproval: user.preferences?.requireApproval,
          maxAutoApprove: user.preferences?.maxAutoApprove,
        },
        shippingAddresses: user.shippingAddresses.map((addr) => ({
          id: addr._id,
          label: addr.label,
          fullName: addr.fullName,
          street: addr.street,
          city: addr.city,
          state: addr.state,
          zipCode: addr.zipCode,
          country: addr.country,
          phone: addr.phone,
          isDefault: addr.isDefault,
        })),
        hasWallet: !!user.walletAddress,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  searchProducts,
  initiatePurchase,
  getOrderStatus,
  getWalletBalance,
  getUserProfile,
};

