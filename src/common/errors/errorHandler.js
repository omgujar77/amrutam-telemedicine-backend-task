import { logger } from '../logger/logger.js';
import { env } from '../../config/env.js';
import { AppError } from './AppError.js';

export function errorHandler(err, req, res, _next) {
  const requestId = req.id || 'unknown';

  // Handle malformed JSON body from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      requestId,
      error: {
        code: 'MALFORMED_JSON',
        message: 'Invalid JSON payload in request body',
        statusCode: 400,
        requestId
      }
    });
  }

  // Handle known operational AppError
  if (err instanceof AppError) {
    logger.warn({
      requestId,
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      url: req.originalUrl,
      method: req.method
    }, 'Operational error encountered');

    return res.status(err.statusCode).json({
      success: false,
      requestId,
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        details: err.details || undefined,
        requestId
      }
    });
  }

  // Handle Prisma Database Known Request Errors safely without leaking SQL/schema details
  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      logger.warn({ requestId, target, code: err.code }, 'Database unique constraint violation');

      return res.status(409).json({
        success: false,
        requestId,
        error: {
          code: 'CONFLICT',
          message: `A record with this ${target} already exists.`,
          statusCode: 409,
          requestId
        }
      });
    }

    if (err.code === 'P2025') {
      logger.warn({ requestId, code: err.code }, 'Database record not found');

      return res.status(404).json({
        success: false,
        requestId,
        error: {
          code: 'NOT_FOUND',
          message: 'Requested record was not found.',
          statusCode: 404,
          requestId
        }
      });
    }
  }

  // Handle unexpected internal server errors
  logger.error({
    requestId,
    err: {
      message: err.message,
      stack: err.stack,
      name: err.name
    },
    url: req.originalUrl,
    method: req.method
  }, 'Unhandled internal server error');

  const isProduction = env.NODE_ENV === 'production';

  return res.status(500).json({
    success: false,
    requestId,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isProduction
        ? 'An unexpected error occurred. Please contact support.'
        : err.message || 'Internal server error',
      statusCode: 500,
      requestId
    }
  });
}
