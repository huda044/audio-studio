import { describe, it, expect } from 'vitest';
import { buildFilters, computeEffectiveDuration, atempoChain } from '../services/ffmpeg.service.js';

describe('FFmpeg Service - Core Functions', () => {
  describe('atempoChain', () => {
    it('should return single atempo filter for normal speed', () => {
      const result = atempoChain(1.5);
      expect(result).toEqual(['atempo=1.5000']);
    });

    it('should chain atempo filters for speed > 2', () => {
      const result = atempoChain(2.5);
      expect(result).toEqual(['atempo=2', 'atempo=1.2500']);
    });

    it('should chain atempo filters for speed < 0.5', () => {
      const result = atempoChain(0.25);
      // Clamped to 0.5 minimum, so only one filter
      expect(result).toEqual(['atempo=0.5000']);
    });
    it('should clamp speed to valid range', () => {
      const result = atempoChain(0.1);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('computeEffectiveDuration', () => {
    it('should compute duration with trim and speed', () => {
      const result = computeEffectiveDuration({
        sourceDuration: 300,
        trimStart: 10,
        trimEnd: 0,
        speed: 2,
        maxOutputSeconds: 3600
      });
      expect(result).toBeCloseTo(145, 0);
    });

    it('should throw error if trimStart exceeds source duration', () => {
      expect(() => {
        computeEffectiveDuration({
          sourceDuration: 100,
          trimStart: 150,
          trimEnd: 0,
          speed: 1,
          maxOutputSeconds: 3600
        });
      }).toThrow('Trim start melebihi durasi sumber audio');
    });

    it('should throw error if trim range too short', () => {
      expect(() => {
        computeEffectiveDuration({
          sourceDuration: 100,
          trimStart: 50,
          trimEnd: 50.01,
          speed: 1,
          maxOutputSeconds: 3600
        });
      }).toThrow('Range trim terlalu pendek');
    });

    it('should respect maxOutputSeconds limit', () => {
      const result = computeEffectiveDuration({
        sourceDuration: 10000,
        trimStart: 0,
        trimEnd: 0,
        speed: 0.5,
        maxOutputSeconds: 100
      });
      expect(result).toBe(100);
    });
  });

  describe('buildFilters', () => {
    it('should build basic filters with speed and volume', () => {
      const settings = {
        speed: 2,
        amplify: -4,
        pitch: 0,
        bassBoost: false,
        reverb: false,
        normalize: false,
        echo: false,
        fadeIn: 0,
        fadeOut: 0,
        trimStart: 0,
        trimEnd: 0
      };
      const result = buildFilters(settings, 300);
      expect(result.filters).toContain('atempo=2.0000');
      expect(result.filters).toContain('volume=-4dB');
      expect(result.appliedSettings.speed).toBe(2);
    });

    it('should add pitch filter when pitch is set', () => {
      const settings = {
        speed: 1,
        amplify: 0,
        pitch: 3,
        bassBoost: false,
        reverb: false,
        normalize: false,
        echo: false,
        fadeIn: 0,
        fadeOut: 0,
        trimStart: 0,
        trimEnd: 0
      };
      const result = buildFilters(settings, 300);
      expect(result.filters.some(f => f.includes('asetrate'))).toBe(true);
      expect(result.effects).toContain('Pitch +3 semitone');
    });

    it('should add bass boost filter when enabled', () => {
      const settings = {
        speed: 1,
        amplify: 0,
        pitch: 0,
        bassBoost: true,
        reverb: false,
        normalize: false,
        echo: false,
        fadeIn: 0,
        fadeOut: 0,
        trimStart: 0,
        trimEnd: 0
      };
      const result = buildFilters(settings, 300);
      expect(result.filters.some(f => f.includes('equalizer=f=90'))).toBe(true);
      expect(result.effects).toContain('Bass boost');
    });

    it('should add reverb filter when enabled', () => {
      const settings = {
        speed: 1,
        amplify: 0,
        pitch: 0,
        bassBoost: false,
        reverb: true,
        normalize: false,
        echo: false,
        fadeIn: 0,
        fadeOut: 0,
        trimStart: 0,
        trimEnd: 0
      };
      const result = buildFilters(settings, 300);
      expect(result.filters.some(f => f.includes('aecho=0.8:0.88:60'))).toBe(true);
      expect(result.effects).toContain('Reverb');
    });

    it('should add echo filter when enabled', () => {
      const settings = {
        speed: 1,
        amplify: 0,
        pitch: 0,
        bassBoost: false,
        reverb: false,
        normalize: false,
        echo: true,
        fadeIn: 0,
        fadeOut: 0,
        trimStart: 0,
        trimEnd: 0
      };
      const result = buildFilters(settings, 300);
      expect(result.filters.some(f => f.includes('aecho=0.8:0.9:1000'))).toBe(true);
      expect(result.effects).toContain('Echo');
    });

    it('should add fade in filter when fadeIn is set', () => {
      const settings = {
        speed: 1,
        amplify: 0,
        pitch: 0,
        bassBoost: false,
        reverb: false,
        normalize: false,
        echo: false,
        fadeIn: 3,
        fadeOut: 0,
        trimStart: 0,
        trimEnd: 0
      };
      const result = buildFilters(settings, 300);
      expect(result.filters.some(f => f.includes('afade=t=in:st=0:d=3'))).toBe(true);
      expect(result.effects).toContain('Fade in 3s');
    });

    it('should add fade out filter when fadeOut is set', () => {
      const settings = {
        speed: 1,
        amplify: 0,
        pitch: 0,
        bassBoost: false,
        reverb: false,
        normalize: false,
        echo: false,
        fadeIn: 0,
        fadeOut: 3,
        trimStart: 0,
        trimEnd: 0
      };
      const result = buildFilters(settings, 300);
      expect(result.filters.some(f => f.includes('afade=t=out'))).toBe(true);
      expect(result.effects).toContain('Fade out 3s');
    });

    it('should add EQ preset filters when set', () => {
      const settings = {
        speed: 1,
        amplify: 0,
        pitch: 0,
        bassBoost: false,
        reverb: false,
        normalize: false,
        echo: false,
        fadeIn: 0,
        fadeOut: 0,
        trimStart: 0,
        trimEnd: 0,
        eqPreset: 'bass_heavy'
      };
      const result = buildFilters(settings, 300);
      expect(result.filters.some(f => f.includes('equalizer=f=60'))).toBe(true);
      expect(result.effects).toContain('EQ bass heavy');
    });

    it('should add normalize filter when enabled', () => {
      const settings = {
        speed: 1,
        amplify: 0,
        pitch: 0,
        bassBoost: false,
        reverb: false,
        normalize: true,
        echo: false,
        fadeIn: 0,
        fadeOut: 0,
        trimStart: 0,
        trimEnd: 0
      };
      const result = buildFilters(settings, 300);
      expect(result.filters.some(f => f.includes('loudnorm'))).toBe(true);
      expect(result.effects).toContain('Normalize loudness');
    });

    it('should return correct appliedSettings', () => {
      const settings = {
        speed: 1.5,
        amplify: -2,
        pitch: 1,
        bassBoost: true,
        reverb: false,
        normalize: false,
        echo: true,
        fadeIn: 2,
        fadeOut: 3,
        trimStart: 5,
        trimEnd: 10
      };
      const result = buildFilters(settings, 300);
      expect(result.appliedSettings).toEqual({
        speed: 1.5,
        amplify: -2,
        pitch: 1,
        bassBoost: true,
        reverb: false,
        normalize: false,
        echo: true,
        fadeIn: 2,
        fadeOut: 3,
        trimStart: 5,
        trimEnd: 10,
        eqPreset: ''
      });
    });
  });
});
