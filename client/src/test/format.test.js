import { describe, it, expect } from 'vitest';
import { formatDuration, formatBytes } from '../lib/format.js';

describe('format', () => {
  it('formatDuration should format seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('formatDuration should handle negative', () => {
    expect(formatDuration(-10)).toBe('0:00');
  });

  it('formatBytes should format sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1048576)).toBe('1.00 MB');
  });
});
