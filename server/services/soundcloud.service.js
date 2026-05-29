// SoundCloud download via yt-dlp. Memakai helper bersama dari youtube.service.js
// untuk konsistensi (binary lookup, error wrapping, retry/proxy/timeout).
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import ffmpegPath from 'ffmpeg-static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const localYtDlp = path.join(serverRoot, 'bin', isWindows ? 'yt-dlp.exe' : 'yt-dlp');

let cachedYtDlpPath;

function httpError(message, status = 422, cause) {
  const error = new Error(message);
  error.status = status;
  if (cause) error.cause = cause;
  return error;
}

function cleanErrorText(value) {
  return String(value || '')
    .replace(/\uFFFD/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
}

function execFileAsync(file, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16,
      timeout: timeoutMs
    }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed || error.signal) {
          reject(httpError(`${path.basename(file)} timeout setelah ${Math.round(timeoutMs / 1000)} detik.`, 408, error));
          return;
        }
        const message = stderr || error.message || `${path.basename(file)} gagal dijalankan.`;
        reject(httpError(cleanErrorText(message), error.code === 'ENOENT' ? 503 : 422, error));
        return;
      }
      resolve(stdout);
    });
  });
}

async function resolveYtDlpPath() {
  if (cachedYtDlpPath !== undefined) return cachedYtDlpPath;
  const envPath = String(process.env.YTDLP_PATH || process.env.YT_DLP_PATH || '').trim().replace(/^["']|["']$/g, '');
  const candidates = [envPath, localYtDlp, isWindows ? 'yt-dlp.exe' : 'yt-dlp', 'yt-dlp'].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !existsSync(candidate)) continue;
    try {
      await execFileAsync(candidate, ['--version'], 8000);
      cachedYtDlpPath = candidate;
      return cachedYtDlpPath;
    } catch {
      // try next
    }
  }
  cachedYtDlpPath = '';
  return cachedYtDlpPath;
}

async function runYtDlp(args, timeoutMs = 25000) {
  const binary = await resolveYtDlpPath();
  if (!binary) throw httpError('yt-dlp belum tersedia di backend.', 503);
  return execFileAsync(binary, args, timeoutMs);
}

export function isSoundCloudUrl(input) {
  try {
    const url = new URL(/^https?:\/\//i.test(String(input || '')) ? String(input) : `https://${input}`);
    const host = url.hostname.toLowerCase();
    return host === 'soundcloud.com'
      || host === 'm.soundcloud.com'
      || host === 'on.soundcloud.com'
      || host === 'snd.sc';
  } catch {
    return false;
  }
}

export function normalizeSoundCloudUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw httpError('URL SoundCloud wajib diisi.', 400);
  let parsed;
  try {
    parsed = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw httpError('URL SoundCloud tidak valid.', 400);
  }
  if (!isSoundCloudUrl(parsed.toString())) {
    throw httpError('Hanya link SoundCloud yang diterima di endpoint ini.', 400);
  }
  parsed.hash = '';
  for (const k of [...parsed.searchParams.keys()]) {
    if (k.startsWith('utm_') || k === 'in' || k === 'si') parsed.searchParams.delete(k);
  }
  return parsed.toString();
}

function commonArgs() {
  return [
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', String(process.env.YTDLP_SOCKET_TIMEOUT || 10),
    '--retries', String(process.env.YTDLP_RETRIES || 1),
    '--fragment-retries', String(process.env.YTDLP_RETRIES || 1)
  ];
}

export async function getSoundCloudInfo(input) {
  const url = normalizeSoundCloudUrl(input);
  const out = await runYtDlp([
    ...commonArgs(),
    '--dump-single-json',
    '--skip-download',
    url
  ], 20000);
  const info = JSON.parse(out);
  return {
    title: info.title || 'SoundCloud Audio',
    thumbnail: info.thumbnail || (Array.isArray(info.thumbnails) ? info.thumbnails.at(-1)?.url : '') || '',
    duration: Number(info.duration || 0),
    url,
    videoId: String(info.id || '').slice(0, 64),
    durationSource: 'soundcloud-yt-dlp',
    uploader: info.uploader || ''
  };
}

async function findDownloadedFile(uploadsDir, prefix) {
  const files = await fs.readdir(uploadsDir);
  const matches = [];
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const fullPath = path.join(uploadsDir, file);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (stat?.isFile() && stat.size > 0) matches.push({ fullPath, mtimeMs: stat.mtimeMs });
  }
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.fullPath || '';
}

async function removeDownloadedFiles(uploadsDir, prefix) {
  const files = await fs.readdir(uploadsDir).catch(() => []);
  await Promise.all(files
    .filter((file) => file.startsWith(prefix))
    .map((file) => fs.unlink(path.join(uploadsDir, file)).catch(() => {})));
}

export async function downloadSoundCloudAudio(input, uploadsDir, options = {}) {
  const url = normalizeSoundCloudUrl(input);
  const id = nanoid(10);
  const outputPrefix = `soundcloud-${id}.`;
  const outputTemplate = path.join(uploadsDir, `${outputPrefix}%(ext)s`);
  const args = [
    ...commonArgs(),
    '--format', 'bestaudio/best',
    '--output', outputTemplate
  ];
  if (Number(options.sectionEnd || 0) >= 30 && String(process.env.YTDLP_ENABLE_SECTIONS || 'true').toLowerCase() !== 'false') {
    args.push('--download-sections', `*0-${Math.ceil(options.sectionEnd)}`);
    args.push('--force-keyframes-at-cuts');
    if (ffmpegPath) args.push('--ffmpeg-location', path.dirname(ffmpegPath));
  }
  args.push(url);
  try {
    await runYtDlp(args, Number(process.env.YTDLP_DOWNLOAD_TIMEOUT_MS || 60000));
  } catch (error) {
    await removeDownloadedFiles(uploadsDir, outputPrefix);
    throw error;
  }
  const outputPath = await findDownloadedFile(uploadsDir, outputPrefix);
  if (!outputPath) throw httpError('SoundCloud download selesai, tetapi file audio tidak ditemukan.', 422);
  return { path: outputPath, method: 'soundcloud-yt-dlp', sectionEnd: options.sectionEnd || 0 };
}
