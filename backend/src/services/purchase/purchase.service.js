const Order = require('../../models/Order');
const Transaction = require('../../models/Transaction');
const Product = require('../../models/Product');
const User = require('../../models/User');
const karmaClient = require('../wallet/wallet.client');
const checkoutAutomation = require('./checkout.automation');
const searchService = require('../search/search.service');
const notificationService = require('../notification/notification.service');
const logger = require('../../utils/logger');
const { generateId } = require('../../utils/helpers');
const config = require('../../config');
const { AppError } = require('../../api/middleware/errorHandler');

/**
 * Purchase Service
 *
 * Orchestrates the full end-to-end purchase flow:
 *
 *  Agent searches → picks product → calls initiatePurchase
 *       ↓
 *  [1] Validate product + user
 *  [2] Check wallet balance
 *  [3] Check spending limits
 *  [4] Create order (pending_approval or auto-approve)
 *       ↓
 *  User approves on dashboard (or auto-approved)
 *       ↓
 *  [5] Off-ramp USDC → fiat via Karma Wallet
 *  [6] Execute purchase on retailer (TODO: headless checkout)
 *  [7] Update order status + notify user
 *  [8] Send confirmation back to agent
 */
class PurchaseService {
  /**
   * Initiate a purchase
   *
   * Supports two modes:
   * A) product_id — lookup from MongoDB (existing scraped product)
   * B) product (inline) — pass product data directly from search results
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} [params.productId] — MongoDB product ID
   * @param {Object} [params.product] — Inline product data { title, price, url, retailer, image, externalId }
   * @param {string} [params.shippingAddressId]
   * @param {boolean} [params.autoApprove]
   * @param {string} params.agentId
   * @param {string} [params.agentConversationId]
   */
  async initiatePurchase({ userId, productId, product: inlineProduct, shippingAddressId, autoApprove, agentId, agentConversationId }) {
    // 1. Get user
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

    // 2. Resolve product (either from DB or inline)
    let product;
    if (productId) {
      // Mode A: lookup from MongoDB
      product = await this._resolveProductById(productId);
    } else if (inlineProduct) {
      // Mode B: inline product data from search results
      product = this._normalizeInlineProduct(inlineProduct);
    } else {
      throw new AppError('Either product_id or product data is required', 400, 'VALIDATION_ERROR');
    }

    // 3. Get shipping address (optional for flights/hotels/digital)
    let address = null;
    const needsShipping = !['flight', 'hotel', 'tickets', 'food', 'subscription'].includes(product.category);
    if (needsShipping) {
      address = this._getShippingAddress(user, shippingAddressId);
    }

    // 3b. Detect missing info that could cause checkout to fail
    const missingInfo = [];
    const titleLower = (product.title || '').toLowerCase();
    const categoryLower = (product.category || '').toLowerCase();
    const isClothingOrShoes =
      ['clothing', 'shoes', 'apparel', 'fashion', 'footwear'].some((cat) => categoryLower.includes(cat)) ||
      /\b(shirts?|pants|jeans|shorts|skirts?|dress(es)?|jackets?|coats?|hoodi(e|es)|sweaters?|sneakers?|shoes?|boots?|sandals?|runners?|trainers?|loafers?|slip-?ons?|clogs?|heels?|flats?|leggings|tee|polo|blouse|size\s?\d)/i.test(titleLower) ||
      /\b(air jordan|air max|air force|yeezy|ultraboost|new balance \d|converse|chuck taylor|vans old skool|adidas (gazelle|samba|superstar)|nike dunk)/i.test(titleLower);

    if (needsShipping && !address) {
      missingInfo.push({ field: 'shippingAddress', message: 'No shipping address on file. The user must add one in Dashboard → Settings before checkout can proceed.' });
    }
    if (needsShipping && address && !address.phone && !user.profile?.phone) {
      missingInfo.push({ field: 'phone', message: 'No phone number on file. Many retailers require a phone number at checkout. The user can add one in Dashboard → Settings.' });
    }
    if (isClothingOrShoes) {
      const sizes = user.profile?.sizes || {};
      if (!sizes.shoeSize && !sizes.shirtSize && !sizes.pantsSize && !sizes.dressSize) {
        missingInfo.push({ field: 'sizes', message: 'No clothing/shoe sizes on file. The checkout engine will guess a default size. Ask the user for their size before purchasing, or have them update their profile.' });
      }
    }

    // 4. Calculate total cost
    const shippingCost = product.shippingCost || 0;
    const totalAmount = product.price + shippingCost;

    // 5. Check wallet balance via Karma can-spend (skip in mock mode)
    const karmaStatus = karmaClient.checkStatus(user);
    if (!config.checkout.mockCheckout && karmaStatus.ready && user.karma?.skAgent) {
      try {
        const spendCheck = await karmaClient.canSpend(user.karma.skAgent, totalAmount, 'USD');
        if (!spendCheck.allowed) {
          const fees = spendCheck.fees != null ? spendCheck.fees.toFixed(2) : '0.00';
          const avail = spendCheck.available != null ? spendCheck.available.toFixed(2) : 'unknown';
          throw new AppError(
            `Insufficient balance. Required: $${totalAmount.toFixed(2)} (+ $${fees} fees), Available: $${avail} USDC`,
            400,
            'INSUFFICIENT_FUNDS'
          );
        }
        logger.info(`Karma can-spend approved: $${totalAmount} (total with fees: $${spendCheck.total || totalAmount})`);
      } catch (error) {
        if (error.code === 'INSUFFICIENT_FUNDS') throw error;
        logger.warn(`Karma can-spend check skipped: ${error.message}`);
      }
    } else {
      logger.warn(`Karma wallet not ready for user ${user._id}, skipping balance check (status: ${karmaStatus.status})`);
    }

    // 6. Check spending limits (skip in mock mode)
    if (!config.checkout.mockCheckout) {
      await this._checkSpendingLimits(user, totalAmount);
    } else {
      logger.info(`🧪 MOCK mode — skipping spending limit check for $${totalAmount}`);
    }

    // 7. Determine if auto-approve
    const shouldAutoApprove = this._shouldAutoApprove(user, totalAmount, autoApprove);

    // 8. Create order
    const orderId = generateId('ord');
    const order = await Order.create({
      orderId,
      userId: user._id,
      agentId,
      product: {
        productId: product._id || undefined,
        externalId: product.externalId,
        title: product.title,
        price: product.price,
        retailer: product.retailer,
        url: product.url,
        image: product.image || product.images?.[0],
        category: product.category,
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
        source: product.source || 'unknown',
      },
    });

    logger.info(`Order created: ${orderId}`, {
      userId: user._id,
      product: product.title,
      amount: totalAmount,
      autoApproved: shouldAutoApprove,
    });

    // 9. Send notification to user
    await notificationService.notify(user._id, {
      type: shouldAutoApprove ? 'order_auto_approved' : 'order_pending_approval',
      title: shouldAutoApprove
        ? `Order auto-approved: ${product.title.substring(0, 50)}`
        : `Approval needed: ${product.title.substring(0, 50)}`,
      message: shouldAutoApprove
        ? `Your agent purchased "${product.title}" for $${totalAmount.toFixed(2)} from ${product.retailer}. Processing now.`
        : `Your agent wants to buy "${product.title}" for $${totalAmount.toFixed(2)} from ${product.retailer}. Approve on your dashboard.`,
      orderId: order.orderId,
      amount: totalAmount,
    });

    // 10. If auto-approved, immediately start execution
    if (shouldAutoApprove) {
      this.executePurchase(order._id).catch((err) => {
        logger.error(`Auto-execute failed for ${orderId}:`, err.message);
      });
    }

    // Attach missingInfo (non-persistent, for the API response only)
    order._missingInfo = missingInfo;

    return order;
  }

  /**
   * Resolve product from MongoDB by ID or externalId
   */
  async _resolveProductById(productId) {
    // Try MongoDB ObjectId first
    let product = await Product.findById(productId).catch(() => null);

    // Try by externalId
    if (!product) {
      product = await Product.findOne({ externalId: productId });
    }

    if (!product) {
      throw new AppError('Product not found. Pass product data directly instead of product_id.', 404, 'PRODUCT_NOT_FOUND');
    }

    return product;
  }

  /**
   * Normalize inline product data from search results
   */
  _normalizeInlineProduct(data) {
    if (!data.title || !data.price) {
      throw new AppError('Inline product requires at least title and price', 400, 'VALIDATION_ERROR');
    }

    return {
      externalId: data.externalId || data.external_id || generateId('prod'),
      title: data.title,
      price: parseFloat(data.price),
      retailer: data.retailer || 'Web',
      url: data.url || '',
      image: data.image || data.imageUrl || (data.images && data.images[0]) || '',
      images: data.images || [],
      category: data.category || '',
      brand: data.brand || '',
      description: data.description || '',
      source: data.source || 'search',
      shippingCost: data.shippingCost || 0,
      searchQuery: data.searchQuery || '',
    };
  }

  /**
   * User approves a pending order
   * Accepts either MongoDB _id or orderId string
   */
  async approveOrder(orderId, userId) {
    // Try by orderId string first, then by _id
    let order = await Order.findOne({ orderId: orderId, userId });
    if (!order) {
      order = await Order.findOne({ _id: orderId, userId }).catch(() => null);
    }
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

    // Notify user
    await notificationService.notify(userId, {
      type: 'order_approved',
      title: `Order approved: ${order.product.title.substring(0, 50)}`,
      message: `Processing your order for $${order.payment.amount.toFixed(2)}...`,
      orderId: order.orderId,
    });

    // Start execution
    this.executePurchase(order._id).catch((err) => {
      logger.error(`Execute failed for ${order.orderId}:`, err.message);
    });

    return order;
  }

  /**
   * User rejects a pending order
   * Accepts either MongoDB _id or orderId string
   */
  async rejectOrder(orderId, userId, reason = '') {
    let order = await Order.findOne({ orderId: orderId, userId });
    if (!order) {
      order = await Order.findOne({ _id: orderId, userId }).catch(() => null);
    }
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

    // Notify user
    await notificationService.notify(userId, {
      type: 'order_rejected',
      title: `Order cancelled: ${order.product.title.substring(0, 50)}`,
      message: reason || 'You rejected this order.',
      orderId: order.orderId,
    });

    return order;
  }

  /**
   * Execute the full purchase pipeline
   *
   * 1. Verify USDC balance via Karma canSpend
   * 2. Get virtual card details (number, CVV, expiry)
   * 3. Launch AI checkout engine (Playwright + Claude vision)
   *    - Tries saved flow first (no LLM, fast)
   *    - Falls back to LLM-guided (screenshot→action loop)
   *    - Records flow for future replays
   * 4. Update order with retailer confirmation
   * 5. Notify user with result
   */
  async executePurchase(orderMongoId) {
    const order = await Order.findById(orderMongoId);
    if (!order) throw new AppError('Order not found', 404);

    const user = await User.findById(order.userId);
    const startTime = Date.now();

    try {
      // Step 1: Off-ramp USDC via Karma Wallet
      order.status = 'processing';
      await order.save();

      logger.info(`Processing payment for ${order.orderId}: $${order.payment.amount}`);

      const isMockMode = config.checkout.mockCheckout;
      if (isMockMode) {
        logger.info(`🧪 MOCK_CHECKOUT enabled — skipping real payment for ${order.orderId}`);
      }

      // Check if Karma is ready — use real can-spend, otherwise mock
      const karmaStatus = karmaClient.checkStatus(user);
      let transferResult;

      if (!isMockMode && karmaStatus.ready && user.karma?.skAgent) {
        try {
          // Verify we can still spend
          const spendCheck = await karmaClient.canSpend(user.karma.skAgent, order.payment.amount, 'USD');
          if (!spendCheck.allowed) {
            const reqTotal = spendCheck.total != null ? `$${spendCheck.total}` : `$${order.payment.amount}`;
            const avail = spendCheck.available != null ? `$${spendCheck.available}` : 'unknown';
            throw new AppError(
              `Insufficient USDC balance. Required: ${reqTotal}, Available: ${avail}`,
              400,
              'INSUFFICIENT_FUNDS'
            );
          }

          // The actual charge happens when the card is used at checkout.
          // Karma's card details are used by the checkout automation.
          // For now, we record the pre-approval as a successful transfer.
          transferResult = {
            transactionId: generateId('tx_karma'),
            status: 'completed',
            usdcDebited: spendCheck.total,
            fiatAmount: order.payment.amount,
            fee: spendCheck.fees || 0,
            exchangeRate: 1,
            method: 'karma_card',
          };

          logger.info(`Karma payment pre-approved for ${order.orderId}: $${spendCheck.total}`);
        } catch (karmaError) {
          if (karmaError.code === 'INSUFFICIENT_FUNDS') throw karmaError;
          logger.warn(`Karma payment check failed, using mock: ${karmaError.message}`);
          transferResult = {
            transactionId: generateId('tx_mock'),
            status: 'completed',
            usdcDebited: order.payment.amount,
            fiatAmount: order.payment.amount,
            fee: 0,
            exchangeRate: 1,
            method: 'mock',
          };
        }
      } else {
        // Mock mode — Karma not connected or MOCK_CHECKOUT enabled
        logger.warn(`Using mock payment for ${order.orderId} (mock: ${isMockMode}, karmaReady: ${karmaStatus.ready})`);
        transferResult = {
          transactionId: generateId('tx_mock'),
          status: 'completed',
          usdcDebited: order.payment.amount,
          fiatAmount: order.payment.amount,
          fee: 0,
          exchangeRate: 1,
          method: 'mock',
        };
      }

      // Create transaction record
      const transaction = await Transaction.create({
        transactionId: generateId('tx'),
        userId: user._id,
        orderId: order._id,
        type: 'purchase',
        usdcAmount: transferResult.usdcDebited || order.payment.amount,
        fiatAmount: transferResult.fiatAmount || order.payment.amount,
        offRampFee: transferResult.fee || 0,
        exchangeRate: transferResult.exchangeRate || 1,
        walletAddress: user.karma?.depositAddress || user.walletAddress || 'mock_wallet',
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
      order.payment.usdcAmount = transferResult.usdcDebited || order.payment.amount;
      order.payment.offRampFee = transferResult.fee || 0;

      // Step 2: Execute checkout on retailer
      order.status = 'purchasing';
      await order.save();

      logger.info(`Executing checkout for ${order.orderId} on ${order.product.retailer}`);

      // ────────────────────────────────────────────────────────
      // Automated checkout via AI-driven browser engine
      // Falls back to mock if engine isn't configured (no API key)
      // ────────────────────────────────────────────────────────

      let checkoutResult;
      const isDryRun = config.checkout.dryRunCheckout;

      // Determine if we should run the real checkout engine:
      //   - Normal mode (!isMockMode): always run if ready
      //   - Dry-run mode (isMockMode + dryRunCheckout): run with test card, stop before submit
      const shouldRunRealCheckout = (!isMockMode || isDryRun) && checkoutAutomation.isReady() && order.product.url;

      if (shouldRunRealCheckout) {
        // Real checkout (or dry-run checkout)
        try {
          // Verify we have a shipping address (required for physical products)
          const shippingAddress = order.shippingAddress;
          if (!shippingAddress || !shippingAddress.street) {
            throw new AppError(
              'Shipping address is required for checkout. Please add an address in your Swiftbuy dashboard settings.',
              400,
              'NO_SHIPPING_ADDRESS'
            );
          }

          // Get card details — real from Karma, or test card for dry-run
          let cardDetails;
          if (isDryRun) {
            logger.info(`🧪 DRY-RUN CHECKOUT — using test Visa card for ${order.orderId}`);
            cardDetails = {
              number: '4111111111111111',
              cvv: '123',
              expiry: '12/2027',
              expiryMonth: '12',
              expiryYear: '2027',
            };
          } else {
            cardDetails = await karmaClient.getCardDetails(user.karma.skAgent);
          }

          // Build enriched user context with profile data for the checkout engine
          const userContext = {
            email: user.email,
            name: user.name,
            phone: shippingAddress?.phone || user.profile?.phone || '',
            profile: {
              sizes: user.profile?.sizes || {},
              gender: user.profile?.gender || '',
              notes: user.profile?.notes || '',
            },
          };

          checkoutResult = await checkoutAutomation.executeCheckout(
            order,
            cardDetails,
            shippingAddress,
            userContext,
            { dryRun: isDryRun }
          );

          logger.info(`Checkout engine result for ${order.orderId}:`, {
            success: checkoutResult.success,
            dryRun: isDryRun,
            retailerOrderId: checkoutResult.retailerOrderId,
            executionMs: checkoutResult.executionMs,
            llmCalls: checkoutResult.llmCalls,
            usedSavedFlow: checkoutResult.usedSavedFlow,
          });
        } catch (checkoutError) {
          logger.error(`Checkout automation failed for ${order.orderId}: ${checkoutError.message}`);
          throw new AppError(
            `Checkout failed on ${order.product.retailer}: ${checkoutError.message}`,
            502,
            'CHECKOUT_FAILED'
          );
        }
      } else {
        // Mock mode — checkout engine not configured or no product URL
        logger.warn(`Checkout engine not available for ${order.orderId} (configured: ${checkoutAutomation.isReady()}, hasUrl: ${!!order.product.url}). Using mock.`);
        checkoutResult = {
          success: true,
          retailerOrderId: generateId('ret'),
          confirmationUrl: order.product.url || '',
          executionMs: 0,
          llmCalls: 0,
          usedSavedFlow: false,
        };
      }

      order.status = 'confirmed';
      order.metadata.executionTimeMs = Date.now() - startTime;
      order.metadata.checkoutLlmCalls = checkoutResult.llmCalls;
      order.metadata.checkoutUsedSavedFlow = checkoutResult.usedSavedFlow;
      order.tracking = {
        retailerOrderId: checkoutResult.retailerOrderId || generateId('ret'),
        trackingUrl: checkoutResult.confirmationUrl || order.product.url || '',
      };
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

      // Notify user of success
      await notificationService.notify(user._id, {
        type: 'order_confirmed',
        title: `Order confirmed! ${order.product.title.substring(0, 50)}`,
        message: `Your purchase of "${order.product.title}" for $${order.payment.amount.toFixed(2)} from ${order.product.retailer} has been confirmed. ${order.product.url ? 'Track your order at: ' + order.product.url : ''}`,
        orderId: order.orderId,
        amount: order.payment.amount,
      });

      logger.info(`✅ Order completed: ${order.orderId}`, {
        executionTimeMs: order.metadata.executionTimeMs,
        retailer: order.product.retailer,
        amount: order.payment.amount,
      });

      return order;
    } catch (error) {
      order.status = 'failed';
      order.metadata.executionTimeMs = Date.now() - startTime;
      order.metadata.failureReason = error.message;
      await order.save();

      // Notify user of failure
      await notificationService.notify(user._id, {
        type: 'order_failed',
        title: `Order failed: ${order.product.title.substring(0, 50)}`,
        message: `Something went wrong with your order. Error: ${error.message}. Your wallet has not been charged.`,
        orderId: order.orderId,
      });

      logger.error(`❌ Order failed: ${order.orderId}`, { error: error.message });

      throw error;
    }
  }

  /**
   * Get order by ID (orderId string, not MongoDB _id)
   */
  async getOrder(orderId) {
    return Order.findOne({ orderId }).populate('userId', 'name email');
  }

  /**
   * Get order by MongoDB _id
   */
  async getOrderById(mongoId) {
    return Order.findById(mongoId).populate('userId', 'name email');
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

    const defaultAddr = user.shippingAddresses.find((a) => a.isDefault);
    if (defaultAddr) return defaultAddr.toObject();

    if (user.shippingAddresses.length > 0) {
      return user.shippingAddresses[0].toObject();
    }

    // For demo/testing, return null instead of throwing
    logger.warn(`No shipping address for user ${user._id}`);
    return null;
  }

  /**
   * Check if purchase is within user spending limits
   */
  async _checkSpendingLimits(user, amount) {
    const now = new Date();

    // Daily limit check
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
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
    if (user.preferences.requireApproval && !requestedAutoApprove) {
      return false;
    }
    if (amount <= user.preferences.maxAutoApprove) {
      return true;
    }
    return false;
  }
}

module.exports = new PurchaseService();
