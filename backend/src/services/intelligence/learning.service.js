const User = require('../../models/User');
const Order = require('../../models/Order');
const logger = require('../../utils/logger');

/**
 * Learning Service
 * Tracks user behavior and builds preference models
 *
 * This is the "intelligence engine" that makes the platform smarter over time:
 * - Learns brand preferences
 * - Learns price sensitivity
 * - Learns category preferences
 * - Predicts reorder timing
 * - Scores products for relevance
 */
class LearningService {
  /**
   * Record a search event (what did the user look for?)
   */
  async recordSearch(userId, query, filters, selectedProductId = null) {
    try {
      // Track category from query (basic NLP — can be enhanced with AI later)
      const categories = this._extractCategories(query);

      if (categories.length > 0) {
        await User.findByIdAndUpdate(userId, {
          $addToSet: { 'preferences.favoriteCategories': { $each: categories } },
        });
      }

      logger.debug('Search recorded', { userId, query, categories });
    } catch (error) {
      logger.warn('Failed to record search:', error.message);
    }
  }

  /**
   * Record a purchase event (what did the user actually buy?)
   */
  async recordPurchase(userId, order) {
    try {
      const updates = {};

      // Track brand preference
      if (order.product.brand) {
        await User.findByIdAndUpdate(userId, {
          $addToSet: { 'preferences.preferredBrands': order.product.brand },
        });
      }

      // Update average order value
      const user = await User.findById(userId);
      if (user) {
        const newAvg =
          (user.stats.averageOrderValue * user.stats.totalOrders + order.payment.amount) /
          (user.stats.totalOrders + 1);

        await User.findByIdAndUpdate(userId, {
          $set: { 'stats.averageOrderValue': Math.round(newAvg * 100) / 100 },
        });
      }

      logger.debug('Purchase recorded', {
        userId,
        product: order.product.title,
        amount: order.payment.amount,
      });
    } catch (error) {
      logger.warn('Failed to record purchase:', error.message);
    }
  }

  /**
   * Get personalized product score for a user
   * Higher score = more likely this user wants this product
   */
  async scoreProduct(userId, product) {
    try {
      const user = await User.findById(userId);
      if (!user) return 0;

      let score = 0;

      // Brand match
      if (user.preferences.preferredBrands.includes(product.brand)) {
        score += 20;
      }

      // Category match
      if (user.preferences.favoriteCategories.some((cat) =>
        product.title.toLowerCase().includes(cat.toLowerCase()) ||
        (product.category && product.category.toLowerCase().includes(cat.toLowerCase()))
      )) {
        score += 15;
      }

      // Price is within typical range
      if (user.stats.averageOrderValue > 0) {
        const priceRatio = product.price / user.stats.averageOrderValue;
        if (priceRatio >= 0.5 && priceRatio <= 2) {
          score += 10; // Within 0.5x to 2x of their average
        }
      }

      // Rating bonus
      if (product.rating >= 4.0) score += 10;
      if (product.rating >= 4.5) score += 5;

      // Free shipping bonus
      if (product.shippingInfo?.freeShipping) score += 5;

      return score;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get user insights (for dashboard)
   */
  async getUserInsights(userId) {
    const user = await User.findById(userId);
    if (!user) return null;

    const recentOrders = await Order.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20);

    // Most purchased categories
    const categoryCount = {};
    recentOrders.forEach((order) => {
      const cat = order.product.category || 'Other';
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    // Most purchased brands
    const brandCount = {};
    recentOrders.forEach((order) => {
      if (order.product.brand) {
        brandCount[order.product.brand] = (brandCount[order.product.brand] || 0) + 1;
      }
    });

    return {
      totalOrders: user.stats.totalOrders,
      totalSpent: user.stats.totalSpent,
      averageOrderValue: user.stats.averageOrderValue,
      topCategories: Object.entries(categoryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count })),
      topBrands: Object.entries(brandCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count })),
      preferredBrands: user.preferences.preferredBrands,
      favoriteCategories: user.preferences.favoriteCategories,
    };
  }

  /**
   * Basic category extraction from search query
   */
  _extractCategories(query) {
    const knownCategories = [
      'electronics', 'headphones', 'laptop', 'phone', 'tablet', 'camera',
      'clothing', 'shoes', 'fashion', 'accessories',
      'home', 'kitchen', 'furniture', 'decor',
      'sports', 'fitness', 'outdoor',
      'books', 'games', 'toys',
      'beauty', 'health', 'skincare',
      'food', 'grocery', 'snacks',
    ];

    const queryLower = query.toLowerCase();
    return knownCategories.filter((cat) => queryLower.includes(cat));
  }
}

module.exports = new LearningService();



