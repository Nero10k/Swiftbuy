const { getRedisClient } = require('../../config/redis');
const Product = require('../../models/Product');
const scraperManager = require('../scraper/scraper.manager');
const queryProcessor = require('./query-processor');
const logger = require('../../utils/logger');
const { sanitizeQuery } = require('../../utils/helpers');

/**
 * Search Service
 *
 * Smart search engine that can find anything purchasable on the web.
 *
 * Flow:
 * 1. Process the natural language query (intent detection, filter extraction)
 * 2. Check cache for existing results
 * 3. If miss, search the web via Google Shopping + retailer fallbacks
 * 4. Save to cache + DB for intelligence/learning
 * 5. Return ranked, deduplicated results
 */
class SearchService {
  constructor() {
    this.CACHE_TTL = 3600; // 1 hour cache
  }

  /**
   * Search for anything purchasable on the web
   *
   * @param {string} query - Natural language search query (e.g., "cheap wireless headphones under $50")
   * @param {Object} filters - { maxPrice, minPrice, minRating, category, retailers }
   * @param {number} limit - Max results
   * @param {Object} userPreferences - User's profile preferences (sizes, brands, etc.)
   * @param {Object} geo - { gl, hl, currency, currencySymbol, name } from geo.js
   * @returns {Object} { products, meta }
   */
  async search(query, filters = {}, limit = 10, userPreferences = {}, geo = null) {
    const rawQuery = sanitizeQuery(query);
    if (!rawQuery) {
      throw new Error('Search query is required');
    }

    // Step 1: Smart query processing
    const processed = queryProcessor.process(rawQuery, userPreferences);

    // Merge extracted filters with explicit filters (explicit takes precedence)
    const mergedFilters = {
      ...processed.filters,
      ...filters,
    };

    // Use the cleaned/enriched query for searching
    const searchQuery = processed.enrichedQuery || processed.cleanQuery;

    logger.info(`Smart search: "${rawQuery}" → "${searchQuery}"`, {
      intent: processed.intent,
      category: processed.category,
      filters: mergedFilters,
      geo: geo ? { gl: geo.gl, currency: geo.currency } : 'default',
    });

    // Step 2: Check cache (include geo in cache key)
    const cacheKey = this._buildCacheKey(searchQuery, mergedFilters, geo);
    const cached = await this._getFromCache(cacheKey);

    if (cached) {
      logger.info(`Cache hit for "${searchQuery}" (${cached.length} products)`);
      return {
        products: cached,
        meta: {
          source: 'cache',
          query: rawQuery,
          processedQuery: searchQuery,
          intent: processed.intent,
          category: processed.category,
          resultCount: cached.length,
          retailers: [...new Set(cached.map((p) => p.retailer))],
        },
      };
    }

    // Step 3: Search the web (routed by intent)
    let products;
    if (filters.retailers && filters.retailers.length > 0) {
      // Specific retailer search
      const results = await Promise.allSettled(
        filters.retailers.map((r) =>
          scraperManager.searchRetailer(r, searchQuery, mergedFilters, limit)
        )
      );
      products = results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => r.value);
    } else {
      // Universal search — intelligently routed by intent
      // Flights → Google Flights, Hotels → Google Hotels, Products → Google Shopping + Amazon
      // Geo params ensure results are localized to the user's country
      products = await scraperManager.searchAll(searchQuery, mergedFilters, limit, processed.intent, geo);
    }

    // Step 4: Save to cache + DB
    if (products.length > 0) {
      await this._saveToCache(cacheKey, products);
      await this._saveToDB(products, rawQuery);
    }

    // Step 5: Return results
    return {
      products: products.slice(0, limit),
      meta: {
        source: 'fresh',
        query: rawQuery,
        processedQuery: searchQuery,
        intent: processed.intent,
        category: processed.category,
        filters: mergedFilters,
        resultCount: products.length,
        retailers: [...new Set(products.map((p) => p.retailer))],
        sources: ['google-shopping', ...(products.length < 3 ? ['amazon'] : [])],
        scrapedAt: new Date().toISOString(),
        personalizedFor: null,
        geo: geo ? { gl: geo.gl, hl: geo.hl, currency: geo.currency } : null,
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
   * Build cache key from query + filters + geo
   */
  _buildCacheKey(query, filters, geo = null) {
    const filterStr = JSON.stringify({
      maxPrice: filters.maxPrice,
      minPrice: filters.minPrice,
      minRating: filters.minRating,
      retailers: filters.retailers,
      gl: geo?.gl || 'us',
    });
    return `search:${query.toLowerCase().replace(/\s+/g, '_')}:${Buffer.from(filterStr).toString('base64').substring(0, 20)}`;
  }

  /**
   * Get results from Redis cache
   */
  async _getFromCache(key) {
    try {
      const redis = getRedisClient();
      if (!redis) return null; // Redis not available — skip cache
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
      if (!redis) return; // Redis not available — skip cache
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
