import { API_BASE } from './constants.js';
import { apiError } from './utils.js';

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(data, data.error || `Request gagal (HTTP ${response.status}).`);
  return data;
}

// Upload file audio + setting → kembalikan hasil konversi (beberapa part .ogg).
export async function processAudio({ file, settings, title, segmentSeconds, signal }) {
  const form = new FormData();
  form.append('audio', file);
  form.append('settings', JSON.stringify(settings));
  if (title) form.append('title', title);
  if (segmentSeconds) form.append('segmentSeconds', String(segmentSeconds));
  const response = await fetch(`${API_BASE}/api/process`, { method: 'POST', body: form, signal });
  return parseJson(response);
}

// Ambil blob hasil konversi dari sebuah part (untuk dikirim ke upload Roblox).
export async function fetchPartBlob(part) {
  if (part?.audioDataUrl) {
    const res = await fetch(part.audioDataUrl);
    return res.blob();
  }
  const res = await fetch(`${API_BASE}${part.audioUrl}`);
  if (!res.ok) throw new Error('File hasil konversi sudah tidak tersedia, konversi ulang dulu.');
  return res.blob();
}

// Upload audio hasil proses ke Roblox Open Cloud.
export async function uploadRoblox({ blob, fileName, payload, signal }) {
  const form = new FormData();
  form.append('audio', blob, fileName || 'audio.ogg');
  form.append('payload', JSON.stringify(payload));
  const response = await fetch(`${API_BASE}/api/upload-roblox`, { method: 'POST', body: form, signal });
  return parseJson(response);
}

export async function robloxTest({ apiKey, creator }) {
  const response = await fetch(`${API_BASE}/api/roblox-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, creator })
  });
  return parseJson(response);
}

export async function assetStatus({ operationId, apiKey }) {
  const response = await fetch(`${API_BASE}/api/asset-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId, apiKey })
  });
  return parseJson(response);
}
