import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { metricsRegistry } from '../../src/common/metrics/metrics.js';
import { tracing } from '../../src/common/tracing/tracing.js';

describe('Observability: Metrics, Tracing & Health Probes (Phase 10)', () => {
  describe('Prometheus Metrics Endpoint (GET /metrics)', () => {
    it('serves metrics with Prometheus standard content-type header', async () => {
      const res = await request(app).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.headers['content-type']).toContain('version=0.0.4');
    });

    it('exposes http_requests_total, latency histogram, and in-flight gauges', async () => {
      // Trigger a request to populate metrics
      await request(app).get('/health/live');

      const res = await request(app).get('/metrics');

      expect(res.text).toContain('# TYPE http_requests_total counter');
      expect(res.text).toContain('# TYPE http_request_duration_seconds histogram');
      expect(res.text).toContain('# TYPE http_requests_in_flight gauge');
      expect(res.text).toContain('# TYPE app_uptime_seconds gauge');
      expect(res.text).toContain('# TYPE nodejs_memory_heap_used_bytes gauge');
    });

    it('normalizes dynamic route IDs to bound label cardinality', () => {
      const uuidRoute = '/api/v1/doctors/f47ac10b-58cc-4372-a567-0e02b2c3d479';
      expect(metricsRegistry.normalizeRoute(uuidRoute)).toBe('/api/v1/doctors/:id');

      const nestedUuidRoute = '/api/v1/consultations/f47ac10b-58cc-4372-a567-0e02b2c3d479/prescriptions';
      expect(metricsRegistry.normalizeRoute(nestedUuidRoute)).toBe('/api/v1/consultations/:id/prescriptions');

      const queryRoute = '/api/v1/doctors?specialization=Ayurveda&page=2';
      expect(metricsRegistry.normalizeRoute(queryRoute)).toBe('/api/v1/doctors');
    });
  });

  describe('Distributed Tracing & W3C TraceContext Propagation', () => {
    it('generates a valid W3C traceparent and X-Trace-Id when no header is supplied', async () => {
      const res = await request(app).get('/health/live');

      const traceparent = res.headers['traceparent'];
      const xTraceId = res.headers['x-trace-id'];

      expect(traceparent).toBeDefined();
      expect(xTraceId).toBeDefined();

      // Format: 00-<32 hex traceId>-<16 hex spanId>-01
      const parts = traceparent.split('-');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe('00');
      expect(parts[1]).toBe(xTraceId);
      expect(parts[1]).toHaveLength(32);
      expect(parts[2]).toHaveLength(16);
      expect(parts[3]).toBe('01');
    });

    it('preserves and propagates existing incoming W3C traceparent trace ID', async () => {
      const clientTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const clientSpanId = '00f067aa0ba902b7';
      const incomingTraceparent = `00-${clientTraceId}-${clientSpanId}-01`;

      const res = await request(app)
        .get('/health/live')
        .set('traceparent', incomingTraceparent);

      const returnedTraceparent = res.headers['traceparent'];
      const returnedTraceId = res.headers['x-trace-id'];

      expect(returnedTraceId).toBe(clientTraceId);
      expect(returnedTraceparent).toContain(clientTraceId);
      // New child span ID must be generated
      const returnedSpanId = returnedTraceparent.split('-')[2];
      expect(returnedSpanId).not.toBe(clientSpanId);
    });

    it('safely handles malformed incoming traceparent headers by generating fresh valid trace ID', async () => {
      const res = await request(app)
        .get('/health/live')
        .set('traceparent', 'invalid-malformed-header-data');

      const returnedTraceId = res.headers['x-trace-id'];
      expect(returnedTraceId).toBeDefined();
      expect(returnedTraceId).toHaveLength(32);
      expect(/^[0-9a-f]{32}$/.test(returnedTraceId)).toBe(true);
    });
  });

  describe('Health Check Probes (Liveness & Root)', () => {
    it('GET /health returns 200 with service status and uptime', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.timestamp).toBeDefined();
    });

    it('GET /health/live returns 200 with process liveness state', async () => {
      const res = await request(app).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });
});
