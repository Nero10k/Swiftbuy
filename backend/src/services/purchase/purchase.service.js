const Order = require('../../models/Order');
const Transaction = require('../../models/Transaction');
const User = require('../../models/User');
const walletClient = require('../wallet/wallet.client');
const searchService = require('../search/search.service');
const logger = require('../../utils/logger');
const { generateId } = require('../../utils/helpers');
const { AppError } = require('../../api/middleware/errorHandler');

/**
 * Purchase Service
 * Orchestrates the full purchase flow:
 * 1. Validate product + user
 * 2. Check wallet balance
 * 3. Create order (pending approval or auto-approve)
 * 4. On approval: off-ramp USDC → execute purchase
 * 5. Track order
 */
class PurchaseService {
  /**
   * Initiate a purchase
   * @param {Object} params - { userId, productId, shippingAddressId, autoApprove, agentId }
   * @returns {Object} Created order
   */
  async initiatePurchase({ userId, productId, shippingAddressId, autoApprove, agentId, agentConversationId }) {
    // 1. Get user + product
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    if (!user.walletAddress) throw new AppError('User has no wallet connected', 400, 'NO_WALLET');

    const product = await searchService.getProduct(productId);
    if (!product) throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');

    // 2. Get shipping address
    const address = this._getShippingAddress(user, shippingAddressId);

    // 3. Calculate total cost
    const totalAmount = product.price + (product.shippingInfo.cost || 0);

    // 4. Check wallet balance
    const balance = await walletClient.getBalance(user.walletAddress);
    if (balance.balance < totalAmount) {
      throw new AppError(
        `Insufficient balance. Required: $${totalAmount.toFixed(2)}, Available: $${balance.balance.toFixed(2)} USDC`,
        400,
        'INSUFFICIENT_FUNDS'
      );
    }

    // 5. Check spending limits
    await this._checkSpendingLimits(user, totalAmount);

    // 6. Determine if auto-approve
    const shouldAutoApprove = this._shouldAutoApprove(user, totalAmount, autoApprove);

    // 7. Create order
    const orderId = generateId('ord');
    const order = await Order.create({
      orderId,
      userId: user._id,
      agentId,
      product: {
        productId: product._id,
        title: product.title,
        price: product.price,
        retailer: product.retailer,
        url: product.url,
        image: product.images?.[0],
      },
      shippingAddress: address,
      payment: {
        method: 'wallet',
        amount: totalAmount,
        currency: 'USD',
      },
      status: shouldAutoApprove ? 'approved' : 'pending_approval',
      approval: {
        required: !shouldAutoApprove,
        autoApproved: shouldAutoApprove,
        approvedAt: shouldAutoApprove ? new Date() : undefined,
        approvedBy: shouldAutoApprove ? 'auto' : undefined,
      },
      metadata: {
        searchQuery: product.searchQuery,
        agentConversationId,
      },
    });

    logger.info(`Order created: ${orderId}`, {
      userId: user._id,
      product: product.title,
      amount: totalAmount,
      autoApproved: shouldAutoApprove,
    });

    // 8. If auto-approved, immediately start execution
    if (shouldAutoApprove) {
      // Don't await — kick off async execution
      this.executePurchase(order._id).catch((err) => {
        logger.error(`Auto-execute failed for ${orderId}:`, err.message);
      });
    }

    return order;
  }

  /**
   * User approves a pending order
   */
  async approveOrder(orderId, userId) {
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');

    if (order.status !== 'pending_approval') {
      throw new AppError(
        `Order cannot be approved — current status: ${order.status}`,
        400,
        'INVALID_ORDER_STATUS'
      );
    }

    order.status = 'approved';
    order.approval.approvedAt = new Date();
    order.approval.approvedBy = 'user';
    await order.save();

    logger.info(`Order approved by user: ${order.orderId}`);

    // Start execution
    this.executePurchase(order._id).catch((err) => {
      logger.error(`Execute failed for ${order.orderId}:`, err.message);
    });

    return order;
  }

  /**
   * User rejects a pending order
   */
  async rejectOrder(orderId, userId, reason = '') {
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');

    if (order.status !== 'pending_approval') {
      throw new AppError(
        `Order cannot be rejected — current status: ${order.status}`,
        400,
        'INVALID_ORDER_STATUS'
      );
    }

    order.status = 'cancelled';
    order.approval.rejectedAt = new Date();
    order.approval.rejectionReason = reason;
    await order.save();

    logger.info(`Order rejected by user: ${order.orderId}`, { reason });

    return order;
  }

  /**
   * Execute the full purchase pipeline
   * 1. Off-ramp USDC via wallet
   * 2. Execute checkout on retailer
   * 3. Update order with confirmation
   */
  async executePurchase(orderMongoId) {
    const order = await Order.findById(orderMongoId).populate('userId');
    if (!order) throw new AppError('Order not found', 404);

    const user = await User.findById(order.userId);
    const startTime = Date.now();

    try {
      // Step 1: Off-ramp USDC
      order.status = 'processing';
      await order.save();

      logger.info(`Processing payment for ${order.orderId}`);

      const transferResult = await walletClient.initiateTransfer(
        user.walletAddress,
        order.payment.amount,
        {
          orderId: order.orderId,
          retailer: order.product.retailer,
          productTitle: order.product.title,
        }
      );

      // Create transaction record
      const transaction = await Transaction.create({
        transactionId: generateId('tx'),
        userId: user._id,
        orderId: order._id,
        type: 'purchase',
        usdcAmount: transferResult.usdcDebited,
        fiatAmount: transferResult.fiatAmount,
        offRampFee: transferResult.fee,
        exchangeRate: transferResult.exchangeRate,
        walletAddress: user.walletAddress,
        walletTransactionId: transferResult.transactionId,
        status: 'off_ramping',
        offRampStartedAt: new Date(),
        metadata: {
          retailer: order.product.retailer,
          productTitle: order.product.title,
          agentId: order.agentId,
        },
      });

      order.payment.walletTransactionId = transferResult.transactionId;
      order.payment.usdcAmount = transferResult.usdcDebited;
      order.payment.offRampFee = transferResult.fee;

      // Step 2: Execute checkout (placeholder — checkout automation is Phase 2)
      order.status = 'purchasing';
      await order.save();

      logger.info(`Executing checkout for ${order.orderId} on ${order.product.retailer}`);

      // TODO: Implement actual headless browser checkout in checkout.automation.js
      // For MVP, mark as confirmed (simulating successful checkout)
      order.status = 'confirmed';
      order.metadata.executionTimeMs = Date.now() - startTime;
      await order.save();

      // Update transaction
      transaction.status = 'completed';
      transaction.completedAt = new Date();
      await transaction.save();

      // Update user stats
      await User.findByIdAndUpdate(user._id, {
        $inc: {
          'stats.totalOrders': 1,
          'stats.totalSpent': order.payment.amount,
        },
      });

      logger.info(`Order completed: ${order.orderId}`, {
        executionTimeMs: order.metadata.executionTimeMs,
      });

      return order;
    } catch (error) {
      order.status = 'failed';
      order.metadata.executionTimeMs = Date.now() - startTime;
      await order.save();

      logger.error(`Order failed: ${order.orderId}`, {
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId) {
    return Order.findOne({ orderId }).populate('userId', 'name email');
  }

  /**
   * Get orders for a user
   */
  async getUserOrders(userId, { page = 1, limit = 20, status } = {}) {
    const filter = { userId };
    if (status) filter.status = status;

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Order.countDocuments(filter);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get shipping address from user profile
   */
  _getShippingAddress(user, addressId) {
    if (addressId) {
      const addr = user.shippingAddresses.id(addressId);
      if (addr) return addr.toObject();
    }

    // Fall back to default address
    const defaultAddr = user.shippingAddresses.find((a) => a.isDefault);
    if (defaultAddr) return defaultAddr.toObject();

    // Fall back to first address
    if (user.shippingAddresses.length > 0) {
      return user.shippingAddresses[0].toObject();
    }

    throw new AppError('No shipping address found', 400, 'NO_SHIPPING_ADDRESS');
  }

  /**
   * Check if purchase is within user spending limits
   */
  async _checkSpendingLimits(user, amount) {
    const now = new Date();

    // Daily limit check
    const dayStart = new Date(now.setHours(0, 0, 0, 0));
    const dailySpent = await Order.aggregate([
      {
        $match: {
          userId: user._id,
          createdAt: { $gte: dayStart },
          status: { $nin: ['cancelled', 'failed', 'refunded'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$payment.amount' } } },
    ]);

    const dailyTotal = (dailySpent[0]?.total || 0) + amount;
    if (dailyTotal > user.preferences.spendingLimit.daily) {
      throw new AppError(
        `Daily spending limit exceeded. Limit: $${user.preferences.spendingLimit.daily}, Today: $${dailyTotal.toFixed(2)}`,
        400,
        'DAILY_LIMIT_EXCEEDED'
      );
    }

    // Monthly limit check
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlySpent = await Order.aggregate([
      {
        $match: {
          userId: user._id,
          createdAt: { $gte: monthStart },
          status: { $nin: ['cancelled', 'failed', 'refunded'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$payment.amount' } } },
    ]);

    const monthlyTotal = (monthlySpent[0]?.total || 0) + amount;
    if (monthlyTotal > user.preferences.spendingLimit.monthly) {
      throw new AppError(
        `Monthly spending limit exceeded. Limit: $${user.preferences.spendingLimit.monthly}, This month: $${monthlyTotal.toFixed(2)}`,
        400,
        'MONTHLY_LIMIT_EXCEEDED'
      );
    }
  }

  /**
   * Determine if order should be auto-approved
   */
  _shouldAutoApprove(user, amount, requestedAutoApprove) {
    // If user requires approval for all purchases
    if (user.preferences.requireApproval && !requestedAutoApprove) {
      return false;
    }

    // Auto-approve if below threshold
    if (amount <= user.preferences.maxAutoApprove) {
      return true;
    }

    return false;
  }
}

module.exports = new PurchaseService();


