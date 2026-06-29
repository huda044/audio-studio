import { describe, it, expect } from 'vitest';
import { formatSeconds } from '../routes/audio.routes.js';

describe('format (server)', () => {
  it('formatSeconds should format seconds', () => {
    expect(formatSeconds(0)).toBe('0:00');
    expect(formatSeconds(60)).toBe('1:00');
    expect(formatSeconds(3661)).toBe('61:01');
  });

  it('formatSeconds should handle negative', () => {
    expect(formatSeconds(-10)).toBe('0:00');
  });
});
