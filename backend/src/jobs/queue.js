const { Queue, Worker } = require('bullmq');
const config = require('../config');
const logger = require('../utils/logger');

const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};

// Queues
const searchQueue = new Queue('product-search', { connection: redisConnection });
const purchaseQueue = new Queue('purchase-execution', { connection: redisConnection });

/**
 * Initialize queue workers
 */
const initializeWorkers = () => {
  // Search worker — processes background scraping jobs
  const searchWorker = new Worker(
    'product-search',
    async (job) => {
      const { query, filters, userId, limit } = job.data;
      logger.info(`Processing search job: "${query}"`, { jobId: job.id });

      const searchService = require('../services/search/search.service');
      const results = await searchService.search(query, filters, limit);

      return results;
    },
    {
      connection: redisConnection,
      concurrency: config.scraping.maxConcurrent,
    }
  );

  searchWorker.on('completed', (job) => {
    logger.info(`Search job completed: ${job.id}`);
  });

  searchWorker.on('failed', (job, err) => {
    logger.error(`Search job failed: ${job.id}`, { error: err.message });
  });

  // Purchase worker — processes background purchase execution
  const purchaseWorker = new Worker(
    'purchase-execution',
    async (job) => {
      const { orderMongoId } = job.data;
      logger.info(`Processing purchase job for order: ${orderMongoId}`, { jobId: job.id });

      const purchaseService = require('../services/purchase/purchase.service');
      const result = await purchaseService.executePurchase(orderMongoId);

      return { orderId: result.orderId, status: result.status };
    },
    {
      connection: redisConnection,
      concurrency: 2, // Max 2 concurrent purchases
    }
  );

  purchaseWorker.on('completed', (job) => {
    logger.info(`Purchase job completed: ${job.id}`);
  });

  purchaseWorker.on('failed', (job, err) => {
    logger.error(`Purchase job failed: ${job.id}`, { error: err.message });
  });

  logger.info('Queue workers initialized');

  return { searchWorker, purchaseWorker };
};

/**
 * Add a search job to the queue
 */
const addSearchJob = async (data) => {
  return searchQueue.add('search', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
};

/**
 * Add a purchase job to the queue
 */
const addPurchaseJob = async (data) => {
  return purchaseQueue.add('purchase', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: 200,
    removeOnFail: 100,
  });
};

module.exports = {
  searchQueue,
  purchaseQueue,
  initializeWorkers,
  addSearchJob,
  addPurchaseJob,
};



