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

/**
 * Retailers that require an account to checkout — the AI checkout engine
 * uses guest checkout only, so results from these are filtered out.
 *
 * Each entry is either:
 *   { name: string }  — matched as exact retailer name (case-insensitive)
 *   { domain: string } — matched as domain substring in the product URL
 */
const BLOCKED_RETAILERS = [
  { name: 'amazon',      domain: 'amazon.'      }, // amazon.com, amazon.nl, amazon.de, etc.
  { name: 'bol.com',     domain: 'bol.com'      }, // bol.com only, not lobbes/bolero
  { name: 'zalando',     domain: 'zalando.'     },
  { name: 'aliexpress',  domain: 'aliexpress.'  },
  { name: 'ebay',        domain: 'ebay.'        },
];
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
  async search(query, filters = {}, limit = 10, geo = null, resolveUrls = false) {
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
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s — keep total request under 30s

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

      // Optionally resolve Google redirect URLs → actual retailer URLs.
      // Skip during chat searches (viewUrls point to our frontend, not the retailer directly).
      // Only resolve when resolveUrls=true (e.g. right before checkout).
      const candidates = products.slice(0, limit * 3);
      if (resolveUrls) {
        await this._resolveProductUrls(candidates, geo);
      }

      // Filter out retailers that require an account (guest checkout not supported).
      const beforeBlock = candidates.length;
      const filtered = candidates.filter((p) => !this._isBlockedRetailer(p.retailer, p.url));
      if (filtered.length < beforeBlock) {
        logger.info(`Filtered ${beforeBlock - filtered.length} results from account-required retailers`);
      }

      return filtered.slice(0, limit);
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
   * Check if a retailer is blocked (requires account, no guest checkout).
   *
   * Matching strategy (OR):
   *   1. name startsWith n  — catches "amazon.nl", "amazon.de", "zalando.nl", "ebay.nl", etc.
   *      Serper sometimes returns localised names (e.g. "Amazon.nl" instead of "Amazon")
   *      so we use startsWith rather than exact equality.
   *   2. url includes domain — catches cases where the URL was resolved to the retailer domain
   *      even if the retailer name wasn't normalised (e.g. google.com → amazon.nl link)
   */
  _isBlockedRetailer(retailer, url) {
    const name = (retailer || '').toLowerCase();
    const urlLower = (url || '').toLowerCase();
    return BLOCKED_RETAILERS.some(({ name: n, domain: d }) =>
      name.startsWith(n) || (d && urlLower.includes(d))
    );
  }

  /**
   * Public wrapper around _isBlockedRetailer — safe to call from other services.
   * Returns true if the retailer/URL combination is on the blocked list.
   */
  isBlockedRetailer(retailer, url) {
    return this._isBlockedRetailer(retailer, url);
  }

  /**
   * Clean retailer name
   */
  _cleanRetailer(source) {
    if (!source) return 'Web';

    const mappings = {
      // Netherlands / Benelux
      'coolblue.nl': 'Coolblue',
      'coolblue.be': 'Coolblue',
      'mediamarkt.nl': 'MediaMarkt',
      'mediamarkt.be': 'MediaMarkt',
      'wehkamp.nl': 'Wehkamp',
      'fonq.nl': 'Fonq',
      'expert.nl': 'Expert',
      'bcc.nl': 'BCC',
      'alternate.nl': 'Alternate',
      'vidaxl.nl': 'VidaXL',
      'vidaxl.com': 'VidaXL',
      'praxis.nl': 'Praxis',
      'gamma.nl': 'Gamma',
      'ikea.com': 'IKEA',
      'hema.nl': 'HEMA',
      'zara.com': 'Zara',
      'nelly.com': 'Nelly',
      'about-you.nl': 'About You',
      'about-you.be': 'About You',
      'boekenkraam.nl': 'Boekenkraam',
      'bruna.nl': 'Bruna',
      'managementboek.nl': 'Managementboek',
      // US
      'walmart.com': 'Walmart',
      'target.com': 'Target',
      'bestbuy.com': 'Best Buy',
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
  async _resolveProductUrls(products, geo = null) {
    if (!this.apiKey) return;

    const resolvePromises = products.map(async (product) => {
      if (!product.url) return;

      const url = product.url;

      // Already a direct retailer URL — no resolution needed
      if (!url.includes('google.com')) return;

      // Try to find the direct product page via organic search
      try {
        const retailerDomain = this._getRetailerDomain(product.retailer);

        // No domain mapping (e.g. Sony, Apple — brand stores that may not support the
        // user's country): skip resolution rather than pointing to a different retailer's
        // URL. That would mismatch the product metadata (title, price, retailer) with
        // the URL. The google.com URL stays and the caller filters the product out.
        if (!retailerDomain) {
          product._isGoogleShoppingPage = true;
          return;
        }

        const searchQuery = `${product.title} site:${retailerDomain}`;

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
   * Resolve a single google.com shopping URL to a direct retailer product URL.
   * Used at purchase time so we only make one Serper call (vs. 15 at search time).
   * Returns the resolved URL string, or null if resolution failed.
   */
  async resolveOneUrl(title, retailer, currentUrl, geo = null) {
    if (!this.apiKey) return null;
    if (currentUrl && !currentUrl.includes('google.com')) return currentUrl; // already direct

    try {
      const retailerDomain = this._getRetailerDomain(retailer);
      // No domain mapping → can't safely resolve without risking a URL from a different
      // retailer (which would mismatch the product's title/price/retailer metadata).
      if (!retailerDomain) return null;
      const searchQuery = `${title} site:${retailerDomain}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: searchQuery, num: 3 }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = await response.json();
      for (const result of (data.organic || [])) {
        if (result.link && !result.link.includes('google.com')) {
          logger.info(`[resolveOneUrl] "${title.substring(0, 40)}" → ${result.link.substring(0, 80)}`);
          return result.link;
        }
      }
    } catch (err) {
      logger.warn(`[resolveOneUrl] Failed for "${title?.substring(0, 40)}": ${err.message}`);
    }
    return null;
  }

  /**
   * Map retailer name to domain for targeted site: search
   */
  _getRetailerDomain(retailer) {
    if (!retailer) return null;

    const domainMap = {
      // Netherlands / Benelux
      'Coolblue': 'coolblue.nl',
      'MediaMarkt': 'mediamarkt.nl',
      'Wehkamp': 'wehkamp.nl',
      'Fonq': 'fonq.nl',
      'Expert': 'expert.nl',
      'BCC': 'bcc.nl',
      'Alternate': 'alternate.nl',
      'VidaXL': 'vidaxl.nl',
      'Praxis': 'praxis.nl',
      'Gamma': 'gamma.nl',
      'IKEA': 'ikea.com',
      'HEMA': 'hema.nl',
      'Zara': 'zara.com',
      'About You': 'about-you.nl',
      'Boekenkraam': 'boekenkraam.nl',
      'Bruna': 'bruna.nl',
      'Managementboek': 'managementboek.nl',
      // US
      'Walmart': 'walmart.com',
      'Target': 'target.com',
      'Best Buy': 'bestbuy.com',
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
