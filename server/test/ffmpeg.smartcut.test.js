import { describe, it, expect } from 'vitest';
import { parseSilences, computeSmartCuts } from '../services/ffmpeg.service.js';

const SAMPLE_STDERR = [
  '[silencedetect @ 0x1] silence_start: 172.3',
  '[silencedetect @ 0x1] silence_end: 174.1 | silence_duration: 1.8',
  '[silencedetect @ 0x1] silence_start: 348.9',
  '[silencedetect @ 0x1] silence_end: 350.2 | silence_duration: 1.3'
].join('\n');

describe('parseSilences', () => {
  it('mem-parsing pasangan silence_start/end dari stderr ffmpeg', () => {
    expect(parseSilences(SAMPLE_STDERR)).toEqual([
      { start: 172.3, end: 174.1 },
      { start: 348.9, end: 350.2 }
    ]);
  });

  it('menutup jeda tanpa silence_end (akhir file) dengan totalDuration', () => {
    const stderr = '[silencedetect @ 0x1] silence_start: 500.5';
    expect(parseSilences(stderr, 520)).toEqual([{ start: 500.5, end: 520 }]);
  });

  it('stderr kosong → tanpa jeda', () => {
    expect(parseSilences('')).toEqual([]);
  });
});

describe('computeSmartCuts', () => {
  it('tanpa jeda hening → tetap pakai batas persis kelipatan segSec', () => {
    const cuts = computeSmartCuts({ totalDuration: 560, segSec: 180, silences: [] });
    expect(cuts).toEqual([180, 360]);
  });

  it('menggeser titik potong ke tengah jeda hening dalam toleransi', () => {
    const silences = [{ start: 172.3, end: 174.1 }]; // mid 173.2, ideal 180, selisih 6.8 < 8
    const cuts = computeSmartCuts({ totalDuration: 560, segSec: 180, silences });
    expect(cuts[0]).toBeCloseTo(173.2, 2);
    // boundary kedua tidak menemukan jeda → persis 360
    expect(cuts[1]).toBe(360);
  });

  it('jeda di luar toleransi diabaikan', () => {
    const silences = [{ start: 150, end: 152 }]; // mid 151, jauh dari 180
    const cuts = computeSmartCuts({ totalDuration: 560, segSec: 180, silences });
    expect(cuts[0]).toBe(180);
  });

  it('monoton naik, tidak menumpuk, dan boundary terlalu dekat akhir dilewati', () => {
    const cuts = computeSmartCuts({ totalDuration: 200, segSec: 180, silences: [] });
    expect(cuts).toEqual([]); // 180 > 200-25 → tidak ada potongan
  });

  it('jeda hening yang sama tidak dipakai dua kali', () => {
    const silences = [{ start: 172, end: 174 }]; // mid 173 cocok untuk ideal 180
    const cuts = computeSmartCuts({ totalDuration: 740, segSec: 180, silences, tolerance: 100 });
    expect(cuts[0]).toBeCloseTo(173, 1);
    expect(cuts[1]).toBe(360); // tidak memakai jeda yang sama
  });
});
