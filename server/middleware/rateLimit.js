const buckets = new Map();
const MAX_BUCKETS = 10000;

function clientKey(req) {
  // req.ip sudah menghormati app.set('trust proxy', 1): hanya X-Forwarded-For dari
  // tepat satu hop proxy terpercaya yang dipakai, sisanya diabaikan (anti-spoof).
  // Tanpa proxy, req.ip turun ke socket.remoteAddress. Penting saat deploy di belakang
  // proxy (HF Spaces/Vercel/nginx): pakai remoteAddress mentah membuat SEMUA pengunjung
  // dihitung sebagai satu client (limit global gabungan, bukan per-user).
  const ip = req.ip || req.socket?.remoteAddress || 'local';
  return String(ip).replace(/^::ffff:/, '');
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

    // Kirim rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - bucket.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));

    // Cleanup jika terlalu banyak buckets
    if (buckets.size > MAX_BUCKETS) {
      const cutoff = now - windowMs * 2;
      for (const [k, b] of buckets.entries()) {
        if (b.resetAt < cutoff) buckets.delete(k);
      }
    }

    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({
        error: message || 'Terlalu banyak request. Coba lagi sebentar.',
        status: 429,
        retryAfter: Math.ceil((bucket.resetAt - now) / 1000)
      });
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
