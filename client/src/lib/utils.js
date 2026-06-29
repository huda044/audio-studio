import { MAX_AUDIO_DURATION_SECONDS, defaultSettings } from './constants.js';

export function clampMaxDuration(value) {
  const numeric = Number(value || MAX_AUDIO_DURATION_SECONDS);
  return Math.min(Math.max(numeric, 30), MAX_AUDIO_DURATION_SECONDS);
}

export function normalizeSettings(settings = {}) {
  return {
    ...defaultSettings,
    ...settings,
    maxDuration: clampMaxDuration(settings.maxDuration),
    maxDurationLimit: MAX_AUDIO_DURATION_SECONDS
  };
}

export function cleanRobloxId(value) {
  const text = String(value || '').trim();
  return /^\d{2,32}$/.test(text) ? text : '';
}

export function apiError(data, fallback) {
  const error = new Error(data?.error || fallback);
  error.details = Array.isArray(data?.details)
    ? data.details.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
    : [];
  return error;
}

// Gabungkan pesan utama dengan details dari server (mis. info queue penuh) menjadi satu
// string user-friendly. Dipakai di toast/notifikasi agar user tidak kehilangan konteks
// tambahan yang sudah dikirim server.
export function formatApiError(error) {
  const base = String(error?.message || 'Terjadi kesalahan.').trim();
  const details = Array.isArray(error?.details) ? error.details : [];
  if (!details.length) return base;
  return `${base} — ${details.join(' · ')}`;
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function robloxPlaybackSpeed(speed) {
  return (1 / Number(speed || 1)).toFixed(2);
}
