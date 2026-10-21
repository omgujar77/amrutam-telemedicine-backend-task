/**
 * Prometheus-compatible HTTP Request Metrics Registry
 * Implements standard Prometheus exposition format (version 0.0.4)
 */

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

class MetricsRegistry {
  constructor() {
    this.reset();
  }

  reset() {
    // Map key: "method|route|status_code" -> count
    this.requestsTotal = new Map();
    // Map key: "method|route|status_code" -> { sum, count, buckets: [count_per_bucket] }
    this.requestDuration = new Map();
    // Map key: "method" -> in-flight count
    this.requestsInFlight = new Map();
    // Map key: "method|route|status_code" -> error count
    this.errorsTotal = new Map();
  }

  /**
   * Normalizes URL paths into safe route templates to bound Prometheus label cardinality.
   * e.g., /api/v1/doctors/cm123456789 -> /api/v1/doctors/:id
   * e.g., /api/v1/consultations/f47ac10b-58cc-4372-a567-0e02b2c3d479 -> /api/v1/consultations/:id
   */
  normalizeRoute(url) {
    if (!url || typeof url !== 'string') return 'unknown';

    // Strip query string
    const pathname = url.split('?')[0];

    // Standard static endpoints
    if (pathname === '/health' || pathname.startsWith('/health/')) return pathname;
    if (pathname === '/metrics') return '/metrics';
    if (pathname.startsWith('/api-docs')) return '/api-docs';

    const segments = pathname.split('/').map((seg) => {
      if (!seg) return seg;
      // UUID format
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
        return ':id';
      }
      // Pure integer ID
      if (/^\d+$/.test(seg)) {
        return ':id';
      }
      // Alphanumeric dynamic ID (contains both numbers and letters, length >= 12)
      if (seg.length >= 12 && /[0-9]/.test(seg) && /[a-zA-Z]/.test(seg)) {
        return ':id';
      }
      return seg;
    });

    return segments.join('/') || '/';
  }

  incRequestsInFlight(method) {
    const m = (method || 'GET').toUpperCase();
    this.requestsInFlight.set(m, (this.requestsInFlight.get(m) || 0) + 1);
  }

  decRequestsInFlight(method) {
    const m = (method || 'GET').toUpperCase();
    const current = this.requestsInFlight.get(m) || 0;
    this.requestsInFlight.set(m, Math.max(0, current - 1));
  }

  recordRequest(method, route, statusCode, durationSeconds) {
    const m = (method || 'GET').toUpperCase();
    const r = this.normalizeRoute(route);
    const s = String(statusCode || 200);
    const key = `${m}|${r}|${s}`;

    // 1. Increment total requests counter
    this.requestsTotal.set(key, (this.requestsTotal.get(key) || 0) + 1);

    // 2. Increment error counter if status >= 400
    if (statusCode >= 400) {
      this.errorsTotal.set(key, (this.errorsTotal.get(key) || 0) + 1);
    }

    // 3. Record duration in histogram
    let hist = this.requestDuration.get(key);
    if (!hist) {
      hist = {
        sum: 0,
        count: 0,
        buckets: new Array(BUCKETS.length).fill(0)
      };
      this.requestDuration.set(key, hist);
    }

    hist.sum += durationSeconds;
    hist.count += 1;

    for (let i = 0; i < BUCKETS.length; i++) {
      if (durationSeconds <= BUCKETS[i]) {
        hist.buckets[i] += 1;
      }
    }
  }

  /**
   * Generates standard Prometheus exposition formatted text.
   */
  render() {
    const lines = [];

    // --- 1. http_requests_in_flight (Gauge) ---
    lines.push('# HELP http_requests_in_flight Current number of HTTP requests being processed');
    lines.push('# TYPE http_requests_in_flight gauge');
    for (const [method, count] of this.requestsInFlight.entries()) {
      lines.push(`http_requests_in_flight{method="${method}"} ${count}`);
    }
    if (this.requestsInFlight.size === 0) {
      lines.push('http_requests_in_flight{method="ALL"} 0');
    }

    // --- 2. http_requests_total (Counter) ---
    lines.push('# HELP http_requests_total Total number of HTTP requests processed');
    lines.push('# TYPE http_requests_total counter');
    for (const [key, count] of this.requestsTotal.entries()) {
      const [method, route, statusCode] = key.split('|');
      lines.push(`http_requests_total{method="${method}",route="${route}",status_code="${statusCode}"} ${count}`);
    }

    // --- 3. http_errors_total (Counter) ---
    lines.push('# HELP http_errors_total Total number of HTTP requests resulting in 4xx or 5xx errors');
    lines.push('# TYPE http_errors_total counter');
    for (const [key, count] of this.errorsTotal.entries()) {
      const [method, route, statusCode] = key.split('|');
      lines.push(`http_errors_total{method="${method}",route="${route}",status_code="${statusCode}"} ${count}`);
    }

    // --- 4. http_request_duration_seconds (Histogram) ---
    lines.push('# HELP http_request_duration_seconds Histogram of HTTP request latencies in seconds');
    lines.push('# TYPE http_request_duration_seconds histogram');
    for (const [key, hist] of this.requestDuration.entries()) {
      const [method, route, statusCode] = key.split('|');
      let cumulative = 0;
      for (let i = 0; i < BUCKETS.length; i++) {
        cumulative += hist.buckets[i];
        lines.push(
          `http_request_duration_seconds_bucket{method="${method}",route="${route}",status_code="${statusCode}",le="${BUCKETS[i]}"} ${cumulative}`
        );
      }
      lines.push(
        `http_request_duration_seconds_bucket{method="${method}",route="${route}",status_code="${statusCode}",le="+Inf"} ${hist.count}`
      );
      lines.push(
        `http_request_duration_seconds_sum{method="${method}",route="${route}",status_code="${statusCode}"} ${hist.sum.toFixed(6)}`
      );
      lines.push(
        `http_request_duration_seconds_count{method="${method}",route="${route}",status_code="${statusCode}"} ${hist.count}`
      );
    }

    // --- 5. Application Process & Runtime Metrics ---
    lines.push('# HELP app_uptime_seconds Application process uptime in seconds');
    lines.push('# TYPE app_uptime_seconds gauge');
    lines.push(`app_uptime_seconds ${process.uptime().toFixed(2)}`);

    const memory = process.memoryUsage();
    lines.push('# HELP nodejs_memory_heap_used_bytes Process heap memory used in bytes');
    lines.push('# TYPE nodejs_memory_heap_used_bytes gauge');
    lines.push(`nodejs_memory_heap_used_bytes ${memory.heapUsed}`);

    lines.push('# HELP nodejs_memory_heap_total_bytes Process heap memory allocated in bytes');
    lines.push('# TYPE nodejs_memory_heap_total_bytes gauge');
    lines.push(`nodejs_memory_heap_total_bytes ${memory.heapTotal}`);

    return lines.join('\n') + '\n';
  }
}

export const metricsRegistry = new MetricsRegistry();
