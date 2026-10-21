import { metricsRegistry } from './metrics.js';

/**
 * Express middleware to collect HTTP metrics:
 * - Tracks in-flight requests
 * - Measures request duration via high-resolution timer (process.hrtime)
 * - Records method, normalized route template, and status code upon response completion
 */
export function httpMetricsMiddleware(req, res, next) {
  // Ignore /metrics itself from metric collection to avoid scrape skew
  if (req.path === '/metrics') {
    return next();
  }

  const startHrTime = process.hrtime();
  metricsRegistry.incRequestsInFlight(req.method);

  let finished = false;

  const onResponseComplete = () => {
    if (finished) return;
    finished = true;

    metricsRegistry.decRequestsInFlight(req.method);

    const diff = process.hrtime(startHrTime);
    const durationSeconds = diff[0] + diff[1] / 1e9;

    // Use route template if matched by Express router, or fallback to normalized path
    const routePattern = req.baseUrl
      ? `${req.baseUrl}${req.route?.path || req.path}`
      : req.route?.path || req.path;

    metricsRegistry.recordRequest(req.method, routePattern, res.statusCode, durationSeconds);
  };

  res.on('finish', onResponseComplete);
  res.on('close', onResponseComplete);

  next();
}

/**
 * Endpoint handler that serves Prometheus metrics at GET /metrics
 */
export function metricsEndpointHandler(_req, res) {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.status(200).send(metricsRegistry.render());
}
