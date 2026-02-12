const logger = require('../../utils/logger');

/**
 * Smart Query Processor
 *
 * Understands what the user is actually looking for and enriches the query
 * to get the best possible search results. Handles:
 *
 * - Intent detection (product, flight, hotel, food, event, service)
 * - Natural language parsing ("cheap wireless headphones under $50")
 * - Query enrichment (adding context for better results)
 * - Filter extraction from natural language
 * - Category detection
 */
class QueryProcessor {
  constructor() {
    // Intent patterns — what kind of thing is the user looking for?
    this.intentPatterns = {
      flight: {
        keywords: ['flight', 'flights', 'fly', 'flying', 'airline', 'airfare', 'plane ticket', 'round trip', 'one way', 'nonstop'],
        category: 'travel',
        searchPrefix: '',
        providers: ['Google Flights', 'Kayak', 'Skyscanner'],
      },
      hotel: {
        keywords: ['hotel', 'hotels', 'accommodation', 'stay', 'resort', 'motel', 'hostel', 'airbnb', 'booking', 'lodge'],
        category: 'travel',
        searchPrefix: '',
        providers: ['Booking.com', 'Hotels.com', 'Airbnb'],
      },
      food: {
        keywords: ['food', 'restaurant', 'delivery', 'order food', 'meal', 'dinner', 'lunch', 'breakfast', 'takeout', 'uber eats', 'doordash', 'grubhub'],
        category: 'food',
        searchPrefix: '',
        providers: ['UberEats', 'DoorDash', 'GrubHub'],
      },
      tickets: {
        keywords: ['ticket', 'tickets', 'concert', 'event', 'show', 'game', 'festival', 'theater', 'theatre', 'sports'],
        category: 'entertainment',
        searchPrefix: 'tickets for',
        providers: ['Ticketmaster', 'StubHub', 'SeatGeek'],
      },
      subscription: {
        keywords: ['subscription', 'subscribe', 'membership', 'plan', 'monthly', 'annual'],
        category: 'subscription',
        searchPrefix: '',
        providers: [],
      },
      electronics: {
        keywords: ['phone', 'laptop', 'tablet', 'headphones', 'earbuds', 'speaker', 'monitor', 'keyboard', 'mouse', 'camera', 'tv', 'television', 'smartwatch', 'computer', 'gaming', 'console', 'playstation', 'xbox', 'nintendo'],
        category: 'electronics',
        searchPrefix: '',
      },
      clothing: {
        keywords: ['shirt', 'pants', 'jeans', 'jacket', 'coat', 'dress', 'shoes', 'sneakers', 'boots', 'hoodie', 'sweater', 'socks', 'underwear', 't-shirt', 'shorts'],
        category: 'clothing',
        searchPrefix: '',
      },
      home: {
        keywords: ['furniture', 'couch', 'sofa', 'table', 'chair', 'bed', 'mattress', 'lamp', 'rug', 'curtain', 'pillow', 'kitchen', 'appliance'],
        category: 'home',
        searchPrefix: '',
      },
      beauty: {
        keywords: ['makeup', 'skincare', 'perfume', 'cologne', 'shampoo', 'conditioner', 'moisturizer', 'serum', 'foundation', 'lipstick'],
        category: 'beauty',
        searchPrefix: '',
      },
    };

    // Price extraction patterns
    this.pricePatterns = [
      /under\s*\$?(\d+(?:\.\d+)?)/i,
      /below\s*\$?(\d+(?:\.\d+)?)/i,
      /less\s+than\s*\$?(\d+(?:\.\d+)?)/i,
      /max(?:imum)?\s*(?:price)?\s*\$?(\d+(?:\.\d+)?)/i,
      /budget\s*(?:of|is)?\s*\$?(\d+(?:\.\d+)?)/i,
      /\$?(\d+(?:\.\d+)?)\s*(?:or\s+)?(?:less|max)/i,
      /above\s*\$?(\d+(?:\.\d+)?)/i,
      /over\s*\$?(\d+(?:\.\d+)?)/i,
      /more\s+than\s*\$?(\d+(?:\.\d+)?)/i,
      /min(?:imum)?\s*(?:price)?\s*\$?(\d+(?:\.\d+)?)/i,
      /at\s+least\s*\$?(\d+(?:\.\d+)?)/i,
      /\$(\d+)\s*-\s*\$?(\d+)/i, // "$50 - $100" range
      /between\s*\$?(\d+)\s*(?:and|-)\s*\$?(\d+)/i,
    ];

    // Quality / preference signals
    this.qualitySignals = {
      cheap: { priceSort: 'asc', priceWeight: 0.8 },
      affordable: { priceSort: 'asc', priceWeight: 0.7 },
      budget: { priceSort: 'asc', priceWeight: 0.8 },
      premium: { priceSort: 'desc', qualityWeight: 0.9 },
      luxury: { priceSort: 'desc', qualityWeight: 1.0 },
      'high-end': { priceSort: 'desc', qualityWeight: 0.9 },
      'best rated': { ratingSort: 'desc', ratingWeight: 1.0 },
      'top rated': { ratingSort: 'desc', ratingWeight: 1.0 },
      popular: { reviewSort: 'desc', reviewWeight: 0.8 },
      bestselling: { reviewSort: 'desc', reviewWeight: 0.9 },
    };
  }

  /**
   * Process a natural language query into a structured search request
   *
   * Input:  "cheap wireless headphones under $50 with good reviews"
   * Output: {
   *   cleanQuery: "wireless headphones",
   *   intent: "electronics",
   *   category: "electronics",
   *   filters: { maxPrice: 50, minRating: 4.0 },
   *   signals: { priceSort: "asc", ratingWeight: 0.8 },
   *   enrichedQuery: "wireless headphones best value",
   *   searchable: true,
   *   provider: "google-shopping"
   * }
   */
  process(rawQuery, userPreferences = {}) {
    const query = rawQuery.trim().toLowerCase();

    logger.info(`QueryProcessor: processing "${rawQuery}"`);

    // 1. Detect intent
    const intent = this._detectIntent(query);

    // 2. Extract price filters from natural language
    const priceFilters = this._extractPriceFilters(query);

    // 3. Detect quality signals
    const signals = this._extractSignals(query);

    // 4. Clean the query (remove price references, qualifiers)
    const cleanQuery = this._cleanQuery(query);

    // 5. Enrich query based on intent + preferences
    const enrichedQuery = this._enrichQuery(cleanQuery, intent, userPreferences);

    // 6. Determine which search provider to use
    const provider = this._determineProvider(intent);

    // 7. Build complete filters
    const filters = {
      ...priceFilters,
      ...(signals.ratingWeight ? { minRating: 4.0 } : {}),
    };

    const result = {
      originalQuery: rawQuery,
      cleanQuery,
      enrichedQuery,
      intent: intent.type,
      category: intent.category,
      filters,
      signals,
      searchable: true,
      provider,
      providerHint: intent.providers || [],
    };

    logger.info('QueryProcessor result:', result);
    return result;
  }

  /**
   * Detect the user's intent from the query
   */
  _detectIntent(query) {
    for (const [type, pattern] of Object.entries(this.intentPatterns)) {
      for (const keyword of pattern.keywords) {
        if (query.includes(keyword)) {
          return {
            type,
            category: pattern.category || type,
            searchPrefix: pattern.searchPrefix || '',
            providers: pattern.providers || [],
          };
        }
      }
    }
    // Default: general product search
    return { type: 'product', category: 'general', searchPrefix: '', providers: [] };
  }

  /**
   * Extract price filters from natural language
   */
  _extractPriceFilters(query) {
    const filters = {};

    for (const pattern of this.pricePatterns) {
      const match = query.match(pattern);
      if (!match) continue;

      const patternStr = pattern.source;

      // Range pattern: "$50 - $100" or "between 50 and 100"
      if (match[2]) {
        filters.minPrice = parseFloat(match[1]);
        filters.maxPrice = parseFloat(match[2]);
        break;
      }

      // "Under / below / less than" → maxPrice
      if (patternStr.includes('under') || patternStr.includes('below') || patternStr.includes('less')) {
        filters.maxPrice = parseFloat(match[1]);
        break;
      }

      // "Above / over / more than" → minPrice
      if (patternStr.includes('above') || patternStr.includes('over') || patternStr.includes('more')) {
        filters.minPrice = parseFloat(match[1]);
        break;
      }

      // "Max / budget" → maxPrice
      if (patternStr.includes('max') || patternStr.includes('budget')) {
        filters.maxPrice = parseFloat(match[1]);
        break;
      }

      // "Min / at least" → minPrice
      if (patternStr.includes('min') || patternStr.includes('least')) {
        filters.minPrice = parseFloat(match[1]);
        break;
      }
    }

    return filters;
  }

  /**
   * Extract quality / preference signals
   */
  _extractSignals(query) {
    const signals = {};
    for (const [keyword, signal] of Object.entries(this.qualitySignals)) {
      if (query.includes(keyword)) {
        Object.assign(signals, signal);
      }
    }
    return signals;
  }

  /**
   * Clean the query by removing price references, qualifiers, and filler words
   */
  _cleanQuery(query) {
    let cleaned = query;

    // Remove price references
    cleaned = cleaned.replace(/under\s*\$?\d+(?:\.\d+)?/gi, '');
    cleaned = cleaned.replace(/below\s*\$?\d+(?:\.\d+)?/gi, '');
    cleaned = cleaned.replace(/less\s+than\s*\$?\d+(?:\.\d+)?/gi, '');
    cleaned = cleaned.replace(/above\s*\$?\d+(?:\.\d+)?/gi, '');
    cleaned = cleaned.replace(/over\s*\$?\d+(?:\.\d+)?/gi, '');
    cleaned = cleaned.replace(/more\s+than\s*\$?\d+(?:\.\d+)?/gi, '');
    cleaned = cleaned.replace(/\$\d+\s*-\s*\$?\d+/gi, '');
    cleaned = cleaned.replace(/between\s*\$?\d+\s*(?:and|-)\s*\$?\d+/gi, '');
    cleaned = cleaned.replace(/max(?:imum)?\s*(?:price)?\s*\$?\d+(?:\.\d+)?/gi, '');
    cleaned = cleaned.replace(/min(?:imum)?\s*(?:price)?\s*\$?\d+(?:\.\d+)?/gi, '');
    cleaned = cleaned.replace(/budget\s*(?:of|is)?\s*\$?\d+(?:\.\d+)?/gi, '');
    cleaned = cleaned.replace(/\$\d+(?:\.\d+)?\s*(?:or\s+)?(?:less|max)/gi, '');

    // Remove quality words (they're captured in signals)
    const qualityWords = ['cheap', 'affordable', 'budget', 'premium', 'luxury', 'high-end',
      'best rated', 'top rated', 'popular', 'bestselling', 'good reviews', 'great reviews',
      'with reviews', 'well reviewed'];
    for (const word of qualityWords) {
      cleaned = cleaned.replace(new RegExp(word, 'gi'), '');
    }

    // Remove filler words
    const fillers = ['find me', 'search for', 'look for', 'i want', 'i need', 'get me',
      'buy me', 'please', 'can you', 'could you', 'i\'d like', 'looking for',
      'show me', 'find', 'buy', 'purchase', 'order', 'the best', 'a good',
      'some good', 'really good', 'with good', 'dollars', 'dollar', 'bucks',
      'with', 'and', 'that has', 'that have', 'which has', 'which have'];
    for (const filler of fillers) {
      cleaned = cleaned.replace(new RegExp(`\\b${filler}\\b`, 'gi'), '');
    }

    // Clean up whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned || query.trim(); // fallback to original if we cleaned too much
  }

  /**
   * Enrich the query for better search results
   */
  _enrichQuery(cleanQuery, intent, userPreferences = {}) {
    let enriched = cleanQuery;

    // Add intent-specific prefix
    if (intent.searchPrefix) {
      enriched = `${intent.searchPrefix} ${enriched}`;
    }

    // Add size if we know the user's preferences for clothing
    if (intent.category === 'clothing' && userPreferences.sizes) {
      // Don't add to the search query — sizes are better handled as filters
    }

    return enriched.trim();
  }

  /**
   * Determine which search provider to use based on intent
   */
  _determineProvider(intent) {
    // For now, Google Shopping handles everything purchasable
    // In the future, we'd route flights to Amadeus API, hotels to Booking API, etc.
    switch (intent.type) {
      case 'flight':
        return 'google-shopping'; // Google Shopping also shows flights
      case 'hotel':
        return 'google-shopping';
      case 'food':
        return 'google-shopping'; // For food products; restaurant delivery would use different provider
      case 'tickets':
        return 'google-shopping';
      default:
        return 'google-shopping';
    }
  }
}

module.exports = new QueryProcessor();

