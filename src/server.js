import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './common/logger/logger.js';
import { checkDatabaseConnection, disconnectDatabase } from './config/database.js';
import { checkRedisConnection, disconnectRedis } from './config/redis.js';

let server;

async function startServer() {
  try {
    logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, 'Starting Amrutam Telemedicine Backend server...');

    // Attempt connectivity verification on startup (warn if services unavailable during cold boot)
    const [dbStatus, redisStatus] = await Promise.all([
      checkDatabaseConnection(2000),
      checkRedisConnection(2000)
    ]);

    if (dbStatus.isReady) {
      logger.info({ latencyMs: dbStatus.latencyMs }, 'PostgreSQL connection verified');
    } else {
      logger.warn('PostgreSQL is not immediately reachable; server will still start, but /health/ready will report degraded state');
    }

    if (redisStatus.isReady) {
      logger.info({ latencyMs: redisStatus.latencyMs }, 'Redis connection verified');
    } else {
      logger.warn('Redis is not immediately reachable; server will still start, but /health/ready will report degraded state');
    }

    server = app.listen(env.PORT, () => {
      logger.info({ port: env.PORT, env: env.NODE_ENV }, `🚀 Server listening on http://localhost:${env.PORT}`);
    });

    server.on('error', (err) => {
      logger.error({ err: err.message }, 'Server failed to start');
      process.exit(1);
    });
  } catch (error) {
    logger.fatal({ err: error.message, stack: error.stack }, 'Fatal error during startup');
    process.exit(1);
  }
}

async function gracefulShutdown(signal) {
  logger.info({ signal }, `Received ${signal}. Initiating graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed. Cleaning up service connections...');
      try {
        await Promise.allSettled([
          disconnectDatabase(),
          disconnectRedis()
        ]);
        logger.info('Graceful shutdown completed successfully. Exiting process.');
        process.exit(0);
      } catch (err) {
        logger.error({ err: err.message }, 'Error encountered during connection cleanup');
        process.exit(1);
      }
    });

    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Shutdown timed out after 10s. Forcing exit.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason: reason instanceof Error ? reason.message : reason }, 'Unhandled Rejection detected');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error.message, stack: error.stack }, 'Uncaught Exception detected. Exiting.');
  process.exit(1);
});

startServer();
