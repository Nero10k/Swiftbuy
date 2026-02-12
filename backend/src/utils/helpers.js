const { v4: uuidv4 } = require('uuid');

/**
 * Generate a unique ID with an optional prefix
 */
const generateId = (prefix = '') => {
  const id = uuidv4().replace(/-/g, '').substring(0, 16);
  return prefix ? `${prefix}_${id}` : id;
};

/**
 * Parse price string to number, handling multiple currencies
 * Examples:
 *   "$129.99"    → 129.99
 *   "€49,99"     → 49.99  (European comma decimal)
 *   "£25.00"     → 25.00
 *   "1.299,00"   → 1299.00 (European thousands separator)
 *   "299 lei"    → 299
 *   "1 499 kr"   → 1499
 *   "₹2,499"     → 2499
 */
const parsePrice = (priceStr) => {
  if (typeof priceStr === 'number') return priceStr;
  if (!priceStr) return null;

  // Strip currency symbols, letters, and whitespace
  let cleaned = priceStr
    .replace(/[$$€£¥₹₩₺₦₪]/g, '')   // Currency symbols
    .replace(/[A-Za-z]/g, '')          // Currency codes (RON, lei, kr, CHF, etc.)
    .trim();

  // Detect European format: "1.299,99" or "49,99" (comma = decimal)
  // European: comma is LAST separator, dots are thousands
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    // European format: commas are decimal, dots are thousands
    // "1.299,99" → "1299.99"
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // US/UK format: dots are decimal, commas are thousands
    // "1,299.99" → "1299.99"
    cleaned = cleaned.replace(/,/g, '');
  }

  // Remove remaining spaces (e.g., "1 499" → "1499")
  cleaned = cleaned.replace(/\s/g, '');

  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
};

/**
 * Format USD amount
 */
const formatUSD = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

/**
 * Sanitize search query
 */
const sanitizeQuery = (query) => {
  if (!query || typeof query !== 'string') return '';
  return query
    .trim()
    .replace(/[<>{}]/g, '')
    .substring(0, 200);
};

/**
 * Sleep utility for rate limiting
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry a function with exponential backoff
 */
const retry = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
};

module.exports = {
  generateId,
  parsePrice,
  formatUSD,
  sanitizeQuery,
  sleep,
  retry,
};


