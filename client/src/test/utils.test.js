import { describe, it, expect } from 'vitest';
import { cleanRobloxId, apiError, formatApiError, uid, robloxPlaybackSpeed } from '../lib/utils.js';

describe('utils', () => {
  it('cleanRobloxId should validate numeric IDs', () => {
    expect(cleanRobloxId('123456')).toBe('123456');
    expect(cleanRobloxId('')).toBe('');
    expect(cleanRobloxId('abc')).toBe('');
    expect(cleanRobloxId('12')).toBe('12');
    expect(cleanRobloxId('1')).toBe('');
  });

  it('uid should generate unique strings', () => {
    const a = uid();
    const b = uid();
    expect(a).not.toBe(b);
    expect(a).toContain('-');
    expect(b).toContain('-');
  });

  it('apiError should create error with details', () => {
    const e = apiError({ error: 'test error', details: ['detail1'] }, 'fallback');
    expect(e.message).toBe('test error');
    expect(e.details).toEqual(['detail1']);
    const fallback = apiError(null, 'fallback');
    expect(fallback.message).toBe('fallback');
  });

  it('formatApiError should combine message with details', () => {
    const e = new Error('test');
    e.details = ['d1', 'd2'];
    expect(formatApiError(e)).toBe('test — d1 · d2');
  });

  it('robloxPlaybackSpeed should invert', () => {
    expect(robloxPlaybackSpeed(2)).toBe('0.50');
    expect(robloxPlaybackSpeed(1)).toBe('1.00');
  });
});
