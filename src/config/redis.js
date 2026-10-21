import Redis from 'ioredis';
import { logger } from '../common/logger/logger.js';
import { env } from './env.js';

let redisInstance = null;

/**
 * Returns the singleton Redis client instance.
 */
export function getRedisClient() {
  if (!redisInstance) {
    redisInstance = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy(times) {
        // Linear backoff capped at 2000ms
        return Math.min(times * 100, 2000);
      }
    });

    redisInstance.on('error', (err) => {
      logger.error({ err: err.message }, 'Redis connection error');
    });

    redisInstance.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisInstance.on('ready', () => {
      logger.info('Redis client ready to receive commands');
    });
  }

  return redisInstance;
}

export const redis = getRedisClient();

/**
 * Checks connectivity to the Redis instance with a strict timeout.
 * Returns { isReady: boolean, latencyMs?: number, error?: string }
 */
export async function checkRedisConnection(timeoutMs = 3000) {
  const client = getRedisClient();
  const startTime = Date.now();

  try {
    // If not connected, connect lazily
    if (client.status !== 'ready' && client.status !== 'connecting' && client.status !== 'connect') {
      await client.connect().catch(() => {});
    }

    const pingPromise = client.ping();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Redis check timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const result = await Promise.race([pingPromise, timeoutPromise]);
    if (result === 'PONG') {
      const latencyMs = Date.now() - startTime;
      return { isReady: true, latencyMs };
    }

    return { isReady: false, error: 'Unexpected Redis ping response' };
  } catch (error) {
    logger.error({ err: error.message }, 'Redis connectivity check failed');
    return { isReady: false, error: 'Redis unavailable' };
  }
}

/**
 * Cleanly disconnects the Redis client.
 */
export async function disconnectRedis() {
  if (redisInstance) {
    try {
      await redisInstance.quit();
      logger.info('Redis client disconnected cleanly');
    } catch (error) {
      logger.error({ err: error.message }, 'Error disconnecting Redis client');
      redisInstance.disconnect();
    }
  }
}
