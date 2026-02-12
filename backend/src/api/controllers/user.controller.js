const purchaseService = require('../../services/purchase/purchase.service');
const learningService = require('../../services/intelligence/learning.service');
const notificationService = require('../../services/notification/notification.service');
const User = require('../../models/User');
const AgentSession = require('../../models/AgentSession');
const Transaction = require('../../models/Transaction');
const { AppError } = require('../middleware/errorHandler');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../../config');
const { generateId } = require('../../utils/helpers');

/**
 * User: Get dashboard data
 * GET /api/v1/user/dashboard
 */
const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get recent orders
    const { orders } = await purchaseService.getUserOrders(userId, { limit: 5 });

    // Get pending approvals
    const pendingOrders = await purchaseService.getUserOrders(userId, {
      status: 'pending_approval',
      limit: 10,
    });

    // Get insights
    const insights = await learningService.getUserInsights(userId);

    res.json({
      success: true,
      data: {
        user: req.user,
        recentOrders: orders,
        pendingApprovals: pendingOrders.orders,
        insights,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Get all orders
 * GET /api/v1/user/orders
 */
const getOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const result = await purchaseService.getUserOrders(req.user._id, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Approve an order
 * POST /api/v1/user/orders/:orderId/approve
 */
const approveOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await purchaseService.approveOrder(orderId, req.user._id);

    res.json({
      success: true,
      data: {
        orderId: order.orderId,
        status: order.status,
        message: 'Order approved and processing',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Reject an order
 * POST /api/v1/user/orders/:orderId/reject
 */
const rejectOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await purchaseService.rejectOrder(orderId, req.user._id, reason);

    res.json({
      success: true,
      data: {
        orderId: order.orderId,
        status: order.status,
        message: 'Order rejected',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Get transaction history
 * GET /api/v1/user/transactions
 */
const getTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const transactions = await Transaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments({ userId: req.user._id });

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
 * User: Update preferences / settings
 * PATCH /api/v1/user/settings
 */
const updateSettings = async (req, res, next) => {
  try {
    const allowedUpdates = [
      'name',
      'preferences.maxAutoApprove',
      'preferences.spendingLimit.daily',
      'preferences.spendingLimit.monthly',
      'preferences.requireApproval',
    ];

    const updates = {};
    for (const key of allowedUpdates) {
      const value = key.split('.').reduce((obj, k) => obj?.[k], req.body);
      if (value !== undefined) {
        updates[key] = value;
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Add shipping address
 * POST /api/v1/user/addresses
 */
const addAddress = async (req, res, next) => {
  try {
    const { label, fullName, street, city, state, zipCode, country, phone, isDefault } = req.body;

    const user = await User.findById(req.user._id);

    // If setting as default, unset existing defaults
    if (isDefault) {
      user.shippingAddresses.forEach((addr) => {
        addr.isDefault = false;
      });
    }

    user.shippingAddresses.push({
      label, fullName, street, city, state, zipCode, country, phone, isDefault,
    });

    await user.save();

    res.status(201).json({
      success: true,
      data: { addresses: user.shippingAddresses },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Connect wallet
 * POST /api/v1/user/wallet/connect
 */
const connectWallet = async (req, res, next) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      throw new AppError('walletAddress is required', 400, 'VALIDATION_ERROR');
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { walletAddress },
      { new: true }
    );

    res.json({
      success: true,
      data: {
        walletAddress: user.walletAddress,
        message: 'Wallet connected successfully',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Complete onboarding
 * POST /api/v1/user/onboarding
 */
const completeOnboarding = async (req, res, next) => {
  try {
    const {
      // Shipping address
      shippingAddress,
      // Profile (sizes, gender, notes)
      profile,
      // Wallet
      walletAddress,
    } = req.body;

    const user = await User.findById(req.user._id);

    // Add shipping address
    if (shippingAddress) {
      user.shippingAddresses.push({
        label: shippingAddress.label || 'Home',
        fullName: shippingAddress.fullName,
        street: shippingAddress.street,
        city: shippingAddress.city,
        state: shippingAddress.state,
        zipCode: shippingAddress.zipCode,
        country: shippingAddress.country || 'US',
        phone: shippingAddress.phone,
        isDefault: true,
      });
    }

    // Set profile
    if (profile) {
      user.profile = {
        phone: profile.phone || '',
        sizes: {
          shirtSize: profile.shirtSize || '',
          pantsSize: profile.pantsSize || '',
          shoeSize: profile.shoeSize || '',
          dressSize: profile.dressSize || '',
        },
        gender: profile.gender || '',
        dietaryPreferences: profile.dietaryPreferences || [],
        allergies: profile.allergies || [],
        notes: profile.notes || '',
      };
    }

    // Set wallet
    if (walletAddress) {
      user.walletAddress = walletAddress;
    }

    user.onboardingComplete = true;
    await user.save();

    res.json({
      success: true,
      data: { user: user.toJSON() },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Register a new agent and get credentials
 * POST /api/v1/user/agents
 */
const registerAgent = async (req, res, next) => {
  try {
    const { agentName, permissions } = req.body;

    if (!agentName) {
      throw new AppError('agentName is required', 400, 'VALIDATION_ERROR');
    }

    const agentId = generateId('agent');
    const apiKey = `sk_${generateId('')}`;

    // Hash the API key for storage
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const validPermissions = permissions || ['search', 'purchase', 'wallet_read'];

    const agentSession = await AgentSession.create({
      agentId,
      agentName,
      apiKeyHash,
      permissions: validPermissions,
      authorizedUsers: [{ userId: req.user._id }],
    });

    // Add to user's connected agents
    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        connectedAgents: {
          agentId,
          agentName,
          permissions: validPermissions,
          connectedAt: new Date(),
        },
      },
    });

    // Generate agent JWT token
    const token = jwt.sign(
      { agentId, agentName, permissions: validPermissions },
      config.jwt.agentSecret,
      { expiresIn: '365d' }
    );

    res.status(201).json({
      success: true,
      data: {
        agentId,
        agentName,
        apiKey,       // Only shown once!
        token,        // Bearer token for API calls
        permissions: validPermissions,
        message: 'Save your API key and token — they will not be shown again.',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Get connected agents
 * GET /api/v1/user/agents
 */
const getAgents = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    // Get full agent data from AgentSession
    const agentIds = user.connectedAgents.map((a) => a.agentId);
    const agentSessions = await AgentSession.find({ agentId: { $in: agentIds } });

    const agents = user.connectedAgents.map((connected) => {
      const session = agentSessions.find((s) => s.agentId === connected.agentId);
      return {
        agentId: connected.agentId,
        agentName: connected.agentName,
        permissions: connected.permissions,
        connectedAt: connected.connectedAt,
        isActive: session?.isActive || false,
        stats: session?.stats || {},
      };
    });

    res.json({
      success: true,
      data: { agents },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Delete/disconnect an agent
 * DELETE /api/v1/user/agents/:agentId
 */
const deleteAgent = async (req, res, next) => {
  try {
    const { agentId } = req.params;

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { connectedAgents: { agentId } },
    });

    await AgentSession.findOneAndUpdate(
      { agentId },
      { isActive: false }
    );

    res.json({
      success: true,
      data: { message: 'Agent disconnected' },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Get notifications
 * GET /api/v1/user/notifications
 */
const getNotifications = async (req, res, next) => {
  try {
    const { limit = 20, unread_only } = req.query;
    const result = await notificationService.getNotifications(req.user._id, {
      limit: parseInt(limit),
      unreadOnly: unread_only === 'true',
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Mark notification as read
 * POST /api/v1/user/notifications/:notificationId/read
 */
const markNotificationRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    await notificationService.markAsRead(req.user._id, notificationId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

/**
 * User: Mark all notifications as read
 * POST /api/v1/user/notifications/read-all
 */
const markAllNotificationsRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAllAsRead(req.user._id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getOrders,
  approveOrder,
  rejectOrder,
  getTransactions,
  updateSettings,
  addAddress,
  connectWallet,
  completeOnboarding,
  registerAgent,
  getAgents,
  deleteAgent,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};

