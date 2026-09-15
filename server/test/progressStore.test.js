import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setJobProgress, getJobProgress, deleteJobProgress, pruneJobProgress } from '../lib/progressStore.js';

describe('progressStore — progres konversi in-memory', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('simpan & baca persen, clamp ke 0-100', () => {
    setJobProgress('job-1', 42);
    expect(getJobProgress('job-1')).toEqual({ percent: 42 });
    setJobProgress('job-1', 150);
    expect(getJobProgress('job-1').percent).toBe(100);
    setJobProgress('job-1', -5);
    expect(getJobProgress('job-1').percent).toBe(0);
  });

  it('id tidak valid diabaikan; id kotor dibersihkan konsisten set & get', () => {
    setJobProgress('', 50);
    setJobProgress('###', 50);
    setJobProgress('ah/ack!@#', 50);
    expect(getJobProgress('')).toBeNull();
    expect(getJobProgress('###')).toBeNull(); // dibersihkan jadi '' → ditolak
    // Karakter ilegal dibuang secara konsisten: 'ah/ack!@#' ≡ 'ahack'
    expect(getJobProgress('ah/ack!@#')).toEqual({ percent: 50 });
    expect(getJobProgress('ahack')).toEqual({ percent: 50 });
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
    expect(getJobProgress('fresh')).toEqual({ percent: 2 });
  });
});

// Tahap unduh vs konversi: tanpa pemisahan ini, bilah progres import YouTube
// tampak "mundur" (unduh 100% → konversi mulai 5%) dan user mengira bermasalah.
describe('progressStore — pemisahan tahap unduh & konversi', () => {
  it('menyimpan stage dan stagePercent bersama persen keseluruhan', () => {
    setJobProgress('yt-1', 27, { stage: 'download', stagePercent: 60 });
    expect(getJobProgress('yt-1')).toEqual({ percent: 27, stage: 'download', stagePercent: 60 });
  });

  it('tahap konversi juga terbaca', () => {
    setJobProgress('yt-2', 72, { stage: 'convert', stagePercent: 49 });
    expect(getJobProgress('yt-2')).toEqual({ percent: 72, stage: 'convert', stagePercent: 49 });
  });

  it('tahap tak dikenal diabaikan, persen tetap tersimpan', () => {
    setJobProgress('yt-3', 50, { stage: 'tahap-aneh', stagePercent: 90 });
    expect(getJobProgress('yt-3')).toEqual({ percent: 50 });
  });

  it('tanpa stage, bentuk lama tetap sama', () => {
    setJobProgress('plain', 33);
    expect(getJobProgress('plain')).toEqual({ percent: 33 });
    expect(getJobProgress('plain').stage).toBeUndefined();
  });

  it('stagePercent di-clamp dan default mengikuti persen keseluruhan', () => {
    setJobProgress('yt-4', 40, { stage: 'download', stagePercent: 999 });
    expect(getJobProgress('yt-4').stagePercent).toBe(100);
    setJobProgress('yt-5', 35, { stage: 'download' });
    expect(getJobProgress('yt-5').stagePercent).toBe(35);
  });
});
