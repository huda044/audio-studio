import { describe, it, expect } from 'vitest';
import { isYouTubeUrl, mapYtError } from '../services/youtube.service.js';

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
  it('mendeteksi blokir bot', () => {
    const msg = mapYtError('ERROR: Sign in to confirm you are not a bot');
    expect(msg).toContain('memblokir akses dari server');
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
