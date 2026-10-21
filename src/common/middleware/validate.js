import { AppError } from '../errors/AppError.js';

/**
 * Higher-order middleware to validate request body using a Zod schema.
 */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }));

      const primaryMessage = result.error.issues[0]?.message || 'Request validation failed';

      return next(
        new AppError(
          primaryMessage,
          400,
          'VALIDATION_ERROR',
          fieldErrors
        )
      );
    }

    req.body = result.data;
    next();
  };
}

/**
 * Higher-order middleware to validate request query parameters using a Zod schema.
 */
export function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query || {});
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }));

      const primaryMessage = result.error.issues[0]?.message || 'Query parameter validation failed';

      return next(
        new AppError(
          primaryMessage,
          400,
          'VALIDATION_ERROR',
          fieldErrors
        )
      );
    }

    // In Express, req.query is often defined with a getter. Mutate its keys in-place and attach req.validatedQuery.
    for (const key of Object.keys(req.query)) {
      delete req.query[key];
    }
    Object.assign(req.query, result.data);
    req.validatedQuery = result.data;
    next();
  };
}
