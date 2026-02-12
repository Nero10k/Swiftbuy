const BaseScraper = require('./base.scraper');
const logger = require('../../utils/logger');
const config = require('../../config');
const { parsePrice, sleep } = require('../../utils/helpers');

/**
 * Amazon Product Scraper
 * Uses Playwright to search and scrape Amazon product listings
 */
class AmazonScraper extends BaseScraper {
  constructor() {
    super('amazon');
    this.baseUrl = 'https://www.amazon.com';
  }

  /**
   * Search Amazon for products
   */
  async search(query, filters = {}, limit = 10) {
    let browser = null;

    try {
      // Dynamic import for playwright (heavy dependency)
      const { chromium } = require('playwright');

      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
      });

      const page = await context.newPage();

      // Build search URL
      const searchUrl = this._buildSearchUrl(query, filters);
      logger.info(`Amazon scraper: searching "${query}"`, { url: searchUrl });

      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.scraping.timeoutMs,
      });

      // Wait for results to load
      await page.waitForSelector('[data-component-type="s-search-result"]', {
        timeout: 10000,
      }).catch(() => {
        logger.warn('Amazon: search results selector not found, trying fallback');
      });

      // Small delay to avoid detection
      await sleep(1000 + Math.random() * 2000);

      // Extract product data
      const rawProducts = await page.evaluate((maxResults) => {
        const results = [];
        const items = document.querySelectorAll('[data-component-type="s-search-result"]');

        for (let i = 0; i < Math.min(items.length, maxResults); i++) {
          const item = items[i];
          try {
            const asin = item.getAttribute('data-asin');
            if (!asin) continue;

            // Title
            const titleEl = item.querySelector('h2 a span, h2 span');
            const title = titleEl?.textContent?.trim() || '';

            // URL
            const linkEl = item.querySelector('h2 a');
            let url = '';
            if (linkEl) {
              const href = linkEl.getAttribute('href') || '';
              url = href.startsWith('http') ? href : `https://www.amazon.com${href}`;
              // Trim tracking params for cleaner URLs
              try { url = url.split('/ref=')[0]; } catch(e) {}
            }

            // Price
            const priceWhole = item.querySelector('.a-price-whole')?.textContent?.trim() || '';
            const priceFraction = item.querySelector('.a-price-fraction')?.textContent?.trim() || '00';
            const price = priceWhole ? `${priceWhole}${priceFraction}` : null;

            // Original price (strikethrough)
            const origPriceEl = item.querySelector('.a-price.a-text-price .a-offscreen');
            const originalPrice = origPriceEl?.textContent?.trim() || null;

            // Rating
            const ratingEl = item.querySelector('.a-icon-star-small .a-icon-alt, .a-icon-star .a-icon-alt');
            const ratingText = ratingEl?.textContent || '';
            const rating = parseFloat(ratingText) || null;

            // Review count
            const reviewEl = item.querySelector('[aria-label*="stars"] + span, .a-size-base.s-underline-text');
            const reviewText = reviewEl?.textContent?.replace(/[^0-9]/g, '') || '0';
            const reviewCount = parseInt(reviewText, 10) || 0;

            // Image
            const imageEl = item.querySelector('.s-image');
            const image = imageEl?.getAttribute('src') || '';

            // Free shipping / Prime
            const freeShipping = !!item.querySelector('.a-icon-prime, [aria-label*="FREE"]');

            // Brand — avoid catching "X+ bought in past month" text
            const brandEl = item.querySelector('.a-size-base-plus.a-color-base');
            let brand = brandEl?.textContent?.trim() || '';
            if (brand.match(/bought in past|sold in past|viewed in past/i)) brand = '';

            if (title && price) {
              results.push({
                id: asin,
                title,
                url,
                price,
                originalPrice,
                rating,
                reviewCount,
                images: image ? [image] : [],
                freeShipping,
                brand,
                inStock: true,
              });
            }
          } catch (e) {
            // Skip item on parse error
          }
        }
        return results;
      }, limit);

      logger.info(`Amazon scraper: found ${rawProducts.length} products for "${query}"`);

      // Normalize and apply filters
      let products = rawProducts.map((raw) => {
        raw.price = parsePrice(raw.price);
        raw.originalPrice = parsePrice(raw.originalPrice);
        if (raw.price && raw.originalPrice && raw.originalPrice > raw.price) {
          raw.discount = Math.round(((raw.originalPrice - raw.price) / raw.originalPrice) * 100);
        }
        return this.normalizeProduct(raw);
      });

      // Apply post-scrape filters
      products = this._applyFilters(products, filters);

      return products.slice(0, limit);
    } catch (error) {
      logger.error('Amazon scraper error:', {
        query,
        message: error.message,
      });
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Get detailed product info by URL
   */
  async getProductDetails(url) {
    let browser = null;

    try {
      const { chromium } = require('playwright');

      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      const page = await context.newPage();
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.scraping.timeoutMs,
      });

      await sleep(1000 + Math.random() * 1500);

      const details = await page.evaluate(() => {
        const title = document.querySelector('#productTitle')?.textContent?.trim() || '';
        const priceEl = document.querySelector('.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice');
        const price = priceEl?.textContent?.trim() || null;
        const brand = document.querySelector('#bylineInfo')?.textContent?.replace('Brand: ', '').replace('Visit the ', '').replace(' Store', '').trim() || '';
        const rating = document.querySelector('#acrPopover .a-icon-alt')?.textContent?.trim() || null;
        const reviewCount = document.querySelector('#acrCustomerReviewText')?.textContent?.replace(/[^0-9]/g, '') || '0';
        const description = document.querySelector('#productDescription p, #feature-bullets')?.textContent?.trim() || '';
        const inStock = !document.querySelector('#outOfStock');
        const asin = document.querySelector('[data-asin]')?.getAttribute('data-asin') || '';

        const images = [];
        document.querySelectorAll('#altImages img').forEach((img) => {
          const src = img.getAttribute('src');
          if (src && !src.includes('play-button')) {
            images.push(src.replace(/\._.*_\./, '.'));
          }
        });

        return { id: asin, title, price, brand, rating: parseFloat(rating) || null, reviewCount: parseInt(reviewCount, 10), description, inStock, images, url: window.location.href };
      });

      details.price = parsePrice(details.price);

      return this.normalizeProduct(details);
    } catch (error) {
      logger.error('Amazon detail scrape error:', { url, message: error.message });
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Build Amazon search URL with filters
   */
  _buildSearchUrl(query, filters) {
    const params = new URLSearchParams({
      k: query,
      ref: 'nb_sb_noss',
    });

    // Price range
    if (filters.minPrice || filters.maxPrice) {
      let priceFilter = '';
      if (filters.minPrice) priceFilter += `${Math.floor(filters.minPrice * 100)}`;
      priceFilter += '-';
      if (filters.maxPrice) priceFilter += `${Math.floor(filters.maxPrice * 100)}`;
      params.set('rh', `p_36:${priceFilter}`);
    }

    // Star rating filter
    if (filters.minRating && filters.minRating >= 4) {
      params.append('rh', 'p_72:1248879011');
    }

    return `${this.baseUrl}/s?${params.toString()}`;
  }

  /**
   * Apply filters after scraping
   */
  _applyFilters(products, filters) {
    return products.filter((p) => {
      if (filters.maxPrice && p.price > filters.maxPrice) return false;
      if (filters.minPrice && p.price < filters.minPrice) return false;
      if (filters.minRating && p.rating && p.rating < filters.minRating) return false;
      return true;
    });
  }
}

module.exports = new AmazonScraper();


