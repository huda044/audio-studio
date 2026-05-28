const buckets = new Map();

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').split(',')[0].trim();
}

export function rateLimit({ windowMs, max, message }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${clientKey(req)}:${req.baseUrl || ''}:${req.path}`;
    const bucket = buckets.get(key) || { resetAt: now + windowMs, count: 0 };

    if (now > bucket.resetAt) {
      bucket.resetAt = now + windowMs;
      bucket.count = 0;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ error: message || 'Terlalu banyak request. Coba lagi sebentar.' });
    }

    return next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 1000 * 60 * 5).unref?.();
