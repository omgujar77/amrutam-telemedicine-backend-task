import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock database and redis connectivity checks before importing app
vi.mock('../../src/config/database.js', async () => {
  return {
    prisma: {},
    getPrismaClient: vi.fn(),
    checkDatabaseConnection: vi.fn(),
    disconnectDatabase: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock('../../src/config/redis.js', async () => {
  return {
    redis: {},
    getRedisClient: vi.fn(),
    checkRedisConnection: vi.fn(),
    disconnectRedis: vi.fn().mockResolvedValue(undefined)
  };
});

// Import app after mocks are configured
const { app } = await import('../../src/app.js');
const { checkDatabaseConnection } = await import('../../src/config/database.js');
const { checkRedisConnection } = await import('../../src/config/redis.js');

describe('Express Application & Foundation (Phase 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /health/live (Liveness Probe)', () => {
    it('returns 200 OK with healthy status without checking DB or Redis', async () => {
      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.headers).toHaveProperty('x-request-id');

      // Ensure liveness probe did not invoke external dependencies
      expect(checkDatabaseConnection).not.toHaveBeenCalled();
      expect(checkRedisConnection).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/ready (Readiness Probe)', () => {
    it('returns 200 OK when both PostgreSQL and Redis are healthy', async () => {
      checkDatabaseConnection.mockResolvedValueOnce({ isReady: true, latencyMs: 5 });
      checkRedisConnection.mockResolvedValueOnce({ isReady: true, latencyMs: 2 });

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
      expect(response.body.services.database.status).toBe('up');
      expect(response.body.services.database.latencyMs).toBe(5);
      expect(response.body.services.redis.status).toBe('up');
      expect(response.body.services.redis.latencyMs).toBe(2);
    });

    it('returns 503 Service Unavailable when PostgreSQL is down', async () => {
      checkDatabaseConnection.mockResolvedValueOnce({ isReady: false, error: 'Database unavailable' });
      checkRedisConnection.mockResolvedValueOnce({ isReady: true, latencyMs: 2 });

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.database.status).toBe('down');
      expect(response.body.services.redis.status).toBe('up');
      // Must not leak connection strings or raw errors
      expect(JSON.stringify(response.body)).not.toContain('postgresql://');
    });

    it('returns 503 Service Unavailable when Redis is down', async () => {
      checkDatabaseConnection.mockResolvedValueOnce({ isReady: true, latencyMs: 5 });
      checkRedisConnection.mockResolvedValueOnce({ isReady: false, error: 'Redis unavailable' });

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.database.status).toBe('up');
      expect(response.body.services.redis.status).toBe('down');
    });

    it('returns 503 when both PostgreSQL and Redis are down', async () => {
      checkDatabaseConnection.mockResolvedValueOnce({ isReady: false });
      checkRedisConnection.mockResolvedValueOnce({ isReady: false });

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.database.status).toBe('down');
      expect(response.body.services.redis.status).toBe('down');
    });
  });

  describe('Request ID Middleware', () => {
    it('generates a new UUID if no X-Request-Id header is passed', async () => {
      const response = await request(app).get('/health/live');

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('preserves a valid client-provided X-Request-Id header', async () => {
      const customId = 'client-custom-req-id-12345';
      const response = await request(app)
        .get('/health/live')
        .set('X-Request-Id', customId);

      expect(response.headers['x-request-id']).toBe(customId);
    });

    it('replaces an invalid or excessively long X-Request-Id with a generated UUID', async () => {
      const malformedId = 'untrusted<script>alert(1)</script>'.repeat(5); // invalid chars & long
      const response = await request(app)
        .get('/health/live')
        .set('X-Request-Id', malformedId);

      expect(response.headers['x-request-id']).not.toBe(malformedId);
      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('404 Not Found Middleware', () => {
    it('returns consistent JSON 404 for unknown endpoints', async () => {
      const response = await request(app).get('/unknown-api/v1/resource');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route GET /unknown-api/v1/resource not found',
          requestId: expect.any(String)
        }
      });
      expect(response.headers['x-request-id']).toBe(response.body.error.requestId);
    });
  });

  describe('Error Handling Middleware', () => {
    it('handles malformed JSON body with HTTP 400 and structured response', async () => {
      const response = await request(app)
        .post('/health/live') // Any endpoint that accepts a request
        .set('Content-Type', 'application/json')
        .send('{"invalidJson": unquotedValue}');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MALFORMED_JSON');
      expect(response.body.error.message).toBe('Invalid JSON payload in request body');
      expect(response.body.error.requestId).toBeDefined();
    });

    it('does not automatically open a network listening port upon importing app', () => {
      // Supertest wraps `app` dynamically; `app.listening` is false or undefined
      expect(app.listening).toBeFalsy();
    });
  });

  describe('Swagger UI / OpenAPI Documentation (Phase 8)', () => {
    it('serves OpenAPI specification JSON at /api-docs/json', async () => {
      const response = await request(app).get('/api-docs/json');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('openapi');
      expect(response.body.info.title).toContain('Amrutam Telemedicine');
    });

    it('serves Swagger UI HTML documentation at /api-docs/', async () => {
      const response = await request(app).get('/api-docs/');
      expect(response.status).toBe(200);
      expect(response.text).toContain('swagger');
    });
  });
});
