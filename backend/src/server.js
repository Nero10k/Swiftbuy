const app = require('./app');
const config = require('./config');
const connectDatabase = require('./config/database');
const { connectRedis } = require('./config/redis');
const logger = require('./utils/logger');

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Connect to Redis (optional — don't crash if unavailable)
    try {
      connectRedis();
    } catch (redisError) {
      logger.warn(`Redis not available, running without cache: ${redisError.message}`);
    }

    // Start Express server
    const port = process.env.PORT || config.port;
    app.listen(port, '0.0.0.0', () => {
      logger.info(`Swiftbuy API server running on port ${port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`Health check: http://localhost:${port}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

startServer();


