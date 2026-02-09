const { v4: uuidv4 } = require('uuid');

/**
 * Generate a unique ID with an optional prefix
 */
const generateId = (prefix = '') => {
  const id = uuidv4().replace(/-/g, '').substring(0, 16);
  return prefix ? `${prefix}_${id}` : id;
};

/**
 * Parse price string to number (e.g., "$129.99" -> 129.99)
 */
const parsePrice = (priceStr) => {
  if (typeof priceStr === 'number') return priceStr;
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
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


