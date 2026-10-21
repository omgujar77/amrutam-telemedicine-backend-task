import { describe, it, expect } from 'vitest';
import { validateEnv } from '../../src/config/env.js';

describe('Environment Variable Validation (src/config/env.js)', () => {
  const validBaseConfig = {
    NODE_ENV: 'development',
    PORT: '5000',
    LOG_LEVEL: 'info',
    DATABASE_URL: 'postgresql://postgres:password@localhost:5432/mydb?schema=public',
    REDIS_URL: 'redis://127.0.0.1:6379'
  };

  it('validates a complete, correct configuration', () => {
    const config = validateEnv(validBaseConfig);
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(5000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.DATABASE_URL).toBe(validBaseConfig.DATABASE_URL);
    expect(config.REDIS_URL).toBe(validBaseConfig.REDIS_URL);
  });

  it('applies default values for optional environment variables', () => {
    const minimalConfig = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379'
    };
    const config = validateEnv(minimalConfig);
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(5000);
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('throws a descriptive error when DATABASE_URL is missing', () => {
    const invalidConfig = {
      ...validBaseConfig,
      DATABASE_URL: ''
    };
    expect(() => validateEnv(invalidConfig)).toThrow(/DATABASE_URL is required/);
  });

  it('throws when DATABASE_URL has an invalid scheme', () => {
    const invalidConfig = {
      ...validBaseConfig,
      DATABASE_URL: 'mysql://user:pass@localhost:3306/db'
    };
    expect(() => validateEnv(invalidConfig)).toThrow(/DATABASE_URL must be a valid PostgreSQL connection URI/);
  });

  it('throws when REDIS_URL has an invalid scheme', () => {
    const invalidConfig = {
      ...validBaseConfig,
      REDIS_URL: 'http://localhost:6379'
    };
    expect(() => validateEnv(invalidConfig)).toThrow(/REDIS_URL must be a valid Redis connection URI/);
  });

  it('throws when PORT is out of range', () => {
    const invalidLowPort = {
      ...validBaseConfig,
      PORT: '80'
    };
    expect(() => validateEnv(invalidLowPort)).toThrow(/PORT must be >= 1024/);

    const invalidHighPort = {
      ...validBaseConfig,
      PORT: '70000'
    };
    expect(() => validateEnv(invalidHighPort)).toThrow(/PORT must be <= 65535/);
  });

  it('throws when LOG_LEVEL is invalid', () => {
    const invalidConfig = {
      ...validBaseConfig,
      LOG_LEVEL: 'verbose'
    };
    expect(() => validateEnv(invalidConfig)).toThrow(/LOG_LEVEL:/);
  });

  it('throws when MFA_ENCRYPTION_KEY is shorter than 32 characters', () => {
    const shortKeyConfig = {
      ...validBaseConfig,
      MFA_ENCRYPTION_KEY: 'too-short-key'
    };
    expect(() => validateEnv(shortKeyConfig)).toThrow(/MFA_ENCRYPTION_KEY must be at least 32 characters/);
  });

  it('throws when JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are identical', () => {
    const identicalKeysConfig = {
      ...validBaseConfig,
      JWT_ACCESS_SECRET: 'reused-secret-key-that-is-over-32-chars-long-1234',
      JWT_REFRESH_SECRET: 'reused-secret-key-that-is-over-32-chars-long-1234'
    };
    expect(() => validateEnv(identicalKeysConfig)).toThrow(/must be distinct keys/);
  });

  it('throws when MFA_ENCRYPTION_KEY is reused as JWT_ACCESS_SECRET', () => {
    const reusedKeyConfig = {
      ...validBaseConfig,
      JWT_ACCESS_SECRET: 'shared-secret-key-over-32-characters-long-12345',
      MFA_ENCRYPTION_KEY: 'shared-secret-key-over-32-characters-long-12345'
    };
    expect(() => validateEnv(reusedKeyConfig)).toThrow(/must not be reused/);
  });

  it('rejects development placeholder keys in production environment', () => {
    const prodWithDevSecrets = {
      ...validBaseConfig,
      NODE_ENV: 'production'
    };
    expect(() => validateEnv(prodWithDevSecrets)).toThrow(/must not use development default in production/);
  });
});

