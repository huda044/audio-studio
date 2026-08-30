import { describe, it, expect, vi, afterEach } from 'vitest';
import { pingHealth } from '../lib/api.js';

describe('pingHealth — cek kesehatan backend', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('true bila /health merespons ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    expect(await pingHealth()).toBe(true);
  });

  it('false bila respons tidak ok (mis. 502 saat Space bangun)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await pingHealth()).toBe(false);
  });

  it('false bila fetch gagal (backend mati / timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect(await pingHealth()).toBe(false);
  });
});
