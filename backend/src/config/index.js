require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  // MongoDB
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/swiftbuy',
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    agentSecret: process.env.JWT_AGENT_SECRET || 'dev-agent-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Wallet API (USDC + off-ramp)
  wallet: {
    apiUrl: process.env.WALLET_API_URL || 'http://localhost:4000',
    apiKey: process.env.WALLET_API_KEY || '',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  // Scraping
  scraping: {
    timeoutMs: parseInt(process.env.SCRAPE_TIMEOUT_MS, 10) || 30000,
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_SCRAPES, 10) || 3,
    serperApiKey: process.env.SERPER_API_KEY || '',
  },

  // Purchase
  purchase: {
    approvalThreshold: parseFloat(process.env.DEFAULT_APPROVAL_THRESHOLD) || 50,
    autoApproveBelow: parseFloat(process.env.AUTO_APPROVE_BELOW) || 25,
  },
};

module.exports = config;


