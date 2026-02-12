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
   */
  async search(query, filters = {}, limit = 10) {
    if (!this.apiKey) {
      logger.warn('Google Shopping: SERPER_API_KEY not set. Get free key at https://serper.dev');
      throw new Error('SERPER_API_KEY not configured');
    }

    try {
      logger.info(`Google Shopping API: searching "${query}"`);

      // Build the API request
      const requestBody = {
        q: this._buildQuery(query, filters),
        gl: 'us',
        hl: 'en',
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
      let products = shoppingResults.map((item) => this._normalizeProduct(item));

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

      return products.slice(0, limit);
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
  _normalizeProduct(item) {
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
      currency: 'USD',
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
}

module.exports = new GoogleShoppingScraper();
