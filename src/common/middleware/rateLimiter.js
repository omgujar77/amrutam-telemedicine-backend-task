import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../logger/logger.js';

function createRedisStore(prefix) {
  try {
    return new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix
    });
  } catch (err) {
    logger.warn({ err: err.message, prefix }, 'Failed to initialize Redis rate limit store; falling back to memory');
    return undefined;
  }
}

/**
 * Creates a rate limiter for sensitive authentication endpoints (login, register, refresh)
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 1000 : 20, // 20 requests per windowMs (relaxed in test)
  standardHeaders: true, // Return standard rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  store: createRedisStore('rl:auth:'),
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts. Please try again after 15 minutes.'
    }
  },
  handler: (req, res, _next, options) => {
    logger.warn({
      ip: req.ip,
      path: req.originalUrl,
      requestId: req.id
    }, 'Rate limit exceeded on authentication endpoint');

    res.status(options.statusCode).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many authentication attempts. Please try again after 15 minutes.',
        requestId: req.id || 'unknown'
      }
    });
  }
});

/**
 * Creates a dedicated strict rate limiter for MFA verification attempts
 */
export const mfaRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 1000 : 5, // 5 failed attempts per window (relaxed in test)
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('rl:mfa:'),
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many MFA attempts. Please try again after 15 minutes.'
    }
  },
  handler: (req, res, _next, options) => {
    logger.warn({
      ip: req.ip,
      path: req.originalUrl,
      requestId: req.id
    }, 'MFA verification rate limit exceeded');

    res.status(options.statusCode).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many MFA attempts. Please try again after 15 minutes.',
        requestId: req.id || 'unknown'
      }
    });
  }
});
