import { describe, it, expect, afterAll } from 'vitest';
import { redis, checkRedisConnection, disconnectRedis } from '../../src/config/redis.js';

describe('Redis Connectivity Integration Tests', () => {
  afterAll(async () => {
    await disconnectRedis();
  });

  it('verifies that Redis is reachable on local port 6379', async () => {
    const result = await checkRedisConnection(3000);
    expect(result.isReady).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
  });

  it('can perform basic SET and GET operations on Redis', async () => {
    const testKey = `test:key:${Date.now()}`;
    const testValue = 'amrutam-live-redis-test';

    await redis.set(testKey, testValue, 'EX', 10);
    const retrievedValue = await redis.get(testKey);

    expect(retrievedValue).toBe(testValue);

    // Clean up
    await redis.del(testKey);
  });
});
