import { Router } from 'express';
import { checkDatabaseConnection } from '../../config/database.js';
import { checkRedisConnection } from '../../config/redis.js';

export const healthRouter = Router();

/**
 * Base health endpoint: returns overall service status and uptime.
 */
healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * Liveness probe: verifies that the Node.js process is responsive.
 * Does not check external dependencies.
 */
healthRouter.get('/live', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * Readiness probe: checks PostgreSQL and Redis connectivity.
 * Returns 200 if all dependencies are ready, 503 if any dependency fails.
 * Never leaks credentials or raw connection errors.
 */
healthRouter.get('/ready', async (_req, res) => {
  const [dbResult, redisResult] = await Promise.all([
    checkDatabaseConnection(3000),
    checkRedisConnection(3000)
  ]);

  const isReady = dbResult.isReady && redisResult.isReady;

  const responseBody = {
    status: isReady ? 'ready' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: dbResult.isReady ? 'up' : 'down',
        ...(dbResult.latencyMs !== undefined && { latencyMs: dbResult.latencyMs })
      },
      redis: {
        status: redisResult.isReady ? 'up' : 'down',
        ...(redisResult.latencyMs !== undefined && { latencyMs: redisResult.latencyMs })
      }
    }
  };

  const statusCode = isReady ? 200 : 503;
  return res.status(statusCode).json(responseBody);
});
