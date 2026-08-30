import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setJobProgress, getJobProgress, deleteJobProgress, pruneJobProgress } from '../lib/progressStore.js';

describe('progressStore — progres konversi in-memory', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('simpan & baca persen, clamp ke 0-100', () => {
    setJobProgress('job-1', 42);
    expect(getJobProgress('job-1')).toBe(42);
    setJobProgress('job-1', 150);
    expect(getJobProgress('job-1')).toBe(100);
    setJobProgress('job-1', -5);
    expect(getJobProgress('job-1')).toBe(0);
  });

  it('id tidak valid diabaikan; id kotor dibersihkan konsisten set & get', () => {
    setJobProgress('', 50);
    setJobProgress('###', 50);
    setJobProgress('ah/ack!@#', 50);
    expect(getJobProgress('')).toBeNull();
    expect(getJobProgress('###')).toBeNull(); // dibersihkan jadi '' → ditolak
    // Karakter ilegal dibuang secara konsisten: 'ah/ack!@#' ≡ 'ahack'
    expect(getJobProgress('ah/ack!@#')).toBe(50);
    expect(getJobProgress('ahack')).toBe(50);
  });

  it('kedaluwarsa via TTL → null', () => {
    setJobProgress('job-ttl', 10);
    vi.advanceTimersByTime(16 * 60 * 1000);
    expect(getJobProgress('job-ttl')).toBeNull();
  });

  it('delete menghapus entri', () => {
    setJobProgress('job-del', 99);
    deleteJobProgress('job-del');
    expect(getJobProgress('job-del')).toBeNull();
  });

  it('prune membersihkan entri tua dan menyisa yang baru', () => {
    setJobProgress('old', 1);
    vi.advanceTimersByTime(16 * 60 * 1000);
    setJobProgress('fresh', 2);
    pruneJobProgress(Date.now());
    expect(getJobProgress('old')).toBeNull();
    expect(getJobProgress('fresh')).toBe(2);
  });
});
