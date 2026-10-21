import pino from 'pino';
import { env } from '../../config/env.js';

const isDevelopment = env.NODE_ENV === 'development';

export const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-access-token"]',
  'req.headers["x-refresh-token"]',
  'req.headers["mfa-token"]',
  'req.headers["x-mfa-token"]',
  'req.headers["idempotency-key"]',
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'tempToken',
  '*.tempToken',
  'secret',
  '*.secret',
  'mfaSecret',
  '*.mfaSecret',
  'totpSecret',
  '*.totpSecret',
  'code',
  'mfaCode',
  '*.mfaCode',
  'totpCode',
  '*.totpCode',
  'otp',
  '*.otp',
  'encryptionKey',
  'cvv',
  'cardNumber',
  'creditCard'
];

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    : undefined
});
