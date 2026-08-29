// Konstanta global aplikasi (mode upload-only, tanpa login).

// Base URL API. Produksi (mis. client di Vercel + backend terpisah): set env
// VITE_API_BASE saat build, contoh https://space-username.hf.space — trailing slash dibuang
// agar gabungan URL tidak menghasilkan double slash. Default: same-origin (dev).
export const API_BASE = String(import.meta.env.VITE_API_BASE || window.location.origin).replace(/\/+$/, '');

export const MAX_AUDIO_DURATION_SECONDS = 200;

// Preset konversi simpel tapi jelas. speed = kecepatan tempo audio.
export const PRESETS = [
  { id: 'slow', label: 'Lambat', speed: 2.1, desc: 'Lebih santai, durasi output lebih panjang.' },
  { id: 'default', label: 'Default', speed: 2.3, desc: 'Setelan seimbang, rekomendasi.' },
  { id: 'fast', label: 'Cepat', speed: 2.5, desc: 'Tempo naik, output lebih ringkas.' },
  { id: 'faster', label: 'Lebih Cepat', speed: 2.7, desc: 'Untuk audio yang ingin padat.' },
  { id: 'ultra', label: 'Ultra', speed: 2.9, desc: 'Tempo maksimum.' }
];

export const defaultSettings = {
  speed: 2.3,
  amplify: -4,
  maxDuration: MAX_AUDIO_DURATION_SECONDS,
  segmentSeconds: 180,
  pitch: 0,
  bassBoost: false,
  reverb: false,
  normalize: false,
  echo: false,
  fadeIn: 0,
  fadeOut: 0,
  trimStart: 0,
  trimEnd: 0,
  eqPreset: ''
};

export const EQ_PRESETS = [
  { value: '', label: 'Flat (default)' },
  { value: 'bass_heavy', label: 'Bass Heavy' },
  { value: 'vocal_clear', label: 'Vocal Clear' },
  { value: 'lo_fi', label: 'Lo-Fi' },
  { value: 'podcast', label: 'Podcast' }
];

export const ACCEPTED_EXT = '.mp3,.wav,.ogg,.m4a,.aac,.flac';

// Kunci localStorage.
export const STORAGE_KEYS = {
  roblox: 'audio-studio-roblox',
  groups: 'audio-studio-groups',
  history: 'audio-studio-history',
  settings: 'audio-studio-settings'
};
