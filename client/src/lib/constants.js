// Konstanta global aplikasi. Dipisah dari main.jsx agar mudah dirawat dan diuji.

export const API_BASE = import.meta.env.VITE_API_BASE || window.location.origin;
export const VITE_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const MAX_AUDIO_DURATION_SECONDS = 200;

export const presets = [
  ['Lambat', 2.1],
  ['Default', 2.3],
  ['Cepat', 2.5],
  ['Lebih Cepat', 2.7],
  ['Ultra', 2.9]
];

export const defaultSettings = {
  speed: 2.3,
  amplify: -4,
  maxDuration: MAX_AUDIO_DURATION_SECONDS,
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

export const PIPELINE_STEPS = [
  { key: 'preview', label: 'Preview link' },
  { key: 'download', label: 'Download & potong' },
  { key: 'convert', label: 'Convert preset' },
  { key: 'upload', label: 'Upload Roblox' }
];
