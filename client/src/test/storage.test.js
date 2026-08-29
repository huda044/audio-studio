import { describe, it, expect } from 'vitest';
import { normalizeSettings } from '../lib/utils.js';
import { STORAGE_KEYS } from '../lib/constants.js';
import { obfuscate, deobfuscate, safeParse } from '../lib/storage.js';

describe('storage helpers', () => {
  it('should obfuscate and deobfuscate roundtrip', () => {
    const plain = 'test-api-key-123';
    const obf = obfuscate(plain);
    expect(obf).not.toBe(plain);
    expect(obf.length).toBeGreaterThan(0);
    const deobf = deobfuscate(obf);
    expect(deobf).toBe(plain);
  });

  it('should handle empty obfuscation', () => {
    expect(obfuscate('')).toBe('');
    expect(deobfuscate('')).toBe('');
  });

  it('safeParse should handle JSON gracefully', () => {
    expect(safeParse('{"a":1}', {})).toEqual({ a: 1 });
    expect(safeParse('invalid', { fallback: true })).toEqual({ fallback: true });
    expect(safeParse('', { fallback: true })).toEqual({ fallback: true });
  });
});

describe('normalizeSettings', () => {
  it('should merge with defaults', () => {
    const result = normalizeSettings({ speed: 2.5 });
    expect(result.speed).toBe(2.5);
    expect(result.pitch).toBe(0);
  });

  it('should clamp maxDuration', () => {
    const result = normalizeSettings({ maxDuration: 9999 });
    expect(result.maxDuration).toBe(200);
  });
});

describe('STORAGE_KEYS', () => {
  it('should have all required keys', () => {
    expect(STORAGE_KEYS.roblox).toBe('audio-studio-roblox');
    expect(STORAGE_KEYS.groups).toBe('audio-studio-groups');
    expect(STORAGE_KEYS.history).toBe('audio-studio-history');
    expect(STORAGE_KEYS.settings).toBe('audio-studio-settings');
  });
});
