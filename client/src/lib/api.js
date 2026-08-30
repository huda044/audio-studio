import { API_BASE } from './constants.js';
import { apiError } from './utils.js';

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(data, data.error || `Request gagal (HTTP ${response.status}).`);
  return data;
}

// fetch dengan timeout internal, digabung dengan sinyal abort dari pemanggil
// (tombol Batal). Dua sebab abort dibedakan: kalau signal eksternal yang memicu,
// lempar AbortError asli (pemanggil memperlakukannya sebagai "dibatalkan user");
// kalau timer internal, lempar pesan timeout yang jelas.
async function fetchWithTimeout(url, { timeoutMs, signal, timeoutMessage, ...init }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      if (signal?.aborted) {
        const abortError = new Error('Dibatalkan.');
        abortError.name = 'AbortError';
        throw abortError;
      }
      throw new Error(timeoutMessage || `Request melewati batas waktu (${Math.round(timeoutMs / 1000)} detik).`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Upload file audio + setting → kembalikan hasil konversi (beberapa part .ogg).
// Timeout + abort controller built-in untuk mencegah hang; kirim `signal` untuk
// tombol Batal — server ikut menghentikan FFmpeg saat koneksi terputus.
export async function processAudio({ file, settings, title, segmentSeconds, signal }) {
  const form = new FormData();
  form.append('audio', file);
  form.append('settings', JSON.stringify(settings));
  if (title) form.append('title', title);
  if (segmentSeconds) form.append('segmentSeconds', String(segmentSeconds));

  const response = await fetchWithTimeout(`${API_BASE}/api/process`, {
    method: 'POST',
    body: form,
    timeoutMs: 600000,
    timeoutMessage: 'Konversi melewati batas waktu server (10 menit).',
    signal
  });
  return parseJson(response);
}

// Import audio dari link YouTube — server mengunduh (yt-dlp) lalu konversi
// dengan pipeline yang sama seperti /api/process. Bisa memakan waktu lama
// (download + konversi), makanya timeout-nya paling panjang.
export async function importYouTube({ url, settings, segmentSeconds, title, signal }) {
  const response = await fetchWithTimeout(`${API_BASE}/api/import-youtube`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, settings, segmentSeconds, title }),
    timeoutMs: 900000,
    timeoutMessage: 'Import YouTube melewati batas waktu (15 menit).',
    signal
  });
  return parseJson(response);
}

// Ambil blob hasil konversi dari sebuah part (untuk dikirim ke upload Roblox).
export async function fetchPartBlob(part, signal) {
  if (part?.audioDataUrl) {
    const res = await fetchWithTimeout(part.audioDataUrl, { timeoutMs: 120000, signal });
    return res.blob();
  }
  const res = await fetchWithTimeout(`${API_BASE}${part.audioUrl}`, {
    timeoutMs: 120000,
    timeoutMessage: 'Mengunduh part hasil konversi terlalu lama.',
    signal
  });
  if (!res.ok) throw new Error('File hasil konversi sudah tidak tersedia, konversi ulang dulu.');
  return res.blob();
}

// Hapus file part hasil konversi di server. Best-effort: kalau file sudah
// ter-sweep (404) atau server belum punya endpoint, tetap dianggap terhapus —
// pembersihan server hanyalah bonus, sumber kebenaran ada di state client.
export async function deleteFile(fileName, signal) {
  try {
    await fetchWithTimeout(`${API_BASE}/api/files/${encodeURIComponent(fileName)}`, {
      method: 'DELETE',
      timeoutMs: 15000,
      signal
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
  }
}

// Upload audio hasil proses ke Roblox Open Cloud.
export async function uploadRoblox({ blob, fileName, payload, signal }) {
  const form = new FormData();
  form.append('audio', blob, fileName || 'audio.ogg');
  form.append('payload', JSON.stringify(payload));
  const response = await fetchWithTimeout(`${API_BASE}/api/upload-roblox`, {
    method: 'POST',
    body: form,
    timeoutMs: 600000,
    timeoutMessage: 'Upload ke Roblox melewati batas waktu (10 menit).',
    signal
  });
  return parseJson(response);
}

export async function robloxTest({ apiKey, creator }) {
  const response = await fetchWithTimeout(`${API_BASE}/api/roblox-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, creator }),
    timeoutMs: 30000,
    timeoutMessage: 'Tes koneksi Roblox terlalu lama merespons.'
  });
  return parseJson(response);
}

export async function assetStatus({ operationId, apiKey }) {
  const response = await fetchWithTimeout(`${API_BASE}/api/asset-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId, apiKey }),
    timeoutMs: 30000,
    timeoutMessage: 'Cek status asset terlalu lama merespons.'
  });
  return parseJson(response);
}
