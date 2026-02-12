const logger = require('../../utils/logger');
const amazonScraper = require('./amazon.scraper');
const googleShoppingScraper = require('./google-shopping.scraper');
const googleTravelScraper = require('./google-flights.scraper');

/**
 * Scraper Manager
 *
 * Orchestrates searching across the entire web for ANYTHING purchasable:
 * products, flights, hotels, event tickets, food delivery, and more.
 *
 * Routing strategy based on intent:
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  "wireless headphones"   →  Google Shopping  →  Amazon     │
 * │  "flight BUH to AMS"     →  Google Flights   →  (travel)   │
 * │  "hotel Times Square"    →  Google Hotels    →  (travel)    │
 * │  "concert tickets NYC"   →  Google Search    →  (events)    │
 * │  "macbook pro"           →  Google Shopping  →  Amazon      │
 * └─────────────────────────────────────────────────────────────┘
 *
 * All powered by one Serper.dev API key (free 2,500 queries).
 * Amazon Playwright scraper acts as fallback for products.
 */
class ScraperManager {
  constructor() {
    // Product search providers
    this.retailerScrapers = {
      amazon: amazonScraper,
    };

    // Universal providers
    this.universalProviders = {
      'google-shopping': googleShoppingScraper,
    };

    // Travel/service providers
    this.travelProvider = googleTravelScraper;
  }

  /**
   * Get all available sources
   */
  getAvailableSources() {
    return {
      universal: Object.keys(this.universalProviders),
      retailers: Object.keys(this.retailerScrapers),
      travel: this.travelProvider.isAvailable() ? ['flights', 'hotels', 'events'] : [],
    };
  }

  /**
   * Search a specific retailer directly
   */
  async searchRetailer(retailer, query, filters = {}, limit = 10) {
    const scraper = this.retailerScrapers[retailer];
    if (!scraper) {
      throw new Error(`Direct scraper not available for retailer: ${retailer}`);
    }
    return scraper.search(query, filters, limit);
  }

  /**
   * Universal search — intelligently routes based on intent
   *
   * @param {string} query - Search query
   * @param {Object} filters - Price/rating filters
   * @param {number} limit - Max results
   * @param {string} intent - Query intent (product, flight, hotel, tickets, food)
   */
  async searchAll(query, filters = {}, limit = 10, intent = 'product') {
    logger.info(`🔍 Universal search for "${query}" | intent: ${intent} | limit: ${limit}`);

    // Route to the correct search provider based on intent
    switch (intent) {
      case 'flight':
        return this._searchFlights(query, filters, limit);
      case 'hotel':
        return this._searchHotels(query, filters, limit);
      case 'tickets':
      case 'food':
      case 'subscription':
        return this._searchGeneral(query, filters, limit, intent);
      default:
        return this._searchProducts(query, filters, limit);
    }
  }

  /**
   * Search for PRODUCTS (Google Shopping → Amazon fallback)
   */
  async _searchProducts(query, filters, limit) {
    const results = {
      products: [],
      sources: [],
      errors: [],
    };

    // Phase 1: Google Shopping via Serper.dev API (searches the ENTIRE web)
    if (googleShoppingScraper.isAvailable()) {
      try {
        logger.info('Phase 1: Searching Google Shopping API (universal — all retailers)...');
        const googleResults = await googleShoppingScraper.search(query, filters, limit);

        if (googleResults.length > 0) {
          results.products.push(...googleResults);
          results.sources.push('google-shopping');
          logger.info(`Google Shopping: found ${googleResults.length} products from multiple retailers`);
        }
      } catch (error) {
        logger.warn(`Google Shopping API failed: ${error.message}`);
        results.errors.push({ source: 'google-shopping', error: error.message });
      }
    } else {
      logger.info('Google Shopping API not configured (set SERPER_API_KEY in .env — free at https://serper.dev)');
    }

    // Phase 2: Amazon direct scraper (fallback when API unavailable or returned too few results)
    if (results.products.length < 3) {
      try {
        logger.info(`Phase 2: ${results.products.length === 0 ? 'Primary' : 'Supplementing with'} Amazon direct search...`);
        const amazonResults = await amazonScraper.search(query, filters, limit);

        if (amazonResults.length > 0) {
          results.products.push(...amazonResults);
          results.sources.push('amazon');
          logger.info(`Amazon: found ${amazonResults.length} products`);
        }
      } catch (error) {
        logger.warn(`Amazon fallback failed: ${error.message}`);
        results.errors.push({ source: 'amazon', error: error.message });
      }
    }

    // Phase 3: Deduplicate and rank
    const deduped = this._deduplicateProducts(results.products);
    const ranked = this._rankProducts(deduped, query);

    logger.info(
      `Product search complete: ${ranked.length} unique products from [${results.sources.join(', ')}]`
    );

    return ranked.slice(0, limit);
  }

  /**
   * Search for FLIGHTS (Google Flights via Serper → Google Search fallback)
   */
  async _searchFlights(query, filters, limit) {
    if (!this.travelProvider.isAvailable()) {
      logger.warn('Flight search requires SERPER_API_KEY — get free key at https://serper.dev');
      return [];
    }

    try {
      const results = await this.travelProvider.searchFlights(query, filters, limit);
      logger.info(`Flight search: found ${results.length} results`);
      return results;
    } catch (error) {
      logger.error(`Flight search failed: ${error.message}`);

      // Fallback: try general search for flight deals
      try {
        const fallback = await this.travelProvider.searchGeneral(
          `${query} book flights deals`,
          filters,
          limit
        );
        return fallback;
      } catch (e) {
        logger.error(`Flight search fallback also failed: ${e.message}`);
        return [];
      }
    }
  }

  /**
   * Search for HOTELS (Google Hotels via Serper)
   */
  async _searchHotels(query, filters, limit) {
    if (!this.travelProvider.isAvailable()) {
      logger.warn('Hotel search requires SERPER_API_KEY — get free key at https://serper.dev');
      return [];
    }

    try {
      const results = await this.travelProvider.searchHotels(query, filters, limit);
      logger.info(`Hotel search: found ${results.length} results`);
      return results;
    } catch (error) {
      logger.error(`Hotel search failed: ${error.message}`);

      // Fallback: general search
      try {
        const fallback = await this.travelProvider.searchGeneral(
          `${query} book hotel deals`,
          filters,
          limit
        );
        return fallback;
      } catch (e) {
        return [];
      }
    }
  }

  /**
   * Search for TICKETS, FOOD, or other services
   */
  async _searchGeneral(query, filters, limit, intent) {
    // First try Google Shopping (some tickets are sold there)
    let results = [];

    if (googleShoppingScraper.isAvailable()) {
      try {
        results = await googleShoppingScraper.search(query, filters, limit);
      } catch (e) {
        logger.warn(`Shopping search failed for ${intent}: ${e.message}`);
      }
    }

    // Supplement with general web search
    if (results.length < 3 && this.travelProvider.isAvailable()) {
      try {
        const generalResults = await this.travelProvider.searchGeneral(query, filters, limit);
        results.push(...generalResults);
      } catch (e) {
        logger.warn(`General search failed for ${intent}: ${e.message}`);
      }
    }

    // Amazon fallback for physical products (tickets, gift cards)
    if (results.length < 3) {
      try {
        const amazonResults = await amazonScraper.search(query, filters, limit);
        results.push(...amazonResults);
      } catch (e) {
        logger.warn(`Amazon fallback failed for ${intent}: ${e.message}`);
      }
    }

    return this._rankProducts(results, query).slice(0, limit);
  }

  /**
   * Deduplicate products that appear in multiple sources
   */
  _deduplicateProducts(products) {
    const seen = new Map();

    for (const product of products) {
      const key = this._normalizeForDedup(product.title);

      if (seen.has(key)) {
        const existing = seen.get(key);
        if (this._productQualityScore(product) > this._productQualityScore(existing)) {
          seen.set(key, product);
        }
      } else {
        seen.set(key, product);
      }
    }

    return Array.from(seen.values());
  }

  _normalizeForDedup(title) {
    if (!title) return '';
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 80);
  }

  _productQualityScore(product) {
    let score = 0;
    if (product.title && product.title.length > 10) score += 2;
    if (product.price) score += 2;
    if (product.rating) score += 2;
    if (product.reviewCount > 0) score += 1;
    if (product.url && product.url.startsWith('http')) score += 2;
    if (product.images && product.images.length > 0) score += 1;
    if (product.brand) score += 1;
    return score;
  }

  _rankProducts(products, query) {
    const queryWords = query.toLowerCase().split(/\s+/);

    return products.sort((a, b) => {
      const scoreA = this._relevanceScore(a, queryWords);
      const scoreB = this._relevanceScore(b, queryWords);
      return scoreB - scoreA;
    });
  }

  _relevanceScore(product, queryWords) {
    let score = 0;
    const title = (product.title || '').toLowerCase();

    for (const word of queryWords) {
      if (title.includes(word)) score += 3;
    }

    const fullQuery = queryWords.join(' ');
    if (title.includes(fullQuery)) score += 5;

    if (product.rating) score += product.rating * 1.5;
    if (product.reviewCount > 0) score += Math.log10(product.reviewCount + 1) * 2;
    if (product.images && product.images.length > 0) score += 1;
    if (product.url && product.url.startsWith('http')) score += 1;
    score += this._productQualityScore(product) * 0.5;

    return score;
  }

  /**
   * Get product details from appropriate scraper
   */
  async getProductDetails(retailer, url) {
    const scraper = this.retailerScrapers[retailer];
    if (scraper) {
      return scraper.getProductDetails(url);
    }

    const detectedRetailer = this._detectRetailerFromUrl(url);
    if (detectedRetailer && this.retailerScrapers[detectedRetailer]) {
      return this.retailerScrapers[detectedRetailer].getProductDetails(url);
    }

    throw new Error(`No detailed scraper available for retailer: ${retailer}`);
  }

  _detectRetailerFromUrl(url) {
    if (!url) return null;
    const urlLower = url.toLowerCase();
    if (urlLower.includes('amazon.com')) return 'amazon';
    if (urlLower.includes('walmart.com')) return 'walmart';
    if (urlLower.includes('target.com')) return 'target';
    if (urlLower.includes('bestbuy.com')) return 'bestbuy';
    if (urlLower.includes('ebay.com')) return 'ebay';
    return null;
  }
}

module.exports = new ScraperManager();
