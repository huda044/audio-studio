import { describe, it, expect } from 'vitest';
import { rateLimit } from '../middleware/rateLimit.js';

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function makeReq(ip, path) {
  return {
    headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip },
    baseUrl: '',
    path
  };
}

describe('Rate Limit Middleware', () => {
  it('mengizinkan request sampai batas max lalu memblokir dengan 429', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2, message: 'stop' });
    const ip = '10.0.0.1';
    const path = '/test-block';

    let nextCalls = 0;
    const next = () => {
      nextCalls += 1;
    };

    const r1 = makeRes();
    limiter(makeReq(ip, path), r1, next);
    const r2 = makeRes();
    limiter(makeReq(ip, path), r2, next);
    expect(nextCalls).toBe(2);
    expect(r2.statusCode).toBe(200);

    const r3 = makeRes();
    limiter(makeReq(ip, path), r3, next);
    expect(nextCalls).toBe(2);
    expect(r3.statusCode).toBe(429);
    expect(r3.body.error).toBe('stop');
    expect(r3.headers['Retry-After']).toBeDefined();
  });

  it('IP berbeda dihitung terpisah', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    const path = '/test-iso';
    let nextCalls = 0;
    const next = () => {
      nextCalls += 1;
    };

    limiter(makeReq('1.1.1.1', path), makeRes(), next);
    limiter(makeReq('2.2.2.2', path), makeRes(), next);
    expect(nextCalls).toBe(2);
  });
});
