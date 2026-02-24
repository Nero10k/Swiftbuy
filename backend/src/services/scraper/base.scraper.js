/**
 * Base Scraper Interface
 * All retailer scrapers extend this class
 */
class BaseScraper {
  constructor(retailerName) {
    this.retailerName = retailerName;
  }

  /**
   * Search for products
   * @param {string} query - Search query
   * @param {Object} filters - { maxPrice, minPrice, minRating, category }
   * @param {number} limit - Max results
   * @returns {Array} Array of product objects
   */
  async search(query, filters = {}, limit = 10) {
    throw new Error(`search() not implemented for ${this.retailerName}`);
  }

  /**
   * Get product details by URL
   * @param {string} url - Product URL
   * @returns {Object} Product details
   */
  async getProductDetails(url) {
    throw new Error(`getProductDetails() not implemented for ${this.retailerName}`);
  }

  /**
   * Check if a product is still in stock
   * @param {string} url - Product URL
   * @returns {boolean}
   */
  async checkAvailability(url) {
    throw new Error(`checkAvailability() not implemented for ${this.retailerName}`);
  }

  /**
   * Normalize product data to common format
   */
  normalizeProduct(rawData) {
    return {
      externalId: rawData.id || '',
      retailer: this.retailerName,
      title: rawData.title || '',
      description: rawData.description || '',
      brand: rawData.brand || '',
      category: rawData.category || '',
      images: rawData.images || [],
      url: rawData.url || '',
      price: rawData.price || 0,
      currency: rawData.currency || 'USD',
      originalPrice: rawData.originalPrice || null,
      discount: rawData.discount || null,
      rating: rawData.rating || null,
      reviewCount: rawData.reviewCount || 0,
      inStock: rawData.inStock !== false,
      shippingInfo: {
        freeShipping: rawData.freeShipping || false,
        estimatedDays: rawData.estimatedDays || null,
        cost: rawData.shippingCost || 0,
      },
      scrapedAt: new Date(),
    };
  }
}

module.exports = BaseScraper;




