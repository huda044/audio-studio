export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

export function clientUa(req) {
  return String(req.headers['user-agent'] || '').slice(0, 200);
}
