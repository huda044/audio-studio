import { describe, it, expect } from 'vitest';
import { PRESETS, EQ_PRESETS, ACCEPTED_EXT, defaultSettings, MAX_AUDIO_DURATION_SECONDS } from '../lib/constants.js';

describe('constants', () => {
  it('PRESETS should have 5 entries', () => {
    expect(PRESETS).toHaveLength(5);
    expect(PRESETS[0].id).toBe('slow');
    expect(PRESETS[4].id).toBe('ultra');
  });

  it('EQ_PRESETS should include all presets', () => {
    expect(EQ_PRESETS).toHaveLength(5);
    expect(EQ_PRESETS[0].value).toBe('');
  });

  it('ACCEPTED_EXT should list all extensions', () => {
    expect(ACCEPTED_EXT).toContain('.mp3');
    expect(ACCEPTED_EXT).toContain('.flac');
  });

  it('defaultSettings should have all fields', () => {
    expect(defaultSettings.speed).toBe(2.3);
    expect(defaultSettings.amplify).toBe(-4);
    expect(defaultSettings.maxDuration).toBe(200);
    expect(defaultSettings.segmentSeconds).toBe(180);
  });

  it('MAX_AUDIO_DURATION_SECONDS should be 200', () => {
    expect(MAX_AUDIO_DURATION_SECONDS).toBe(200);
  });
});
