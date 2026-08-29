import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { clientAbortError } from './taskQueue.service.js';

const require = createRequire(import.meta.url);

// Wrapper yt-dlp untuk import audio dari YouTube — 100% gratis, tanpa API key.
//
// Strategi anti-blok (YouTube sering menolak IP datacenter seperti HF Spaces):
//   1. Percobaan 1: client default yt-dlp.
//   2. Percobaan 2: player_client=android,ios (sering lolos saat web diblok).
//   3. Semua kegagalan dipetakan ke pesan Indonesia yang menjelaskan solusinya,
//      jadi user tahu persis kenapa gagal (blokir bot, video privat, dsb).
//
// Lokasi binary dicari berurutan: env YTDL_PATH → server/bin/yt-dlp(.exe) → PATH.
// Pola server/bin/yt-dlp* memang disiapkan di .gitignore untuk instalasi lokal dev.

const DEFAULT_TIMEOUT_MS = 300000; // 5 menit per percobaan download
const DEFAULT_META_TIMEOUT_MS = 90000; // metadata bisa lambat di IP datacenter (HF)
const DEFAULT_SOCKET_TIMEOUT_S = 20;

// Urutan percobaan client YouTube: default dulu, lalu android/ios yang sering
// lolos ketika web client diblok verifikasi bot di IP datacenter.
const PLAYER_CLIENT_ATTEMPTS = [null, 'youtube:player_client=android,ios'];

export const YOUTUBE_URL_RE = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]{6,}/i;

export function resolveYtDlpPath() {
  const candidates = [];
  if (process.env.YTDL_PATH) candidates.push(process.env.YTDL_PATH);
  const binDir = path.resolve(process.cwd(), 'bin');
  candidates.push(path.join(binDir, 'yt-dlp'));
  if (process.platform === 'win32') candidates.push(path.join(binDir, 'yt-dlp.exe'));
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // try next
    }
  }
  return 'yt-dlp'; // harapkan ada di PATH
}

export function isYouTubeUrl(url) {
  return YOUTUBE_URL_RE.test(String(url || '').trim());
}

// Petakan stderr yt-dlp ke pesan Indonesia yang bisa dipahami user + saran solusi.
export function mapYtError(stderr = '') {
  const text = String(stderr).toLowerCase();
  if (text.includes('sign in to confirm') || text.includes('not a bot')) {
    return 'YouTube memblokir akses dari server (verifikasi bot). Ini terjadi berkala pada server gratis — coba lagi beberapa menit, atau gunakan upload file.';
  }
  if (text.includes('members-only') || text.includes('members only')) {
    return 'Video ini khusus member channel — tidak bisa diambil.';
  }
  if (text.includes('private video')) {
    return 'Video ini privat — tidak bisa diambil.';
  }
  if (text.includes('confirm your age') || text.includes('age-restricted')) {
    return 'Video dibatasi usia — butuh login YouTube sehingga tidak bisa diambil otomatis.';
  }
  if (text.includes('video unavailable') || text.includes('has been removed') || text.includes('removed by the uploader')) {
    return 'Video tidak tersedia atau sudah dihapus.';
  }
  if (text.includes('copyright')) {
    return 'Video diblokir pemilik hak cipta di wilayah/konteks ini.';
  }
  if (text.includes('live event will begin') || text.includes('is live')) {
    return 'Video masih live atau belum dimulai — tunggu selesai live lalu coba lagi.';
  }
  if (text.includes('http error 429') || text.includes('too many requests')) {
    return 'YouTube membatasi request dari server ini sementara. Tunggu beberapa menit lalu coba lagi.';
  }
  if (text.includes('unsupported url') || text.includes('is not a valid url')) {
    return 'URL tidak dikenali. Gunakan link youtube.com/watch, youtu.be, atau /shorts/.';
  }
  if (text.includes('enoent') || text.includes('no such file') || text.includes('not recognized')) {
    return 'yt-dlp belum terpasang di server. Instal binary (server/bin/yt-dlp) atau set env YTDL_PATH.';
  }
  return 'Gagal mengambil audio dari YouTube. Coba lagi atau gunakan upload file.';
}

function runYtDlp(args, { timeoutMs, signal } = {}) {
  return new Promise((resolve, reject) => {
    const bin = resolveYtDlpPath();
    const child = spawn(bin, args, { signal, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      if (!settled) {
        settled = true;
        reject(new Error('Pengambilan audio dari YouTube melewati batas waktu server.'));
      }
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(mapToError(error, stderr));
    });
    child.on('close', (code, signalReceived) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signalReceived) return reject(clientAbortError('Import YouTube dibatalkan.'));
      if (code === 0) return resolve(stdout);
      const error = new Error(mapYtError(stderr));
      error.stderr = String(stderr).slice(-4000);
      reject(error);
    });
  });
}

function mapToError(spawnError, stderr) {
  if (spawnError.name === 'AbortError') return clientAbortError('Import YouTube dibatalkan.');
  const error = new Error(mapYtError(`${stderr}\n${spawnError.message}`));
  error.cause = spawnError;
  return error;
}

function baseArgs({ ffmpegDir, socketTimeoutS }) {
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    `--socket-timeout=${socketTimeoutS}`,
    '--retries', '2'
  ];
  if (ffmpegDir && fs.existsSync(ffmpegDir)) args.push(`--ffmpeg-location=${ffmpegDir}`);
  return args;
}

// Ambil metadata (judul, durasi, live?) TANPA mengunduh — untuk validasi cepat
// sebelum bandwidth dibuang ke video yang terlalu panjang. Coba juga dua set
// player client: di IP datacenter, client default sering ditahan bot-check.
export async function fetchYouTubeMeta(url, { signal } = {}) {
  const timeoutMs = Math.max(30000, Number(process.env.YTDL_META_TIMEOUT_MS || DEFAULT_META_TIMEOUT_MS));
  let lastError = null;
  for (let i = 0; i < PLAYER_CLIENT_ATTEMPTS.length; i += 1) {
    if (signal?.aborted) throw clientAbortError('Import YouTube dibatalkan.');
    const args = [
      ...baseArgs({ ffmpegDir: ffmpegDirForMeta(), socketTimeoutS: DEFAULT_SOCKET_TIMEOUT_S }),
      '--skip-download',
      '--dump-single-json'
    ];
    if (PLAYER_CLIENT_ATTEMPTS[i]) args.push('--extractor-args', PLAYER_CLIENT_ATTEMPTS[i]);
    args.push(String(url).trim());
    try {
      const stdout = await runYtDlp(args, { timeoutMs, signal });
      let info;
      try {
        info = JSON.parse(stdout);
      } catch {
        throw new Error('Gagal membaca metadata video YouTube. Coba lagi.');
      }
      const duration = Number(info.duration) || 0;
      return {
        id: String(info.id || ''),
        title: String(info.title || 'YouTube Audio').slice(0, 180),
        duration,
        isLive: Boolean(info.is_live)
      };
    } catch (error) {
      lastError = error;
      if (error.code === 'client_abort' || signal?.aborted) throw error;
      if (i === PLAYER_CLIENT_ATTEMPTS.length - 1) throw error;
    }
  }
  throw lastError || new Error('Gagal membaca metadata video YouTube.');
}

function ffmpegDirForMeta() {
  // ffmpeg-static dipakai yt-dlp hanya untuk post-processing — opsional di tahap metadata.
  try {
    return path.dirname(require.resolve('ffmpeg-static'));
  } catch {
    return '';
  }
}

// Unduh audio kualitas terbaik ke downloadsDir. Kembalikan path file hasil.
// Dua percobaan: client default → android,ios (mengatasi blokir bot YouTube).
export async function downloadYouTubeAudio(url, downloadsDir, { signal, timeoutMs } = {}) {
  const effectiveTimeout = Math.max(30000, Number(timeoutMs || process.env.YTDL_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
  const attempts = PLAYER_CLIENT_ATTEMPTS;
  let lastError = null;

  for (let i = 0; i < attempts.length; i += 1) {
    if (signal?.aborted) throw clientAbortError('Import YouTube dibatalkan.');
    const outputBase = path.join(downloadsDir, `yt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const args = [
      ...baseArgs({ ffmpegDir: ffmpegDirForMeta(), socketTimeoutS: DEFAULT_SOCKET_TIMEOUT_S }),
      '-f', 'bestaudio[ext=m4a]/bestaudio/best',
      '--no-part',
      '-o', `${outputBase}.%(ext)s`
    ];
    if (attempts[i]) args.push('--extractor-args', attempts[i]);
    args.push(String(url).trim());

    try {
      await runYtDlp(args, { timeoutMs: effectiveTimeout, signal });
      const produced = fs.readdirSync(downloadsDir).find((f) => f.startsWith(path.basename(outputBase)) && !f.endsWith('.part'));
      if (!produced) throw new Error('Download selesai tetapi file audio tidak ditemukan.');
      return path.join(downloadsDir, produced);
    } catch (error) {
      lastError = error;
      // Abort: jangan dicoba ulang.
      if (error.code === 'client_abort' || signal?.aborted) throw error;
      // Percobaan terakhir: lempar apa adanya (pesan sudah dipetakan).
      if (i === attempts.length - 1) throw error;
    }
  }
  throw lastError || new Error('Gagal mengambil audio dari YouTube.');
}
