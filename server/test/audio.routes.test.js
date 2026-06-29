import { describe, it, expect } from 'vitest';
import { parseSettings } from '../routes/audio.routes.js';

describe('Audio Routes - parseSettings', () => {
  it('should parse valid settings JSON', () => {
    const raw = JSON.stringify({
      speed: 2,
      amplify: -4,
      pitch: 2,
      bassBoost: true,
      reverb: false,
      normalize: true,
      echo: false,
      fadeIn: 3,
      fadeOut: 2,
      trimStart: 10,
      trimEnd: 20,
      eqPreset: 'bass_heavy'
    });
    
    const result = parseSettings(raw);
    
    expect(result.speed).toBe(2);
    expect(result.amplify).toBe(-4);
    expect(result.pitch).toBe(2);
    expect(result.bassBoost).toBe(true);
    expect(result.reverb).toBe(false);
    expect(result.normalize).toBe(true);
    expect(result.echo).toBe(false);
    expect(result.fadeIn).toBe(3);
    expect(result.fadeOut).toBe(2);
    expect(result.trimStart).toBe(10);
    expect(result.trimEnd).toBe(20);
    expect(result.eqPreset).toBe('bass_heavy');
  });

  it('should use defaults for missing values', () => {
    const raw = JSON.stringify({});
    const result = parseSettings(raw);
    
    expect(result.speed).toBe(2.3);
    expect(result.amplify).toBe(-4);
    expect(result.pitch).toBe(0);
    expect(result.bassBoost).toBe(false);
    expect(result.reverb).toBe(false);
    expect(result.normalize).toBe(false);
    expect(result.echo).toBe(false);
    expect(result.fadeIn).toBe(0);
    expect(result.fadeOut).toBe(0);
    expect(result.trimStart).toBe(0);
    expect(result.trimEnd).toBe(0);
    expect(result.eqPreset).toBe('');
  });

  it('should clamp speed to valid range', () => {
    const raw = JSON.stringify({ speed: 5 });
    const result = parseSettings(raw);
    expect(result.speed).toBe(3);
    
    const raw2 = JSON.stringify({ speed: 0.1 });
    const result2 = parseSettings(raw2);
    expect(result2.speed).toBe(0.5);
  });

  it('should clamp amplify to valid range', () => {
    const raw = JSON.stringify({ amplify: 30 });
    const result = parseSettings(raw);
    expect(result.amplify).toBe(20);
    
    const raw2 = JSON.stringify({ amplify: -30 });
    const result2 = parseSettings(raw2);
    expect(result2.amplify).toBe(-20);
  });

  it('should clamp pitch to valid range', () => {
    const raw = JSON.stringify({ pitch: 15 });
    const result = parseSettings(raw);
    expect(result.pitch).toBe(12);
    
    const raw2 = JSON.stringify({ pitch: -15 });
    const result2 = parseSettings(raw2);
    expect(result2.pitch).toBe(-12);
  });

  it('should throw error for invalid JSON', () => {
    expect(() => parseSettings('invalid json')).toThrow('Pengaturan audio tidak valid');
  });

  it('should handle non-object parsed result', () => {
    const raw = JSON.stringify('string');
    const result = parseSettings(raw);
    expect(result).toBeDefined();
  });
});
