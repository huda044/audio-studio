import { describe, it, expect } from 'vitest';
import { cleanNumericId } from '../routes/audio.routes.js';
import { parseSettings } from '../routes/audio.routes.js';

describe('Audio Routes - function tests', () => {
  describe('cleanNumericId', () => {
    it('should validate numeric strings', () => {
      expect(cleanNumericId('12345')).toBe('12345');
      expect(cleanNumericId('')).toBe('');
      expect(cleanNumericId('abc')).toBe('');
      expect(cleanNumericId('1')).toBe('');
    });

    it('should return empty for edge cases', () => {
      expect(cleanNumericId(null)).toBe('');
      expect(cleanNumericId(undefined)).toBe('');
    });
  });

  describe('parseSettings edge cases', () => {
    it('should handle empty object', () => {
      const result = parseSettings({});
      expect(result.speed).toBe(2.3);
      expect(result.bassBoost).toBe(false);
      expect(result.reverb).toBe(false);
    });

    it('should handle invalid JSON gracefully', () => {
      expect(() => parseSettings('not json')).toThrow();
    });
  });
});
