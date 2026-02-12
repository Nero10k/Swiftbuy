const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

let redisClient = null;
let redisAvailable = false;

const connectRedis = () => {
  return new Promise((resolve, reject) => {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: 3, // Fail fast — don't hang forever
      connectTimeout: 5000, // 5s connection timeout
      commandTimeout: 3000, // 3s command timeout
      enableOfflineQueue: false, // Don't queue commands when disconnected
      retryStrategy(times) {
        if (times > 5) {
          logger.warn('Redis: max retries reached, giving up');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 200, 2000);
        return delay;
      },
    });

    redisClient.on('connect', () => {
      redisAvailable = true;
      logger.info('Redis connected successfully');
      resolve(redisClient);
    });

    redisClient.on('error', (err) => {
      redisAvailable = false;
      logger.error('Redis error:', err.message);
    });

    redisClient.on('close', () => {
      redisAvailable = false;
    });

    // If Redis doesn't connect in 5 seconds, resolve anyway (non-blocking)
    setTimeout(() => {
      if (!redisAvailable) {
        logger.warn('Redis connection timed out — running without cache');
        resolve(null);
      }
    }, 5000);
  });
};

const getRedisClient = () => {
  if (!redisAvailable || !redisClient) {
    return null; // Return null instead of creating a broken connection
  }
  return redisClient;
};

const isRedisAvailable = () => redisAvailable;

module.exports = { connectRedis, getRedisClient, isRedisAvailable };


