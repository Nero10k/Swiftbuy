const logger = require('../../utils/logger');
const { parsePrice } = require('../../utils/helpers');

/**
 * Google Flights / Travel Scraper via Serper.dev
 *
 * Uses Serper.dev's regular search endpoint which returns
 * Google Flights cards, hotel cards, and other travel-related
 * rich results directly from Google Search.
 *
 * One API key (SERPER_API_KEY) covers:
 * - Product shopping (google-shopping.scraper.js)
 * - Flight search (this file)
 * - Hotel search (this file)
 * - Event tickets (this file)
 *
 * Sign up free at: https://serper.dev (2,500 free queries)
 */
class GoogleTravelScraper {
  constructor() {
    this.searchUrl = 'https://google.serper.dev/search';
    this.apiKey = process.env.SERPER_API_KEY || '';
  }

  isAvailable() {
    return !!this.apiKey;
  }

  /**
   * Search for flights
   */
  async searchFlights(query, filters = {}, limit = 10) {
    if (!this.apiKey) {
      throw new Error('SERPER_API_KEY not configured — get free key at https://serper.dev');
    }

    try {
      logger.info(`Google Flights: searching "${query}"`);

      const response = await fetch(this.searchUrl, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: query,
          gl: 'us',
          hl: 'en',
          num: 20,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Serper API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      let results = [];

      // Extract from flights section (Google Flights cards)
      if (data.flights && Array.isArray(data.flights)) {
        const flightResults = data.flights.map((flight) => this._normalizeFlightFromCard(flight));
        results.push(...flightResults);
      }

      // Also extract from knowledge graph / answer box
      if (data.knowledgeGraph) {
        const kgResult = this._extractFlightFromKG(data.knowledgeGraph);
        if (kgResult) results.push(kgResult);
      }

      // Extract from organic results that contain flight info
      if (data.organic && Array.isArray(data.organic)) {
        const organicFlights = data.organic
          .filter((r) => this._isFlightResult(r))
          .map((r) => this._normalizeFlightFromOrganic(r));
        results.push(...organicFlights);
      }

      // Apply filters
      results = this._applyFilters(results, filters);

      logger.info(`Google Flights: found ${results.length} results for "${query}"`);
      return results.slice(0, limit);
    } catch (error) {
      logger.error('Google Flights error:', { query, message: error.message });
      throw error;
    }
  }

  /**
   * Search for hotels
   */
  async searchHotels(query, filters = {}, limit = 10) {
    if (!this.apiKey) {
      throw new Error('SERPER_API_KEY not configured — get free key at https://serper.dev');
    }

    try {
      logger.info(`Google Hotels: searching "${query}"`);

      const response = await fetch(this.searchUrl, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: query,
          gl: 'us',
          hl: 'en',
          num: 20,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Serper API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      let results = [];

      // Extract from organic results with hotel/travel info
      if (data.organic && Array.isArray(data.organic)) {
        const hotelResults = data.organic
          .filter((r) => this._isHotelResult(r))
          .map((r) => this._normalizeHotelFromOrganic(r));
        results.push(...hotelResults);
      }

      // Extract from knowledge graph
      if (data.knowledgeGraph) {
        const kgResult = this._extractHotelFromKG(data.knowledgeGraph);
        if (kgResult) results.push(kgResult);
      }

      // Apply filters
      results = this._applyFilters(results, filters);

      logger.info(`Google Hotels: found ${results.length} results for "${query}"`);
      return results.slice(0, limit);
    } catch (error) {
      logger.error('Google Hotels error:', { query, message: error.message });
      throw error;
    }
  }

  /**
   * Generic travel/event/ticket search
   */
  async searchGeneral(query, filters = {}, limit = 10) {
    if (!this.apiKey) {
      throw new Error('SERPER_API_KEY not configured — get free key at https://serper.dev');
    }

    try {
      logger.info(`Google Travel/General: searching "${query}"`);

      const response = await fetch(this.searchUrl, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: query,
          gl: 'us',
          hl: 'en',
          num: 20,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Serper API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      let results = [];

      // Extract from organic results
      if (data.organic && Array.isArray(data.organic)) {
        const organicResults = data.organic.slice(0, limit).map((r) => ({
          externalId: this._hashId(r.link || r.title),
          retailer: this._extractDomain(r.link),
          title: r.title || '',
          description: r.snippet || '',
          brand: '',
          category: 'travel',
          images: r.imageUrl ? [r.imageUrl] : [],
          url: r.link || '',
          price: this._extractPriceFromText(r.snippet || r.title || ''),
          currency: 'USD',
          originalPrice: null,
          discount: null,
          rating: r.rating || null,
          reviewCount: r.ratingCount || 0,
          inStock: true,
          shippingInfo: { freeShipping: false, estimatedDays: null, cost: 0 },
          scrapedAt: new Date(),
          source: 'google-search',
        }));
        results.push(...organicResults);
      }

      // Apply filters
      results = this._applyFilters(results, filters);

      return results.slice(0, limit);
    } catch (error) {
      logger.error('Google General search error:', { query, message: error.message });
      throw error;
    }
  }

  // ── Normalizers ──────────────────────────────────────────────

  _normalizeFlightFromCard(flight) {
    return {
      externalId: this._hashId(JSON.stringify(flight)),
      retailer: flight.source || 'Google Flights',
      title: `${flight.departure_airport || ''} → ${flight.arrival_airport || ''} — ${flight.airline || 'Flight'}`,
      description: [
        flight.airline,
        flight.duration,
        flight.stops ? `${flight.stops} stop(s)` : 'Nonstop',
        flight.departure_time,
        flight.arrival_time,
      ].filter(Boolean).join(' · '),
      brand: flight.airline || '',
      category: 'flight',
      images: flight.airline_logo ? [flight.airline_logo] : [],
      url: flight.link || `https://www.google.com/travel/flights?q=${encodeURIComponent(flight.departure_airport + ' to ' + flight.arrival_airport)}`,
      price: parsePrice(flight.price) || null,
      currency: 'USD',
      originalPrice: null,
      discount: null,
      rating: null,
      reviewCount: 0,
      inStock: true,
      flightDetails: {
        airline: flight.airline || '',
        departureAirport: flight.departure_airport || '',
        arrivalAirport: flight.arrival_airport || '',
        departureTime: flight.departure_time || '',
        arrivalTime: flight.arrival_time || '',
        duration: flight.duration || '',
        stops: flight.stops || 0,
        flightNumber: flight.flight_number || '',
      },
      shippingInfo: { freeShipping: false, estimatedDays: null, cost: 0 },
      scrapedAt: new Date(),
      source: 'google-flights',
    };
  }

  _normalizeFlightFromOrganic(result) {
    return {
      externalId: this._hashId(result.link || result.title),
      retailer: this._extractDomain(result.link),
      title: result.title || '',
      description: result.snippet || '',
      brand: '',
      category: 'flight',
      images: result.imageUrl ? [result.imageUrl] : [],
      url: result.link || '',
      price: this._extractPriceFromText(result.snippet || result.title || ''),
      currency: 'USD',
      originalPrice: null,
      discount: null,
      rating: result.rating || null,
      reviewCount: result.ratingCount || 0,
      inStock: true,
      shippingInfo: { freeShipping: false, estimatedDays: null, cost: 0 },
      scrapedAt: new Date(),
      source: 'google-search',
    };
  }

  _normalizeHotelFromOrganic(result) {
    return {
      externalId: this._hashId(result.link || result.title),
      retailer: this._extractDomain(result.link),
      title: result.title || '',
      description: result.snippet || '',
      brand: '',
      category: 'hotel',
      images: result.imageUrl ? [result.imageUrl] : [],
      url: result.link || '',
      price: this._extractPriceFromText(result.snippet || result.title || ''),
      currency: 'USD',
      originalPrice: null,
      discount: null,
      rating: result.rating || null,
      reviewCount: result.ratingCount || 0,
      inStock: true,
      shippingInfo: { freeShipping: false, estimatedDays: null, cost: 0 },
      scrapedAt: new Date(),
      source: 'google-search',
    };
  }

  _extractFlightFromKG(kg) {
    if (!kg || !kg.title) return null;
    const titleLower = (kg.title || '').toLowerCase();
    if (!titleLower.includes('flight') && !titleLower.includes('airline')) return null;

    return {
      externalId: this._hashId(kg.title),
      retailer: 'Google',
      title: kg.title,
      description: kg.description || '',
      brand: '',
      category: 'flight',
      images: kg.imageUrl ? [kg.imageUrl] : [],
      url: kg.website || '',
      price: null,
      currency: 'USD',
      originalPrice: null,
      discount: null,
      rating: kg.rating || null,
      reviewCount: kg.ratingCount || 0,
      inStock: true,
      shippingInfo: { freeShipping: false, estimatedDays: null, cost: 0 },
      scrapedAt: new Date(),
      source: 'google-knowledge',
    };
  }

  _extractHotelFromKG(kg) {
    if (!kg || !kg.title) return null;
    const titleLower = (kg.title || '').toLowerCase();
    if (!titleLower.includes('hotel') && !titleLower.includes('resort') && !titleLower.includes('inn')) return null;

    return {
      externalId: this._hashId(kg.title),
      retailer: 'Google',
      title: kg.title,
      description: kg.description || '',
      brand: '',
      category: 'hotel',
      images: kg.imageUrl ? [kg.imageUrl] : [],
      url: kg.website || '',
      price: this._extractPriceFromText(kg.description || ''),
      currency: 'USD',
      originalPrice: null,
      discount: null,
      rating: kg.rating || null,
      reviewCount: kg.ratingCount || 0,
      inStock: true,
      shippingInfo: { freeShipping: false, estimatedDays: null, cost: 0 },
      scrapedAt: new Date(),
      source: 'google-knowledge',
    };
  }

  // ── Helpers ──────────────────────────────────────────────────

  _isFlightResult(result) {
    const text = `${result.title} ${result.snippet}`.toLowerCase();
    const flightDomains = ['google.com/travel', 'kayak.com', 'skyscanner', 'expedia.com', 'kiwi.com', 'cheapflights', 'momondo', 'priceline', 'orbitz', 'hopper'];
    const flightKeywords = ['flight', 'airline', 'airfare', 'fly ', 'nonstop', 'round trip', 'one-way', 'departure', 'arrival'];
    const linkLower = (result.link || '').toLowerCase();

    return flightDomains.some((d) => linkLower.includes(d)) || flightKeywords.some((k) => text.includes(k));
  }

  _isHotelResult(result) {
    const text = `${result.title} ${result.snippet}`.toLowerCase();
    const hotelDomains = ['booking.com', 'hotels.com', 'airbnb.com', 'expedia.com', 'trivago', 'marriott.com', 'hilton.com', 'hyatt.com', 'ihg.com'];
    const hotelKeywords = ['hotel', 'resort', 'accommodation', 'per night', '/night', 'check-in', 'check-out', 'rooms'];
    const linkLower = (result.link || '').toLowerCase();

    return hotelDomains.some((d) => linkLower.includes(d)) || hotelKeywords.some((k) => text.includes(k));
  }

  _extractPriceFromText(text) {
    if (!text) return null;
    const match = text.match(/\$[\d,]+(?:\.\d{2})?/);
    if (match) return parsePrice(match[0]);

    const euroMatch = text.match(/€[\d,]+(?:\.\d{2})?/);
    if (euroMatch) return parsePrice(euroMatch[0]);

    return null;
  }

  _extractDomain(url) {
    if (!url) return 'Web';
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      const name = hostname.split('.')[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
      return 'Web';
    }
  }

  _hashId(str) {
    const s = (str || '').substring(0, 100);
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash |= 0;
    }
    return `gtravel_${Math.abs(hash).toString(36)}`;
  }

  _applyFilters(results, filters) {
    return results.filter((r) => {
      if (filters.maxPrice && r.price && r.price > filters.maxPrice) return false;
      if (filters.minPrice && r.price && r.price < filters.minPrice) return false;
      return true;
    });
  }
}

module.exports = new GoogleTravelScraper();

