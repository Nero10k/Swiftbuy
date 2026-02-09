const { getRedisClient } = require('../../config/redis');
const Product = require('../../models/Product');
const scraperManager = require('../scraper/scraper.manager');
const logger = require('../../utils/logger');
const { sanitizeQuery } = require('../../utils/helpers');

/**
 * Search Service
 * Handles product search with caching and query processing
 */
class SearchService {
  constructor() {
    this.CACHE_TTL = 3600; // 1 hour cache
  }

  /**
   * Search for products
   * 1. Check cache
   * 2. If miss, scrape retailers
   * 3. Save to cache + DB
   * 4. Return results
   *
   * @param {string} query - Natural language search query
   * @param {Object} filters - { maxPrice, minPrice, minRating, category, retailers }
   * @param {number} limit - Max results
   * @returns {Object} { products, meta }
   */
  async search(query, filters = {}, limit = 10) {
    const cleanQuery = sanitizeQuery(query);
    if (!cleanQuery) {
      throw new Error('Search query is required');
    }

    logger.info(`Search request: "${cleanQuery}"`, { filters, limit });

    // 1. Check cache
    const cacheKey = this._buildCacheKey(cleanQuery, filters);
    const cached = await this._getFromCache(cacheKey);

    if (cached) {
      logger.info(`Cache hit for "${cleanQuery}"`);
      return {
        products: cached,
        meta: {
          source: 'cache',
          query: cleanQuery,
          resultCount: cached.length,
          retailers: [...new Set(cached.map((p) => p.retailer))],
        },
      };
    }

    // 2. Scrape retailers
    let products;
    if (filters.retailers && filters.retailers.length > 0) {
      // Search specific retailers
      const results = await Promise.allSettled(
        filters.retailers.map((r) =>
          scraperManager.searchRetailer(r, cleanQuery, filters, limit)
        )
      );
      products = results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => r.value);
    } else {
      // Search all retailers
      products = await scraperManager.searchAll(cleanQuery, filters, limit);
    }

    // 3. Save to cache + DB
    if (products.length > 0) {
      await this._saveToCache(cacheKey, products);
      await this._saveToDB(products, cleanQuery);
    }

    // 4. Return results
    return {
      products: products.slice(0, limit),
      meta: {
        source: 'fresh',
        query: cleanQuery,
        resultCount: products.length,
        retailers: [...new Set(products.map((p) => p.retailer))],
        scrapedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Get a specific product by ID
   */
  async getProduct(productId) {
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }
    return product;
  }

  /**
   * Build cache key from query + filters
   */
  _buildCacheKey(query, filters) {
    const filterStr = JSON.stringify({
      maxPrice: filters.maxPrice,
      minPrice: filters.minPrice,
      minRating: filters.minRating,
      retailers: filters.retailers,
    });
    return `search:${query.toLowerCase().replace(/\s+/g, '_')}:${Buffer.from(filterStr).toString('base64').substring(0, 20)}`;
  }

  /**
   * Get results from Redis cache
   */
  async _getFromCache(key) {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Cache read error:', error.message);
      return null;
    }
  }

  /**
   * Save results to Redis cache
   */
  async _saveToCache(key, products) {
    try {
      const redis = getRedisClient();
      await redis.setex(key, this.CACHE_TTL, JSON.stringify(products));
    } catch (error) {
      logger.warn('Cache write error:', error.message);
    }
  }

  /**
   * Save products to MongoDB for history + intelligence
   */
  async _saveToDB(products, searchQuery) {
    try {
      const ops = products.map((product) => ({
        updateOne: {
          filter: { externalId: product.externalId, retailer: product.retailer },
          update: {
            $set: { ...product, searchQuery },
            $push: {
              priceHistory: { price: product.price, date: new Date() },
            },
          },
          upsert: true,
        },
      }));

      await Product.bulkWrite(ops, { ordered: false });
    } catch (error) {
      logger.warn('DB save error:', error.message);
    }
  }
}

module.exports = new SearchService();


