import { describe, it, expect } from 'vitest';
import { atempoChain, buildFilters } from '../services/ffmpeg.service.js';

describe('FFmpeg Service - Extended', () => {
  describe('atempoChain edge cases', () => {
    it('should clamp speed at 0.5 minimum', () => {
      const result = atempoChain(0.1);
      // 0.5 minimum
      expect(result).toEqual(['atempo=0.5000']);
    });

    it('should chain for speed > 2', () => {
      const result = atempoChain(2.5);
      expect(result.includes('atempo=2'));
      expect(result.includes('atempo=1.2500'));
    });

    it('should handle speed at 1.0', () => {
      const result = atempoChain(1.0);
      expect(result).toEqual(['atempo=1.0000']);
    });
  });

  describe('buildFilters edge cases', () => {
    it('should apply equalizer presets', () => {
      const settings = { speed: 1, amplify: 0, pitch: 0, bassBoost: false, reverb: false, normalize: false, echo: false, fadeIn: 0, fadeOut: 0, trimStart: 0, trimEnd: 0, eqPreset: 'vocal_clear' };
      const result = buildFilters(settings, 300);
      expect(result.filters.some(f => f.includes('equalizer=f=3000'))).toBe(true);
    });

    it('should skip loudnorm when DISABLE_LOUDNORM is set', () => {
      process.env.DISABLE_LOUDNORM = 'true';
      const settings = { speed: 1, amplify: 0, pitch: 0, bassBoost: false, reverb: false, normalize: true, echo: false, fadeIn: 0, fadeOut: 0, trimStart: 0, trimEnd: 0 };
      const result = buildFilters(settings, 300);
      expect(result.filters.some(f => f.includes('loudnorm'))).toBe(false);
      expect(result.warnings).toEqual(['Loudnorm di-skip karena DISABLE_LOUDNORM aktif di server.']);
      delete process.env.DISABLE_LOUDNORM;
    });
  });
});
