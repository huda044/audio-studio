import { logger } from '../lib/logger.js';

// Lightweight request logging middleware.
// Logs method, path, status, duration — skip /health dan static assets.
const SKIP_PATHS = ['/health', '/api/files/', '.js', '.css', '.woff', '.png', '.svg', '.ico', '.webp'];

export function requestLogger(req, res, next) {
  if (SKIP_PATHS.some((p) => req.path?.includes(p) || req.path === '/health')) {
    return next();
  }

  const start = Date.now();
  const log = logger.child({ requestId: req.requestId, method: req.method, path: req.path });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log[level]('request', { status: res.statusCode, durationMs: duration });
  });

  next();
}

// Prometheus-style metrics endpoint (text format, no external dependency).
const metrics = {
  requestsTotal: 0,
  requestsByStatus: {},
  requestsByPath: {},
  conversionTotal: 0,
  conversionDurationMs: 0,
  uploadTotal: 0,
  uploadAccepted: 0,
  uploadFailed: 0,
  startTime: Date.now()
};

export function trackRequest(req, res, next) {
  metrics.requestsTotal += 1;
  const statusKey = String(Math.floor(res.statusCode / 100) + 'xx');
  metrics.requestsByStatus[statusKey] = (metrics.requestsByStatus[statusKey] || 0) + 1;
  metrics.requestsByPath[req.path] = (metrics.requestsByPath[req.path] || 0) + 1;
  next();
}

export function trackConversion(durationMs) {
  metrics.conversionTotal += 1;
  metrics.conversionDurationMs += durationMs;
}

export function trackUpload(status) {
  metrics.uploadTotal += 1;
  if (status === 'Accepted') metrics.uploadAccepted += 1;
  else if (status === 'Failed') metrics.uploadFailed += 1;
}

export function metricsEndpoint(_req, res) {
  const uptime = Date.now() - metrics.startTime;
  const mem = process.memoryUsage();
  const lines = [
    '# HELP http_requests_total Total HTTP requests',
    '# TYPE http_requests_total counter',
    `http_requests_total ${metrics.requestsTotal}`,
    '',
    '# HELP http_requests_by_status HTTP requests by status class',
    '# TYPE http_requests_by_status counter',
    ...Object.entries(metrics.requestsByStatus).map(([k, v]) => `http_requests_by_status{status="${k}"} ${v}`),
    '',
    '# HELP audio_conversions_total Total audio conversions',
    '# TYPE audio_conversions_total counter',
    `audio_conversions_total ${metrics.conversionTotal}`,
    '',
    '# HELP audio_conversion_duration_ms_total Total conversion time in ms',
    '# TYPE audio_conversion_duration_ms_total counter',
    `audio_conversion_duration_ms_total ${metrics.conversionDurationMs}`,
    '',
    '# HELP roblox_uploads_total Total Roblox uploads',
    '# TYPE roblox_uploads_total counter',
    `roblox_uploads_total ${metrics.uploadTotal}`,
    `roblox_uploads_accepted ${metrics.uploadAccepted}`,
    `roblox_uploads_failed ${metrics.uploadFailed}`,
    '',
    '# HELP process_uptime_ms Process uptime in ms',
    '# TYPE process_uptime_ms gauge',
    `process_uptime_ms ${uptime}`,
    '',
    '# HELP process_memory_rss_bytes Resident memory in bytes',
    '# TYPE process_memory_rss_bytes gauge',
    `process_memory_rss_bytes ${mem.rss}`,
    `process_memory_heap_used_bytes ${mem.heapUsed}`,
    `process_memory_heap_total_bytes ${mem.heapTotal}`,
    ''
  ];
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(lines.join('\n'));
}
