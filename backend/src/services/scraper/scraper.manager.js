const logger = require('../../utils/logger');
const amazonScraper = require('./amazon.scraper');

/**
 * Scraper Manager
 * Orchestrates scraping across multiple retailers
 */
class ScraperManager {
  constructor() {
    this.scrapers = {
      amazon: amazonScraper,
      // Future: walmart, target, bestbuy, ebay
    };
  }

  /**
   * Get available retailer names
   */
  getAvailableRetailers() {
    return Object.keys(this.scrapers);
  }

  /**
   * Search a specific retailer
   */
  async searchRetailer(retailer, query, filters = {}, limit = 10) {
    const scraper = this.scrapers[retailer];
    if (!scraper) {
      throw new Error(`Scraper not available for retailer: ${retailer}`);
    }
    return scraper.search(query, filters, limit);
  }

  /**
   * Search across all available retailers
   * Returns combined + sorted results
   */
  async searchAll(query, filters = {}, limit = 10) {
    const retailers = Object.keys(this.scrapers);
    const perRetailerLimit = Math.ceil(limit / retailers.length);

    logger.info(`Searching ${retailers.length} retailers for "${query}"`);

    // Search all retailers in parallel
    const results = await Promise.allSettled(
      retailers.map((retailer) =>
        this.scrapers[retailer].search(query, filters, perRetailerLimit)
      )
    );

    // Collect successful results
    let allProducts = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allProducts = allProducts.concat(result.value);
        logger.info(`${retailers[index]}: found ${result.value.length} products`);
      } else {
        logger.error(`${retailers[index]}: search failed - ${result.reason.message}`);
      }
    });

    // Sort by relevance (combination of rating and review count)
    allProducts.sort((a, b) => {
      const scoreA = (a.rating || 0) * Math.log10((a.reviewCount || 1) + 1);
      const scoreB = (b.rating || 0) * Math.log10((b.reviewCount || 1) + 1);
      return scoreB - scoreA;
    });

    return allProducts.slice(0, limit);
  }

  /**
   * Get product details from appropriate scraper
   */
  async getProductDetails(retailer, url) {
    const scraper = this.scrapers[retailer];
    if (!scraper) {
      throw new Error(`Scraper not available for retailer: ${retailer}`);
    }
    return scraper.getProductDetails(url);
  }
}

module.exports = new ScraperManager();


