import { randomUUID } from 'node:crypto';

// Validates request ID: alphanumeric, hyphen, underscore, 1 to 64 characters
const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Request ID middleware.
 * Attaches a secure request ID to req.id and response header 'X-Request-Id'.
 * Accepts valid incoming 'x-request-id' or generates a cryptographically secure UUID.
 */
export function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];

  let requestId;
  if (typeof incomingId === 'string' && VALID_REQUEST_ID_REGEX.test(incomingId.trim())) {
    requestId = incomingId.trim();
  } else {
    requestId = randomUUID();
  }

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
