import { describe, it, expect, beforeEach } from 'vitest';
import {
  sanitizeJobsForStorage, loadRestoredJobs, clearStoredJobs,
  serverFileRemainingMs, formatRemaining, JOBS_KEY
} from '../lib/jobsPersist.js';

function makeDoneJob(id = 'j1', partCount = 2) {
  return {
    id, title: `Lagu ${id}`, status: 'done', file: { name: 'a.mp3' },
    progress: { percent: 100, stage: '', message: '' },
    partStatus: { 1: { status: 'Accepted' } },
    error: '',
    processed: {
      partCount, totalDuration: 180 * partCount,
      parts: Array.from({ length: partCount }, (_, i) => ({
        index: i + 1, fileName: `p${i + 1}.ogg`, audioUrl: `/api/files/p${i + 1}.ogg`,
        audioDataUrl: i === 0 ? 'data:audio/ogg;base64,XXXXBESAR' : '',
        duration: 180, durationText: '3:00', sizeBytes: 1000
      }))
    }
  };
}

describe('jobsPersist — hasil konversi tahan refresh', () => {
  beforeEach(() => localStorage.clear());

  it('menyimpan hanya job done dan melepas audioDataUrl (base64)', () => {
    const payload = JSON.parse(sanitizeJobsForStorage([
      makeDoneJob('a'), { ...makeDoneJob('b'), status: 'converting' }
    ]));
    expect(payload.jobs).toHaveLength(1);
    expect(payload.jobs[0].id).toBe('a');
    expect(payload.jobs[0].restored).toBe(true);
    const parts = payload.jobs[0].processed.parts;
    for (let i = 0; i < parts.length; i += 1) {
      expect(parts[i].audioDataUrl).toBeUndefined();
      expect(parts[i].audioUrl).toBe(`/api/files/p${i + 1}.ogg`);
    }
  });

  it('tidak ada job done → null (sinyal hapus storage)', () => {
    expect(sanitizeJobsForStorage([{ ...makeDoneJob('x'), status: 'converting' }])).toBeNull();
    expect(sanitizeJobsForStorage([])).toBeNull();
  });

  it('round-trip: simpan → baca → job utuh', () => {
    localStorage.setItem(JOBS_KEY, sanitizeJobsForStorage([makeDoneJob('r1', 3)]));
    const { jobs, savedAt } = loadRestoredJobs();
    expect(savedAt).toBeGreaterThan(0);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].processed.parts).toHaveLength(3);
    expect(jobs[0].partStatus[1].status).toBe('Accepted');
  });

  it('data korup → kosong, tidak throw', () => {
    localStorage.setItem(JOBS_KEY, '{{{{bukan json');
    expect(loadRestoredJobs()).toEqual({ jobs: [], savedAt: 0 });
  });

  it('clearStoredJobs menghapus', () => {
    localStorage.setItem(JOBS_KEY, sanitizeJobsForStorage([makeDoneJob()]));
    clearStoredJobs();
    expect(loadRestoredJobs().jobs).toHaveLength(0);
  });

  it('countdown kadaluarsa & formatnya', () => {
    expect(formatRemaining(serverFileRemainingMs(0))).toBe('kadaluarsa');
    expect(formatRemaining(-1000)).toBe('kadaluarsa');
    expect(formatRemaining(90 * 60000)).toBe('±1j 30m');
    expect(formatRemaining(5 * 60000)).toBe('±5m');
  });
});
