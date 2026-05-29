import ytdl from '@distube/ytdl-core';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const localYtDlp = path.join(serverRoot, 'bin', isWindows ? 'yt-dlp.exe' : 'yt-dlp');
const USER_AGENT = process.env.YOUTUBE_USER_AGENT
  || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

let cachedYtdlOptionsKey = '';
let cachedYtdlOptions = null;
let cachedYtDlpPath;

function httpError(message, status = 422, cause) {
  const error = new Error(message);
  error.status = status;
  if (cause) error.cause = cause;
  return error;
}

function isYoutubeHost(hostname) {
  const host = hostname.toLowerCase();
  return host === 'youtu.be'
    || host === 'youtube.com'
    || host.endsWith('.youtube.com')
    || host === 'youtube-nocookie.com'
    || host.endsWith('.youtube-nocookie.com');
}

export function normalizeYoutubeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw httpError('URL YouTube wajib diisi.', 400);

  let parsed;
  try {
    parsed = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw httpError('URL YouTube tidak valid.', 400);
  }

  if (!isYoutubeHost(parsed.hostname)) {
    throw httpError('Hanya link YouTube yang didukung.', 400);
  }

  let videoId = '';
  const host = parsed.hostname.toLowerCase();
  if (host === 'youtu.be') {
    videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
  } else {
    videoId = parsed.searchParams.get('v') || '';
    const shortsMatch = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    const embedMatch = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (!videoId && shortsMatch) videoId = shortsMatch[1];
    if (!videoId && embedMatch) videoId = embedMatch[1];
  }

  videoId = String(videoId).trim();
  if (!/^[a-zA-Z0-9_-]{6,32}$/.test(videoId)) {
    throw httpError('Video ID YouTube tidak terbaca dari URL.', 400);
  }

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`
  };
}

export function extractVideoId(url) {
  try {
    return normalizeYoutubeUrl(url).videoId;
  } catch {
    return '';
  }
}

function parseClockDuration(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const parts = raw.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function parseIsoDuration(value) {
  const match = String(value || '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match.map((item) => Number(item || 0));
  return (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
}

function bestThumbnail(details, videoId) {
  const thumbnails = details?.thumbnails || [];
  if (Array.isArray(thumbnails) && thumbnails.length) {
    return thumbnails.at(-1)?.url || thumbnails[0]?.url || '';
  }
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
}

function parseCookiesJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getYtdlOptions() {
  const key = JSON.stringify({
    cookieJson: process.env.YOUTUBE_COOKIES_JSON || '',
    cookie: process.env.YOUTUBE_COOKIE || '',
    proxy: process.env.YOUTUBE_PROXY || ''
  });
  if (cachedYtdlOptions && cachedYtdlOptionsKey === key) return cachedYtdlOptions;

  const cookies = parseCookiesJson(process.env.YOUTUBE_COOKIES_JSON);
  const proxy = String(process.env.YOUTUBE_PROXY || '').trim();
  const options = {
    requestOptions: {
      headers: {
        'user-agent': USER_AGENT,
        'accept-language': 'en-US,en;q=0.9'
      }
    }
  };

  if (proxy) {
    options.agent = ytdl.createProxyAgent({ uri: proxy }, cookies);
  } else if (cookies.length) {
    options.agent = ytdl.createAgent(cookies);
  } else if (process.env.YOUTUBE_COOKIE) {
    options.requestOptions.headers.cookie = process.env.YOUTUBE_COOKIE;
  }

  cachedYtdlOptionsKey = key;
  cachedYtdlOptions = options;
  return options;
}

function execFileAsync(file, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16,
      timeout: timeoutMs
    }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr || error.message || `${path.basename(file)} gagal dijalankan.`;
        reject(httpError(message.trim(), error.code === 'ENOENT' ? 503 : 422, error));
        return;
      }
      resolve(stdout);
    });
  });
}

async function resolveYtDlpPath() {
  if (cachedYtDlpPath !== undefined) return cachedYtDlpPath;
  const envPath = String(process.env.YTDLP_PATH || process.env.YT_DLP_PATH || '').trim().replace(/^["']|["']$/g, '');
  const candidates = [
    envPath,
    localYtDlp,
    isWindows ? 'yt-dlp.exe' : 'yt-dlp',
    'yt-dlp'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !existsSync(candidate)) continue;
    try {
      await execFileAsync(candidate, ['--version'], 8000);
      cachedYtDlpPath = candidate;
      return cachedYtDlpPath;
    } catch {
      // Try the next candidate.
    }
  }

  cachedYtDlpPath = '';
  return cachedYtDlpPath;
}

function ytDlpCommonArgs() {
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', String(process.env.YTDLP_SOCKET_TIMEOUT || 20),
    '--retries', String(process.env.YTDLP_RETRIES || 2),
    '--fragment-retries', String(process.env.YTDLP_RETRIES || 2)
  ];
  const cookiesFile = String(process.env.YTDLP_COOKIES_FILE || '').trim();
  const proxy = String(process.env.YOUTUBE_PROXY || '').trim();
  const extractorArgs = String(process.env.YTDLP_EXTRACTOR_ARGS || 'youtube:player_client=android,web').trim();

  if (cookiesFile) args.push('--cookies', cookiesFile);
  if (proxy) args.push('--proxy', proxy);
  if (extractorArgs) args.push('--extractor-args', extractorArgs);
  return args;
}

async function runYtDlp(args, timeoutMs = 45000) {
  const binary = await resolveYtDlpPath();
  if (!binary) {
    throw httpError('yt-dlp belum tersedia di backend. Jalankan npm install ulang atau deploy dengan installer yt-dlp aktif.', 503);
  }
  return execFileAsync(binary, args, timeoutMs);
}

async function getYoutubeApiInfo(url, videoId) {
  const apiKey = String(process.env.YOUTUBE_API_KEY || '').trim();
  if (!apiKey) throw httpError('YOUTUBE_API_KEY belum diisi.', 503);
  const endpoint = new URL('https://www.googleapis.com/youtube/v3/videos');
  endpoint.searchParams.set('part', 'snippet,contentDetails');
  endpoint.searchParams.set('id', videoId);
  endpoint.searchParams.set('key', apiKey);

  const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(data.error?.message || 'YouTube Data API gagal membaca video.', response.status);
  }
  const item = data.items?.[0];
  if (!item) throw httpError('Video YouTube tidak ditemukan.', 404);
  return {
    title: item.snippet?.title || 'YouTube Audio',
    thumbnail: item.snippet?.thumbnails?.maxres?.url
      || item.snippet?.thumbnails?.high?.url
      || item.snippet?.thumbnails?.default?.url
      || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: parseIsoDuration(item.contentDetails?.duration),
    url,
    videoId,
    durationSource: 'youtube-api'
  };
}

async function getYtDlpInfo(url, videoId) {
  const output = await runYtDlp([
    ...ytDlpCommonArgs(),
    '--dump-single-json',
    '--skip-download',
    url
  ]);
  const info = JSON.parse(output);
  return {
    title: info.title || 'YouTube Audio',
    thumbnail: info.thumbnail || bestThumbnail(info, videoId),
    duration: Number(info.duration || 0) || parseClockDuration(info.duration_string),
    url,
    videoId,
    durationSource: 'yt-dlp'
  };
}

async function getYtDlpPrintedInfo(url, videoId) {
  const output = await runYtDlp([
    ...ytDlpCommonArgs(),
    '--simulate',
    '--print', '%(title)s',
    '--print', '%(duration)s',
    '--print', '%(thumbnail)s',
    url
  ]);
  const [title, duration, thumbnail] = output.split(/\r?\n/).map((line) => line.trim());
  let base = {};
  if (!title || title.includes('\uFFFD') || !thumbnail) {
    try {
      base = await getOembedInfo(url, videoId);
    } catch {
      base = {};
    }
  }
  return {
    title: base.title || title || 'YouTube Audio',
    thumbnail: base.thumbnail || thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: Number(duration || 0),
    url,
    videoId,
    durationSource: 'yt-dlp-print'
  };
}

async function getYtdlInfo(url, videoId) {
  const options = getYtdlOptions();
  const info = await ytdl.getBasicInfo(url, options);
  const details = info.videoDetails || {};
  return {
    title: details.title || 'YouTube Audio',
    thumbnail: bestThumbnail(details, videoId),
    duration: Number(details.lengthSeconds || 0),
    url,
    videoId,
    durationSource: 'ytdl-core'
  };
}

async function getDirectMediaInfo(url, videoId) {
  const directUrl = await getDirectMediaUrl(url);
  const parsed = new URL(directUrl);
  let base = {};
  try {
    base = await getOembedInfo(url, videoId);
  } catch {
    base = {};
  }
  return {
    title: base.title || 'YouTube Audio',
    thumbnail: base.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: Number(parsed.searchParams.get('dur') || 0),
    url,
    videoId,
    durationSource: 'direct-url'
  };
}

async function getOembedInfo(url, videoId) {
  const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw httpError('Preview YouTube tidak tersedia.', response.status);
  const data = await response.json();
  return {
    title: data.title || 'YouTube Audio',
    thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: 0,
    url,
    videoId,
    durationSource: 'oembed'
  };
}

export async function getYoutubeInfo(input) {
  const { url, videoId } = normalizeYoutubeUrl(input);
  const attempts = [
    () => getYoutubeApiInfo(url, videoId),
    () => getYtDlpInfo(url, videoId),
    () => getYtDlpPrintedInfo(url, videoId),
    () => getYtdlInfo(url, videoId),
    () => getDirectMediaInfo(url, videoId),
    () => getOembedInfo(url, videoId)
  ];
  let lastError = null;

  for (const attempt of attempts) {
    try {
      const info = await attempt();
      if (info.title || info.thumbnail || info.duration) return info;
    } catch (error) {
      lastError = error;
    }
  }

  return {
    title: 'YouTube Audio',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: 0,
    url,
    videoId,
    durationSource: 'fallback',
    warning: lastError?.message || ''
  };
}

function downloadStream(stream, outputPath, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(outputPath);
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        stream.destroy?.();
        file.destroy?.();
        reject(error);
      } else {
        resolve(outputPath);
      }
    };
    const timer = setTimeout(() => {
      finish(httpError('Download YouTube terlalu lama dan dihentikan.', 408));
    }, timeoutMs);

    stream.on('error', finish);
    file.on('error', finish);
    file.on('finish', () => finish());
    stream.pipe(file);
  });
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

function inferExtensionFromUrl(url, contentType = '') {
  try {
    const parsed = new URL(url);
    const mime = decodeURIComponent(parsed.searchParams.get('mime') || '').toLowerCase();
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('webm')) return 'webm';
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  } catch {
    // Fall back to the content type below.
  }
  const type = String(contentType || '').toLowerCase();
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('webm')) return 'webm';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  return 'media';
}

async function getDirectMediaUrl(url) {
  const output = await runYtDlp([
    ...ytDlpCommonArgs(),
    '--format', 'bestaudio[ext=m4a]/bestaudio/best[height<=360]/best',
    '--get-url',
    url
  ], 60000);
  const directUrl = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^https?:\/\//i.test(line));
  if (!directUrl) throw httpError('yt-dlp tidak mengembalikan direct media URL.', 422);
  return directUrl;
}

async function downloadDirectMedia(url, uploadsDir) {
  const directUrl = await getDirectMediaUrl(url);
  const response = await fetch(directUrl, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(Number(process.env.YOUTUBE_DIRECT_DOWNLOAD_TIMEOUT_MS || 180000))
  });
  if (!response.ok || !response.body) {
    throw httpError(`Direct media download gagal: HTTP ${response.status}.`, response.status || 422);
  }

  const maxBytes = Number(process.env.MAX_UPLOAD_MB || 250) * 1024 * 1024;
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength && contentLength > maxBytes) {
    throw httpError('File YouTube terlalu besar untuk limit server saat ini.', 413);
  }

  const ext = inferExtensionFromUrl(directUrl, response.headers.get('content-type') || '');
  const outputPath = path.join(uploadsDir, `youtube-${nanoid(10)}.${ext}`);
  const file = await fs.open(outputPath, 'w');
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw httpError('File YouTube terlalu besar untuk limit server saat ini.', 413);
      await file.write(chunk);
    }
  } catch (error) {
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  } finally {
    await file.close();
  }
  if (bytes === 0) {
    await fs.unlink(outputPath).catch(() => {});
    throw httpError('Direct media download menghasilkan file kosong.', 422);
  }
  return outputPath;
}

async function downloadWithYtDlp(url, uploadsDir) {
  const id = nanoid(10);
  const outputPrefix = `youtube-${id}.`;
  const outputTemplate = path.join(uploadsDir, `${outputPrefix}%(ext)s`);
  await runYtDlp([
    ...ytDlpCommonArgs(),
    '--format', 'bestaudio[ext=m4a]/bestaudio/best',
    '--output', outputTemplate,
    url
  ], Number(process.env.YTDLP_DOWNLOAD_TIMEOUT_MS || 180000));
  const outputPath = await findDownloadedFile(uploadsDir, outputPrefix);
  if (!outputPath) throw httpError('yt-dlp selesai, tetapi file audio tidak ditemukan.', 422);
  return outputPath;
}

async function downloadWithYtdl(url, uploadsDir) {
  const outputPath = path.join(uploadsDir, `youtube-${nanoid(10)}.webm`);
  try {
    const stream = ytdl(url, {
      ...getYtdlOptions(),
      quality: 'highestaudio',
      filter: 'audioonly',
      highWaterMark: 1 << 25
    });
    return await downloadStream(stream, outputPath);
  } catch (error) {
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  }
}

export async function downloadYoutubeAudio(input, uploadsDir) {
  const { url } = normalizeYoutubeUrl(input);
  const failures = [];

  try {
    const outputPath = await downloadDirectMedia(url, uploadsDir);
    return { path: outputPath, method: 'direct-url', failures };
  } catch (error) {
    failures.push(`direct-url: ${error.message}`);
  }

  try {
    const outputPath = await downloadWithYtDlp(url, uploadsDir);
    return { path: outputPath, method: 'yt-dlp', failures };
  } catch (error) {
    failures.push(`yt-dlp: ${error.message}`);
  }

  try {
    const outputPath = await downloadWithYtdl(url, uploadsDir);
    return { path: outputPath, method: 'ytdl-core', failures };
  } catch (error) {
    failures.push(`ytdl-core: ${error.message}`);
  }

  const error = httpError(
    'Download YouTube gagal. Pastikan link publik, backend punya yt-dlp, dan jika hosting terkena bot check YouTube isi YOUTUBE_COOKIES_JSON/YTDLP_COOKIES_FILE.',
    422
  );
  error.details = failures;
  throw error;
}
