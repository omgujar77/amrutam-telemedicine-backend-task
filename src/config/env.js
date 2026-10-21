import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z
    .coerce
    .number()
    .int()
    .min(1024, { message: 'PORT must be >= 1024' })
    .max(65535, { message: 'PORT must be <= 65535' })
    .default(5000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  DATABASE_URL: z
    .string()
    .min(1, { message: 'DATABASE_URL is required' })
    .refine(
      (val) => val.startsWith('postgresql://') || val.startsWith('postgres://'),
      { message: 'DATABASE_URL must be a valid PostgreSQL connection URI' }
    ),
  REDIS_URL: z
    .string()
    .min(1, { message: 'REDIS_URL is required' })
    .refine(
      (val) => val.startsWith('redis://') || val.startsWith('rediss://'),
      { message: 'REDIS_URL must be a valid Redis connection URI' }
    ),
  TEST_DATABASE_URL: z
    .string()
    .optional(),
  DIRECT_URL: z
    .string()
    .optional(),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters long' })
    .default('amrutam-dev-access-token-secret-minimum-32-chars-long'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters long' })
    .default('amrutam-dev-refresh-token-secret-minimum-32-chars-long'),
  MFA_ENCRYPTION_KEY: z
    .string()
    .min(32, { message: 'MFA_ENCRYPTION_KEY must be at least 32 characters long' })
    .default('amrutam-dev-mfa-encryption-key-minimum-32-chars!'),
  JWT_ACCESS_EXPIRATION: z
    .string()
    .default('15m'),
  JWT_REFRESH_EXPIRATION: z
    .string()
    .default('7d'),
  COOKIE_SECURE: z
    .coerce
    .boolean()
    .default(false),
  COOKIE_SAME_SITE: z
    .enum(['lax', 'strict', 'none'])
    .default('lax'),
}).superRefine((data, ctx) => {
  // Enforce cryptographic separation: different keys must be used for different purposes
  if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct keys',
      path: ['JWT_REFRESH_SECRET']
    });
  }

  if (data.MFA_ENCRYPTION_KEY === data.JWT_ACCESS_SECRET || data.MFA_ENCRYPTION_KEY === data.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'MFA_ENCRYPTION_KEY must not be reused as a JWT signing secret',
      path: ['MFA_ENCRYPTION_KEY']
    });
  }

  // In production, reject default development secrets
  if (data.NODE_ENV === 'production') {
    if (data.JWT_ACCESS_SECRET.includes('amrutam-dev')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_ACCESS_SECRET must not use development default in production',
        path: ['JWT_ACCESS_SECRET']
      });
    }
    if (data.JWT_REFRESH_SECRET.includes('amrutam-dev')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_REFRESH_SECRET must not use development default in production',
        path: ['JWT_REFRESH_SECRET']
      });
    }
    if (data.MFA_ENCRYPTION_KEY.includes('amrutam-dev')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MFA_ENCRYPTION_KEY must not use development default in production',
        path: ['MFA_ENCRYPTION_KEY']
      });
    }
  }
});

/**
 * Validates and sanitizes environment variables.
 * Fails fast with descriptive messages without leaking secret values.
 */
export function validateEnv(config = process.env) {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errorDetails = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return `  - ${path}: ${issue.message}`;
    });

    const errorMessage = [
      '❌ Environment configuration validation failed:',
      ...errorDetails,
      'Please check your .env file or environment variables.'
    ].join('\n');

    throw new Error(errorMessage);
  }

  return result.data;
}

export const env = validateEnv(process.env);
