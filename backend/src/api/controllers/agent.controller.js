const searchService = require('../../services/search/search.service');
const purchaseService = require('../../services/purchase/purchase.service');
const walletClient = require('../../services/wallet/wallet.client');
const learningService = require('../../services/intelligence/learning.service');
const User = require('../../models/User');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../../utils/logger');
const { getUserCountry, getGeoForCountry } = require('../../utils/geo');

/**
 * Agent: Search products & services
 * POST /api/v1/agent/search
 */
const searchProducts = async (req, res, next) => {
  try {
    const { user_id, query, filters = {}, limit = 10 } = req.body;

    if (!user_id || !query) {
      throw new AppError('user_id and query are required', 400, 'VALIDATION_ERROR');
    }

    const user = await User.findById(user_id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Determine the user's country from their shipping address for geo-aware search
    const userCountry = getUserCountry(user.shippingAddresses);
    const geo = getGeoForCountry(userCountry);

    logger.info(`Geo-aware search: user country=${userCountry} → gl=${geo.gl}, hl=${geo.hl}, currency=${geo.currency}`);

    const results = await searchService.search(query, filters, limit, {}, geo);

    // Score products based on user preferences
    const scoredProducts = await Promise.all(
      results.products.map(async (product) => {
        const relevanceScore = await learningService.scoreProduct(user_id, product);
        return { ...product.toObject ? product.toObject() : product, relevanceScore };
      })
    );

    scoredProducts.sort((a, b) => b.relevanceScore - a.relevanceScore);
    await learningService.recordSearch(user_id, query, filters);

    logger.info(`Agent ${req.agent.id} searched for "${query}" for user ${user_id} (${geo.name})`);

    // Build agent-friendly summary with correct currency
    const currSymbol = geo.currencySymbol;
    const topResults = scoredProducts.slice(0, 3);
    let agentSummary = '';
    if (scoredProducts.length === 0) {
      agentSummary = `No results found for "${query}". Try rephrasing or broadening the search.`;
    } else {
      const items = topResults.map((p, i) => {
        const priceDisplay = p.price ? `${currSymbol}${p.price}` : 'N/A';
        let line = `${i + 1}. ${p.title} — ${priceDisplay} from ${p.retailer || 'Web'}`;
        if (p.rating) line += ` (${p.rating} stars)`;
        return line;
      });
      agentSummary = `Found ${scoredProducts.length} results for "${query}" (${geo.name}). Top options: ${items.join(' | ')}`;
    }

    res.json({
      success: true,
      data: {
        products: scoredProducts,
        meta: {
          ...results.meta,
          personalizedFor: user_id,
          geo: {
            country: userCountry,
            countryName: geo.name,
            currency: geo.currency,
            currencySymbol: geo.currencySymbol,
          },
        },
        // Agent instructions — tells the agent what to say to the human
        agentMessage: agentSummary,
        agentInstructions: scoredProducts.length > 0
          ? `Present the top 2-3 options to the user with prices in ${geo.currency} (${geo.currencySymbol}). Ask which one they'd like, or if they want to refine the search. If they pick one, use the /purchase endpoint with the product data.`
          : 'Tell the user no results were found and suggest alternative search terms.',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Agent: Initiate purchase
 * POST /api/v1/agent/purchase
 *
 * The agent should ALWAYS present the item + price to the user first,
 * then call this endpoint. The response tells the agent what to do next.
 */
const initiatePurchase = async (req, res, next) => {
  try {
    const {
      user_id,
      product_id,
      product,
      shipping_address_id,
      auto_approve = false,
    } = req.body;

    if (!user_id) {
      throw new AppError('user_id is required', 400, 'VALIDATION_ERROR');
    }
    if (!product_id && !product) {
      throw new AppError('Either product_id or product data is required', 400, 'VALIDATION_ERROR');
    }

    const order = await purchaseService.initiatePurchase({
      userId: user_id,
      productId: product_id,
      product,
      shippingAddressId: shipping_address_id,
      autoApprove: auto_approve,
      agentId: req.agent.id,
      agentConversationId: req.body.conversation_id,
    });

    logger.info(`Agent ${req.agent.id} initiated purchase for user ${user_id}: ${order.orderId}`);

    const isPending = order.status === 'pending_approval';
    const productTitle = order.product.title;
    const amount = order.payment.amount.toFixed(2);
    const retailer = order.product.retailer;

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
          requiresApproval: isPending,
        },
        // Agent instructions — tells the agent exactly what to do
        agentMessage: isPending
          ? `I've prepared an order for "${productTitle}" at $${amount} from ${retailer}. This needs your approval before I can proceed. Should I go ahead and confirm this purchase?`
          : `Done! I've purchased "${productTitle}" for $${amount} from ${retailer}. The order is confirmed and being processed. Your order ID is ${order.orderId}.`,
        agentInstructions: isPending
          ? `The order is pending approval. ASK THE USER to confirm. If they say yes/confirm/go ahead, call POST /api/v1/agent/orders/${order.orderId}/approve with {"user_id": "${user_id}"}. If they say no/cancel, call POST /api/v1/agent/orders/${order.orderId}/reject.`
          : 'The order was auto-approved and is being processed. Inform the user it\'s confirmed. They can track it on their Swiftbuy dashboard.',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Agent: Approve an order on behalf of the user (in-chat approval)
 * POST /api/v1/agent/orders/:orderId/approve
 *
 * This lets the agent approve a purchase directly from the conversation,
 * without the user needing to visit the dashboard.
 */
const approveOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      throw new AppError('user_id is required', 400, 'VALIDATION_ERROR');
    }

    // Verify user exists
    const user = await User.findById(user_id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const order = await purchaseService.approveOrder(orderId, user._id);

    logger.info(`Agent ${req.agent.id} approved order ${order.orderId} for user ${user_id}`);

    const amount = order.payment.amount.toFixed(2);
    const productTitle = order.product.title;
    const retailer = order.product.retailer;

    res.json({
      success: true,
      data: {
        orderId: order.orderId,
        status: order.status,
        product: order.product,
        payment: {
          amount: order.payment.amount,
          currency: order.payment.currency,
        },
        agentMessage: `Great, confirmed! Your order for "${productTitle}" ($${amount} from ${retailer}) is now being processed. I'll let you know once it's confirmed. Your order ID is ${order.orderId}.`,
        agentInstructions: `The order is now approved and executing. The system will off-ramp USDC and complete the purchase. You can check the status later with GET /api/v1/agent/orders/${order.orderId}. Inform the user their order is confirmed and being processed.`,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Agent: Reject an order on behalf of the user (in-chat rejection)
 * POST /api/v1/agent/orders/:orderId/reject
 */
const rejectOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { user_id, reason } = req.body;

    if (!user_id) {
      throw new AppError('user_id is required', 400, 'VALIDATION_ERROR');
    }

    const user = await User.findById(user_id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const order = await purchaseService.rejectOrder(orderId, user._id, reason || 'Cancelled by user via agent');

    logger.info(`Agent ${req.agent.id} rejected order ${order.orderId} for user ${user_id}`);

    res.json({
      success: true,
      data: {
        orderId: order.orderId,
        status: order.status,
        agentMessage: `No problem — I've cancelled the order for "${order.product.title}". Your wallet hasn't been charged. Would you like me to search for something else?`,
        agentInstructions: 'Order has been cancelled. No payment was made. Ask the user if they want to search for alternatives or do something else.',
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

    // Build human-friendly status message
    const statusMessages = {
      pending_approval: `Your order for "${order.product.title}" ($${order.payment.amount.toFixed(2)}) is waiting for your approval. Would you like to confirm it?`,
      approved: `Your order for "${order.product.title}" has been approved and is being processed.`,
      processing: `Your order is being processed — the payment is going through now.`,
      purchasing: `Almost done — finalizing the purchase with ${order.product.retailer}.`,
      confirmed: `Your order for "${order.product.title}" is confirmed! ${order.tracking?.trackingUrl ? 'You can track it here: ' + order.tracking.trackingUrl : 'You\'ll get tracking info soon.'}`,
      shipped: `Your order has shipped! ${order.tracking?.carrier ? 'Carrier: ' + order.tracking.carrier + '.' : ''} ${order.tracking?.trackingNumber ? 'Tracking #: ' + order.tracking.trackingNumber + '.' : ''} ${order.tracking?.estimatedDelivery ? 'Estimated delivery: ' + new Date(order.tracking.estimatedDelivery).toLocaleDateString() + '.' : ''}`,
      delivered: `Your order for "${order.product.title}" has been delivered!`,
      cancelled: `Your order for "${order.product.title}" was cancelled. Your wallet was not charged.`,
      failed: `Unfortunately, the order for "${order.product.title}" failed. Your wallet has not been charged. Would you like me to try again?`,
      refunded: `Your order for "${order.product.title}" has been refunded. $${order.payment.amount.toFixed(2)} USDC has been returned to your wallet.`,
    };

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
        agentMessage: statusMessages[order.status] || `Order status: ${order.status}`,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Agent: Get user's recent orders
 * GET /api/v1/agent/users/:userId/orders
 */
const getUserOrders = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { status, limit = 5 } = req.query;

    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const result = await purchaseService.getUserOrders(userId, {
      limit: parseInt(limit),
      status,
    });

    const orders = result.orders;
    let agentMessage = '';
    if (orders.length === 0) {
      agentMessage = 'You don\'t have any orders yet. Would you like me to help you find something?';
    } else {
      agentMessage = `Here are your recent orders:\n`;
      orders.forEach((o, i) => {
        agentMessage += `${i + 1}. ${o.product.title.substring(0, 50)} — $${o.payment.amount.toFixed(2)} — ${o.status.replace('_', ' ')}\n`;
      });
    }

    res.json({
      success: true,
      data: {
        orders: orders.map((o) => ({
          orderId: o.orderId,
          status: o.status,
          product: o.product,
          payment: { amount: o.payment.amount, currency: o.payment.currency },
          createdAt: o.createdAt,
        })),
        pagination: result.pagination,
        agentMessage,
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
      return res.json({
        success: true,
        data: {
          userId,
          wallet: {
            address: null,
            balance: 0,
            currency: 'USDC',
            balanceUSD: 0,
            lastUpdated: new Date().toISOString(),
            connected: false,
          },
          spendingLimits: {
            daily: user.preferences.spendingLimit.daily,
            monthly: user.preferences.spendingLimit.monthly,
            autoApproveBelow: user.preferences.maxAutoApprove,
          },
          agentMessage: 'You haven\'t connected a wallet yet. Head to your Swiftbuy dashboard to connect your Karma Agent Wallet, then I can make purchases for you.',
          agentInstructions: 'The user needs to connect their Karma Agent Wallet first. Direct them to the Swiftbuy dashboard.',
        },
      });
    }

    let balance;
    try {
      balance = await walletClient.getBalance(user.walletAddress);
    } catch (error) {
      logger.warn(`Wallet API unavailable: ${error.message}`);
      balance = {
        balance: 0,
        currency: 'USDC',
        balanceUSD: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

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
          connected: true,
        },
        spendingLimits: {
          daily: user.preferences.spendingLimit.daily,
          monthly: user.preferences.spendingLimit.monthly,
          autoApproveBelow: user.preferences.maxAutoApprove,
        },
        agentMessage: `Your wallet balance is $${balance.balanceUSD?.toFixed(2) || '0.00'} USDC. Your daily spending limit is $${user.preferences.spendingLimit.daily} and purchases under $${user.preferences.maxAutoApprove} are auto-approved.`,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Agent: Get user profile (sizes, preferences, addresses)
 * GET /api/v1/agent/users/:userId/profile
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
        agentInstructions: 'Use this profile data to personalize all interactions. Use sizes for clothing/shoe searches. Respect dietary preferences and allergies for food orders. Ship to the default address unless told otherwise.',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Agent: Get identity — who am I and who is my user?
 * GET /api/v1/agent/me
 *
 * This is the FIRST endpoint agents should call.
 * It tells the agent its own identity and the user it's authorized for,
 * so the agent doesn't need to be manually configured with a user_id.
 */
const getAgentIdentity = async (req, res, next) => {
  try {
    const agentUserId = req.agent.userId;

    let userData = null;
    let agentMessage = '';
    let agentInstructions = '';

    if (agentUserId) {
      const user = await User.findById(agentUserId).select('name email profile preferences shippingAddresses walletAddress');
      if (user) {
        userData = {
          userId: user._id.toString(),
          name: user.name,
          email: user.email,
          hasWallet: !!user.walletAddress,
          hasAddress: user.shippingAddresses?.length > 0,
          hasProfile: !!(user.profile?.notes || user.profile?.gender),
          preferences: {
            requireApproval: user.preferences?.requireApproval,
            maxAutoApprove: user.preferences?.maxAutoApprove,
          },
        };
        agentMessage = `Connected! I'm your Swiftbuy shopping agent. I'm linked to ${user.name}'s account and ready to search, compare, and purchase anything on the web for you.`;
        agentInstructions = `You are now connected to Swiftbuy. The user_id for all API calls is: ${user._id.toString()}. Start by greeting the user and asking how you can help them shop today. Use this user_id in all subsequent API calls (search, purchase, profile, wallet, etc).`;
      }
    }

    if (!userData) {
      agentMessage = 'I connected to Swiftbuy but couldn\'t find a linked user account. Please make sure your agent token is set up correctly on the Swiftbuy dashboard.';
      agentInstructions = 'The agent token does not contain a valid user_id. The user may need to re-register the agent on their Swiftbuy dashboard.';
    }

    res.json({
      success: true,
      data: {
        agent: {
          agentId: req.agent.id,
          agentName: req.agent.name,
          permissions: req.agent.permissions,
        },
        user: userData,
        agentMessage,
        agentInstructions,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAgentIdentity,
  searchProducts,
  initiatePurchase,
  approveOrder,
  rejectOrder,
  getOrderStatus,
  getUserOrders,
  getWalletBalance,
  getUserProfile,
};
