import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isYouTubeUrl, mapYtError, cleanYouTubeTitle, assertDownloadComplete, parseDownloadPercent, classifyYtError, YT_ERROR_KINDS } from '../services/youtube.service.js';

describe('isYouTubeUrl', () => {
  it('menerima format link YouTube yang umum', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(isYouTubeUrl('https://youtube.com/watch?v=abc123')).toBe(true);
    expect(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(isYouTubeUrl('https://m.youtube.com/watch?v=abc123')).toBe(true);
    expect(isYouTubeUrl('https://music.youtube.com/watch?v=abc123')).toBe(true);
    expect(isYouTubeUrl('https://www.youtube.com/shorts/abc123456')).toBe(true);
    expect(isYouTubeUrl('youtube.com/watch?v=abc123')).toBe(true);
  });

  it('menolak URL non-YouTube dan input sampah', () => {
    expect(isYouTubeUrl('https://vimeo.com/12345')).toBe(false);
    expect(isYouTubeUrl('https://evil.com/watch?v=abc123')).toBe(false);
    expect(isYouTubeUrl('https://youtube.com.evil.com/watch?v=abc123')).toBe(false);
    expect(isYouTubeUrl('bukan url')).toBe(false);
    expect(isYouTubeUrl('')).toBe(false);
    expect(isYouTubeUrl(undefined)).toBe(false);
    expect(isYouTubeUrl('https://youtube.com/')).toBe(false);
  });
});

describe('mapYtError — pesan error YouTube dalam bahasa Indonesia', () => {
  it('mendeteksi blokir bot dan menyarankan jalur upload file', () => {
    const msg = mapYtError('ERROR: Sign in to confirm you are not a bot');
    expect(msg).toContain('verifikasi bot');
    expect(msg).toContain('Dari File'); // saran konkret, bukan sekadar "coba lagi"
  });

  it('memisahkan gangguan jaringan dari blokir bot (tidak boleh tertukar)', () => {
    // "unable to download" dulu masuk bucket blokir-bot dan menyesatkan diagnosa.
    const network = mapYtError('ERROR: unable to download video data: HTTP Error 500');
    expect(network).toContain('terputus di tengah proses');
    expect(network).not.toContain('verifikasi bot');
    expect(mapYtError('Connection reset by peer')).toContain('terputus di tengah proses');
    expect(mapYtError('socket timed out')).toContain('terputus di tengah proses');
    // Blokir bot tetap terdeteksi sebagai blokir bot.
    expect(mapYtError('ERROR: Sign in to confirm you are not a bot')).toContain('verifikasi bot');
  });

  it('mendeteksi video privat, member-only, dan dihapus', () => {
    expect(mapYtError('Private video. Sign in')).toContain('privat');
    expect(mapYtError('Join this channel to get members-only access')).toContain('member');
    expect(mapYtError('Video unavailable')).toContain('tidak tersedia');
  });

  it('mendeteksi pembatasan usia dan rate limit 429', () => {
    expect(mapYtError('confirm your age')).toContain('dibatasi usia');
    expect(mapYtError('HTTP Error 429: Too Many Requests')).toContain('membatasi request');
  });

  it('mendeteksi URL tidak valid dan binary hilang', () => {
    expect(mapYtError('Unsupported URL: https://example.com')).toContain('URL tidak dikenali');
    expect(mapYtError('spawn yt-dlp ENOENT')).toContain('yt-dlp belum terpasang');
  });

  it('fallback generik untuk error tak dikenal', () => {
    expect(mapYtError('something completely weird')).toContain('Gagal mengambil audio');
    expect(mapYtError('')).toContain('Gagal mengambil audio');
  });
});

describe('cleanYouTubeTitle — pangkas junk bracket dari judul', () => {
  it('membuang (Official Video) dan (4K Remaster)', () => {
    expect(cleanYouTubeTitle('Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)'))
      .toBe('Rick Astley - Never Gonna Give You Up');
  });

  it('membuang berbagai variasi bracket junk', () => {
    expect(cleanYouTubeTitle('Lagu [Official MV]')).toBe('Lagu');
    expect(cleanYouTubeTitle('Lagu (Lyric Video)')).toBe('Lagu');
    expect(cleanYouTubeTitle('Lagu (HD)')).toBe('Lagu');
  });

  it('membiarkan bracket berisi info penting (feat.)', () => {
    expect(cleanYouTubeTitle('Lagu (feat. Someone) (Official Video)')).toBe('Lagu (feat. Someone)');
  });

  it('judul isinya junk semua → kembalikan original, jangan kosong', () => {
    expect(cleanYouTubeTitle('(Official Video)')).toBe('(Official Video)');
    expect(cleanYouTubeTitle('')).toBe('');
  });
});

// Cek integritas unduhan: file yang terputus harus tertangkap. Tanpa ini, lagu
// terpotong lolos ke konversi dan user menerima lagu pendek tanpa pesan error.
describe('assertDownloadComplete — deteksi unduhan tidak lengkap', () => {
  let dir = '';
  let utuh = '';
  let terpotong = '';

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdl-integ-'));
    const ffmpeg = require('ffmpeg-static');
    // 20 detik audio utuh, lalu versi 5 detik yang meniru unduhan terputus.
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
      '-i', 'sine=frequency=440:duration=20', '-ar', '44100', '-ac', '2',
      path.join(dir, 'utuh.mp3')], { timeout: 60000 });
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', path.join(dir, 'utuh.mp3'),
      '-t', '5', '-c', 'copy', path.join(dir, 'terpotong.mp3')], { timeout: 60000 });
    utuh = path.join(dir, 'utuh.mp3');
    terpotong = path.join(dir, 'terpotong.mp3');
  });

  afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('menerima file yang lengkap', () => {
    const hasil = assertDownloadComplete(utuh, 20);
    expect(hasil.ok).toBe(true);
    expect(hasil.actual).toBeGreaterThan(18);
  });

  it('menolak file terpotong (kasus yang dulu lolos diam-diam)', () => {
    const hasil = assertDownloadComplete(terpotong, 20);
    expect(hasil.ok).toBe(false);
    expect(hasil.reason).toContain('tidak lengkap');
  });

  it('memberi toleransi wajar terhadap selisih kecil durasi', () => {
    // Kontainer sering melaporkan durasi sedikit berbeda dari metadata YouTube.
    expect(assertDownloadComplete(utuh, 22).ok).toBe(true);
  });

  it('tidak memblokir bila durasi harapan tidak diketahui', () => {
    expect(assertDownloadComplete(utuh, 0).ok).toBe(true);
    expect(assertDownloadComplete(utuh, undefined).ok).toBe(true);
  });
});

// Parser persen unduhan: sumber data bilah progres tahap unduh. yt-dlp mencetak
// baris progres ke stdout, jadi parser harus tahan terhadap variasi format.
describe('parseDownloadPercent — persen unduhan dari yt-dlp', () => {
  it('membaca baris progres normal', () => {
    expect(parseDownloadPercent('[download]  42.3% of ~4.20MiB at 1.20MiB/s ETA 00:03')).toBe(42);
    expect(parseDownloadPercent('[download] 100% of 4.20MiB in 00:05')).toBe(100);
    expect(parseDownloadPercent('[download]   7.8% of 1.00MiB')).toBe(8);
  });

  it('mengembalikan null untuk baris yang bukan progres', () => {
    expect(parseDownloadPercent('[info] Downloading 1 format(s)')).toBeNull();
    expect(parseDownloadPercent('')).toBeNull();
    expect(parseDownloadPercent(undefined)).toBeNull();
  });

  it('menjepit nilai di luar 0-100', () => {
    expect(parseDownloadPercent('[download] 150% of x')).toBe(100);
  });
});

// Classifier: kode terstruktur inilah yang membuat UI bisa menawarkan tombol
// "pakai upload file" saat YouTube menahan, bukan sekadar menampilkan teks error.
describe('classifyYtError — kode error terstruktur', () => {
  it('menandai blokir bot', () => {
    expect(classifyYtError('Sign in to confirm you are not a bot')).toBe(YT_ERROR_KINDS.BLOCKED);
    expect(classifyYtError('HTTP Error 403: Forbidden')).toBe(YT_ERROR_KINDS.BLOCKED);
  });

  it('menandai gangguan jaringan', () => {
    expect(classifyYtError('unable to download video data')).toBe(YT_ERROR_KINDS.NETWORK);
    expect(classifyYtError('Connection reset by peer')).toBe(YT_ERROR_KINDS.NETWORK);
  });

  it('menandai video yang tidak bisa diambil', () => {
    expect(classifyYtError('Private video')).toBe(YT_ERROR_KINDS.UNAVAILABLE);
    expect(classifyYtError('Video unavailable')).toBe(YT_ERROR_KINDS.UNAVAILABLE);
  });

  it('jatuh ke unknown bila tidak dikenali', () => {
    expect(classifyYtError('sesuatu yang aneh')).toBe(YT_ERROR_KINDS.UNKNOWN);
    expect(classifyYtError('')).toBe(YT_ERROR_KINDS.UNKNOWN);
  });
});
