const BaseScraper = require('./base.scraper');
const logger = require('../../utils/logger');
const { parsePrice } = require('../../utils/helpers');

/**
 * Google Shopping Scraper via Serper.dev API
 *
 * Uses Serper.dev (free 2,500 queries) to search Google Shopping,
 * which aggregates products from thousands of retailers:
 * Amazon, Walmart, Target, Best Buy, eBay, Nike, Apple, Nordstrom,
 * Costco, Home Depot, Wayfair, and thousands more.
 *
 * Sign up free at: https://serper.dev
 * Set SERPER_API_KEY in your .env
 *
 * This is our PRIMARY search provider because:
 * 1. Covers the ENTIRE web (not just one retailer)
 * 2. Fast (~300ms vs ~10s for Playwright)
 * 3. Reliable (no CAPTCHA / bot detection)
 * 4. Returns structured data (prices, ratings, retailers, images)
 */
class GoogleShoppingScraper extends BaseScraper {
  constructor() {
    super('google-shopping');
    this.apiUrl = 'https://google.serper.dev/shopping';
    this.apiKey = process.env.SERPER_API_KEY || '';
  }

  /**
   * Check if the API is configured
   */
  isAvailable() {
    return !!this.apiKey;
  }

  /**
   * Search Google Shopping for products across ALL retailers
   *
   * @param {string} query - Search query
   * @param {Object} filters - Price/rating filters
   * @param {number} limit - Max results
   * @param {Object} geo - { gl, hl, currency, currencySymbol } for country-aware search
   */
  async search(query, filters = {}, limit = 10, geo = null) {
    if (!this.apiKey) {
      logger.warn('Google Shopping: SERPER_API_KEY not set. Get free key at https://serper.dev');
      throw new Error('SERPER_API_KEY not configured');
    }

    try {
      const gl = geo?.gl || 'us';
      const hl = geo?.hl || 'en';
      const currency = geo?.currency || 'USD';
      const currencySymbol = geo?.currencySymbol || '$';

      logger.info(`Google Shopping API: searching "${query}" (gl=${gl}, hl=${hl}, currency=${currency})`);

      // Build the API request — geo params localize results
      const requestBody = {
        q: this._buildQuery(query, filters),
        gl,
        hl,
        num: Math.min(limit * 2, 40), // Request extra for post-filtering
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Serper API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const shoppingResults = data.shopping || [];

      logger.info(`Google Shopping API: received ${shoppingResults.length} results for "${query}"`);

      // Normalize results into our standard product format
      let products = shoppingResults.map((item) => this._normalizeProduct(item, currency, currencySymbol));

      // Filter out products without valid prices
      products = products.filter((p) => p.price && p.price > 0);

      // Apply price/rating filters
      products = this._applyFilters(products, filters);

      // Sort by relevance (combine rating + review count + price)
      products.sort((a, b) => {
        const scoreA = this._computeScore(a);
        const scoreB = this._computeScore(b);
        return scoreB - scoreA;
      });

      // Resolve Google redirect URLs → actual retailer URLs (for checkout engine)
      const topProducts = products.slice(0, limit);
      await this._resolveProductUrls(topProducts);

      return topProducts;
    } catch (error) {
      logger.error('Google Shopping API error:', { query, message: error.message });
      throw error;
    }
  }

  /**
   * Build query string with optional filters embedded
   */
  _buildQuery(query, filters) {
    let q = query;

    // Add price context if specified
    if (filters.maxPrice && !query.match(/under|below|less than|\$/i)) {
      q += ` under $${filters.maxPrice}`;
    }

    return q;
  }

  /**
   * Normalize a Serper shopping result into our standard product format
   */
  _normalizeProduct(item, currency = 'USD', currencySymbol = '$') {
    const price = parsePrice(item.price) || null;
    const retailer = this._cleanRetailer(item.source || '');

    return {
      externalId: this._generateId(item.title, item.link),
      retailer,
      title: item.title || '',
      description: item.snippet || '',
      brand: this._extractBrand(item.title || ''),
      category: '',
      images: item.imageUrl ? [item.imageUrl] : [],
      url: item.link || '',
      price,
      currency,
      currencySymbol,
      originalPrice: null,
      discount: null,
      rating: item.rating || null,
      reviewCount: item.ratingCount || 0,
      inStock: true,
      shippingInfo: {
        freeShipping: (item.delivery || '').toLowerCase().includes('free'),
        estimatedDays: null,
        cost: 0,
      },
      delivery: item.delivery || '',
      scrapedAt: new Date(),
      source: 'google-shopping',
    };
  }

  /**
   * Clean retailer name
   */
  _cleanRetailer(source) {
    if (!source) return 'Web';

    const mappings = {
      'amazon.com': 'Amazon',
      'walmart.com': 'Walmart',
      'target.com': 'Target',
      'bestbuy.com': 'Best Buy',
      'ebay.com': 'eBay',
      'etsy.com': 'Etsy',
      'newegg.com': 'Newegg',
      'homedepot.com': 'Home Depot',
      'costco.com': 'Costco',
      'macys.com': "Macy's",
      'nordstrom.com': 'Nordstrom',
      'nike.com': 'Nike',
      'adidas.com': 'Adidas',
      'apple.com': 'Apple',
      'bhphotovideo.com': 'B&H Photo',
      'wayfair.com': 'Wayfair',
      'zappos.com': 'Zappos',
      'rei.com': 'REI',
      'sephora.com': 'Sephora',
      'ulta.com': 'Ulta',
      'lowes.com': "Lowe's",
      'kohls.com': "Kohl's",
    };

    const sourceLower = source.toLowerCase();
    for (const [domain, name] of Object.entries(mappings)) {
      if (sourceLower.includes(domain) || sourceLower.includes(name.toLowerCase())) {
        return name;
      }
    }

    // Clean up the source name
    return source
      .replace(/\.com|www\.|https?:\/\//gi, '')
      .trim()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'Web';
  }

  /**
   * Extract brand from product title
   */
  _extractBrand(title) {
    if (!title) return '';
    const commonBrands = [
      'Apple', 'Samsung', 'Sony', 'Bose', 'Nike', 'Adidas', 'Dyson', 'LG',
      'Dell', 'HP', 'Lenovo', 'Microsoft', 'Google', 'JBL', 'Beats',
      'New Balance', 'Under Armour', 'Puma', 'Reebok', 'Asics', 'North Face',
      'Patagonia', 'Lululemon', 'Ray-Ban', 'Oakley', 'Canon', 'Nikon',
      'KitchenAid', 'Ninja', 'Instant Pot', 'Keurig', 'Vitamix',
      'Bose', 'Anker', 'Logitech', 'Razer', 'Corsair', 'SteelSeries',
    ];
    const titleLower = title.toLowerCase();
    for (const brand of commonBrands) {
      if (titleLower.includes(brand.toLowerCase())) return brand;
    }
    return '';
  }

  /**
   * Generate a stable ID from title + url
   */
  _generateId(title, url) {
    const str = `${title}-${url}`.substring(0, 100);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return `gshop_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Apply filters after fetching
   */
  _applyFilters(products, filters) {
    return products.filter((p) => {
      if (filters.maxPrice && p.price > filters.maxPrice) return false;
      if (filters.minPrice && p.price < filters.minPrice) return false;
      if (filters.minRating && p.rating && p.rating < filters.minRating) return false;
      return true;
    });
  }

  /**
   * Compute relevance score for sorting
   */
  _computeScore(product) {
    let score = 0;
    if (product.rating) score += product.rating * 2;
    if (product.reviewCount > 0) score += Math.log10(product.reviewCount + 1);
    if (product.images && product.images.length > 0) score += 0.5;
    if (product.url) score += 0.5;
    if (product.title && product.title.length > 20) score += 0.5;
    return score;
  }

  /**
   * Resolve Google Shopping URLs to actual retailer product page URLs
   *
   * Serper's shopping API returns Google comparison page URLs, NOT direct retailer links.
   * e.g. https://google.com/search?ibp=oshop&q=...
   *
   * We resolve them by doing a targeted organic search:
   *   "Product Title" site:retailer.com
   * This gives us the actual product page URL the checkout engine can navigate to.
   */
  async _resolveProductUrls(products) {
    if (!this.apiKey) return;

    const resolvePromises = products.map(async (product) => {
      if (!product.url) return;

      const url = product.url;

      // Already a direct retailer URL — no resolution needed
      if (!url.includes('google.com')) return;

      // Try to find the direct product page via organic search
      try {
        // Build a targeted search query
        const retailerDomain = this._getRetailerDomain(product.retailer);
        const searchQuery = retailerDomain
          ? `${product.title} site:${retailerDomain}`
          : `${product.title} buy`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ q: searchQuery, num: 3 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          logger.warn(`URL resolve search failed for "${product.title}": HTTP ${response.status}`);
          return;
        }

        const data = await response.json();
        const organicResults = data.organic || [];

        // Pick the first organic result that's a real product page
        for (const result of organicResults) {
          if (result.link && !result.link.includes('google.com')) {
            logger.info(`URL resolved: "${product.title.substring(0, 40)}" → ${result.link.substring(0, 80)}`);
            product.url = result.link;
            product._resolvedUrl = true;
            return;
          }
        }

        // No direct URL found — mark it
        logger.warn(`Could not resolve direct URL for "${product.title.substring(0, 40)}" from ${product.retailer}`);
        product._isGoogleShoppingPage = true;
      } catch (err) {
        logger.warn(`URL resolution failed for "${product.title?.substring(0, 40)}": ${err.message}`);
      }
    });

    await Promise.allSettled(resolvePromises);

    const resolved = products.filter((p) => p._resolvedUrl).length;
    const unresolved = products.filter((p) => p._isGoogleShoppingPage).length;
    if (resolved > 0 || unresolved > 0) {
      logger.info(`URL resolution: ${resolved} resolved, ${unresolved} unresolved out of ${products.length} products`);
    }
  }

  /**
   * Map retailer name to domain for targeted site: search
   */
  _getRetailerDomain(retailer) {
    if (!retailer) return null;

    const domainMap = {
      'Amazon': 'amazon.com',
      'Walmart': 'walmart.com',
      'Target': 'target.com',
      'Best Buy': 'bestbuy.com',
      'eBay': 'ebay.com',
      'Etsy': 'etsy.com',
      'Nike': 'nike.com',
      'Adidas': 'adidas.com',
      'Apple': 'apple.com',
      'Allbirds': 'allbirds.com',
      'Nordstrom': 'nordstrom.com',
      "Macy's": 'macys.com',
      'Zappos': 'zappos.com',
      'REI': 'rei.com',
      'Wayfair': 'wayfair.com',
      'Home Depot': 'homedepot.com',
      'Costco': 'costco.com',
      'Newegg': 'newegg.com',
      'Sephora': 'sephora.com',
      'B&H Photo': 'bhphotovideo.com',
      "Lowe's": 'lowes.com',
      "Kohl's": 'kohls.com',
      'Farfetch': 'farfetch.com',
    };

    return domainMap[retailer] || null;
  }
}

module.exports = new GoogleShoppingScraper();
