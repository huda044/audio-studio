// Lightweight structured logger (Pino-free, zero dependency).
// Menghasilkan JSON logs untuk production, pretty-print untuk development.

const isProd = process.env.NODE_ENV === 'production';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const MIN_LEVEL = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] || LEVELS.info;

const COLORS = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
  fatal: '\x1b[35m'  // magenta
};
const RESET = '\x1b[0m';

function formatPretty(level, msg, meta) {
  const ts = new Date().toISOString().slice(11, 23);
  const color = COLORS[level] || '';
  const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} ${color}${level.toUpperCase().padEnd(5)}${RESET} ${msg}${metaStr}`;
}

function formatJson(level, msg, meta) {
  return JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    ...meta
  });
}

function log(level, msg, meta = {}) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const line = isProd ? formatJson(level, msg, meta) : formatPretty(level, msg, meta);
  const stream = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
  stream.write(line + '\n');
}

export const logger = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  fatal: (msg, meta) => log('fatal', msg, meta),
  child: (bindings) => ({
    debug: (msg, meta) => log('debug', msg, { ...bindings, ...meta }),
    info: (msg, meta) => log('info', msg, { ...bindings, ...meta }),
    warn: (msg, meta) => log('warn', msg, { ...bindings, ...meta }),
    error: (msg, meta) => log('error', msg, { ...bindings, ...meta }),
    fatal: (msg, meta) => log('fatal', msg, { ...bindings, ...meta })
  })
};

export default logger;
