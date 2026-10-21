import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { env } from '../../config/env.js';
import { logger } from '../logger/logger.js';

/**
 * W3C TraceContext Specification Compliant Tracing Engine
 * Format: traceparent: 00-${traceId}-${spanId}-${traceFlags}
 * - traceId: 16 bytes (32 hex characters)
 * - spanId: 8 bytes (16 hex characters)
 * - traceFlags: 1 byte (01 = sampled)
 */

const TRACE_VERSION = '00';
const DEFAULT_FLAGS = '01'; // Sampled

export const tracing = {
  serviceName: 'amrutam-telemedicine-backend',
  environment: env.NODE_ENV || 'development',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || null,
  enabled: process.env.TRACING_ENABLED !== 'false',

  /**
   * Generates a standard 16-byte random trace ID.
   */
  generateTraceId() {
    return crypto.randomBytes(16).toString('hex');
  },

  /**
   * Generates a standard 8-byte random span ID.
   */
  generateSpanId() {
    return crypto.randomBytes(8).toString('hex');
  },

  /**
   * Parses an incoming W3C traceparent header.
   * e.g., "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
   */
  parseTraceparent(header) {
    if (!header || typeof header !== 'string') return null;

    const parts = header.trim().split('-');
    if (parts.length !== 4) return null;

    const [version, traceId, parentSpanId, flags] = parts;

    // Validate version and character lengths
    if (version !== '00') return null;
    if (!/^[0-9a-f]{32}$/i.test(traceId) || traceId === '00000000000000000000000000000000') return null;
    if (!/^[0-9a-f]{16}$/i.test(parentSpanId) || parentSpanId === '0000000000000000') return null;
    if (!/^[0-9a-f]{2}$/i.test(flags)) return null;

    return {
      traceId: traceId.toLowerCase(),
      parentSpanId: parentSpanId.toLowerCase(),
      traceFlags: flags.toLowerCase()
    };
  },

  /**
   * Builds a valid W3C traceparent header string.
   */
  formatTraceparent(traceId, spanId, flags = DEFAULT_FLAGS) {
    return `${TRACE_VERSION}-${traceId}-${spanId}-${flags}`;
  },

  /**
   * Dispatches span data to an external OTLP HTTP collector if configured.
   * Runs asynchronously and non-blockingly; never fails or throws.
   */
  async exportSpanToOtlp(spanData) {
    if (!this.otlpEndpoint) return;

    try {
      const payload = JSON.stringify({
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: this.serviceName } },
                { key: 'deployment.environment', value: { stringValue: this.environment } }
              ]
            },
            scopeSpans: [
              {
                scope: { name: 'amrutam.tracer' },
                spans: [spanData]
              }
            ]
          }
        ]
      });

      const url = new URL(this.otlpEndpoint);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 2000
        },
        () => {}
      );

      req.on('error', (err) => {
        logger.debug({ err: err.message }, 'OTLP trace exporter network error (suppressed)');
      });

      req.write(payload);
      req.end();
    } catch (err) {
      // Trace exporter failures must never crash ordinary requests
      logger.debug({ err: err.message }, 'Failed to serialize or export OTLP span');
    }
  }
};

/**
 * Express middleware that initializes W3C Trace Context on incoming requests.
 * Injects req.traceId, req.spanId, and attaches traceparent & X-Trace-Id headers.
 */
export function traceMiddleware(req, res, next) {
  const incomingHeader = req.headers['traceparent'] || req.headers['x-traceparent'];
  const parsed = incomingHeader ? tracing.parseTraceparent(incomingHeader) : null;

  const traceId = parsed?.traceId || tracing.generateTraceId();
  const parentSpanId = parsed?.parentSpanId || null;
  const spanId = tracing.generateSpanId();
  const traceFlags = parsed?.traceFlags || DEFAULT_FLAGS;

  req.traceId = traceId;
  req.spanId = spanId;
  req.parentSpanId = parentSpanId;
  req.traceFlags = traceFlags;

  const traceparent = tracing.formatTraceparent(traceId, spanId, traceFlags);

  // Set outgoing response headers
  res.setHeader('traceparent', traceparent);
  res.setHeader('X-Trace-Id', traceId);

  const startTime = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;

    // Build safe sanitized span object without PII or sensitive data
    const spanData = {
      traceId,
      spanId,
      ...(parentSpanId && { parentSpanId }),
      name: `${req.method} ${req.baseUrl || ''}${req.route?.path || req.path}`,
      kind: 1, // SPAN_KIND_SERVER
      startTimeUnixNano: String(startTime * 1000000),
      endTimeUnixNano: String(Date.now() * 1000000),
      attributes: [
        { key: 'http.method', value: { stringValue: req.method } },
        { key: 'http.target', value: { stringValue: req.originalUrl?.split('?')[0] || req.path } },
        { key: 'http.status_code', value: { intValue: res.statusCode } },
        { key: 'http.duration_ms', value: { intValue: durationMs } }
      ],
      status: {
        code: res.statusCode >= 500 ? 2 : 1 // 2 = ERROR, 1 = OK
      }
    };

    tracing.exportSpanToOtlp(spanData);
  });

  next();
}
