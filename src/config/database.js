import { PrismaClient } from '@prisma/client';
import { logger } from '../common/logger/logger.js';
import { env } from './env.js';

let prismaInstance = null;

/**
 * Returns the singleton PrismaClient instance.
 */
export function getPrismaClient() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      datasources: {
        db: {
          url: env.DATABASE_URL
        }
      },
      log: env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' }
          ]
        : [
            { emit: 'stdout', level: 'error' }
          ]
    });

    if (env.NODE_ENV === 'development') {
      prismaInstance.$on('query', (e) => {
        logger.debug({ query: e.query, durationMs: e.duration }, 'Database query executed');
      });
    }
  }

  return prismaInstance;
}

export const prisma = getPrismaClient();

/**
 * Checks connectivity to the PostgreSQL database with a strict timeout.
 * Returns { isReady: boolean, latencyMs?: number, error?: string }
 */
export async function checkDatabaseConnection(timeoutMs = 3000) {
  const client = getPrismaClient();
  const startTime = Date.now();

  try {
    const queryPromise = client.$queryRaw`SELECT 1`;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Database check timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    await Promise.race([queryPromise, timeoutPromise]);
    const latencyMs = Date.now() - startTime;
    return { isReady: true, latencyMs };
  } catch (error) {
    logger.error({ err: error.message }, 'Database connectivity check failed');
    return { isReady: false, error: 'Database unavailable' };
  }
}

/**
 * Cleanly disconnects the Prisma client.
 */
export async function disconnectDatabase() {
  if (prismaInstance) {
    try {
      await prismaInstance.$disconnect();
      logger.info('Database client disconnected cleanly');
    } catch (error) {
      logger.error({ err: error.message }, 'Error disconnecting database client');
    }
  }
}
