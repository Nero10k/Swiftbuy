const rateLimit = require('express-rate-limit');
const config = require('../../config');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for agent search (scraping is expensive)
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: {
    success: false,
    error: {
      code: 'SEARCH_RATE_LIMIT',
      message: 'Too many search requests, please wait before searching again',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth route limiter (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT',
      message: 'Too many authentication attempts',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { apiLimiter, searchLimiter, authLimiter };




