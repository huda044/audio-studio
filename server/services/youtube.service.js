import ytdl from '@distube/ytdl-core';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import ffmpegPath from 'ffmpeg-static';

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
let cachedCookiesKey = '';
let cachedCookiesFile = '';
let cookieStatus = { state: 'absent', validCount: 0, totalLines: 0, reason: '' };
let cookieLogged = false;

export function getCookieStatus() {
  return { ...cookieStatus };
}

export function inspectCookies() {
  cookieLogged = true; // suppress duplicate console log on inspect
  const file = resolveGeneratedCookiesFile();
  return {
    ...cookieStatus,
    file: file || null,
    envSet: hasCookieAttempt()
  };
}

function hasCookieAttempt() {
  return Boolean(
    String(process.env.YTDLP_COOKIES_FILE || '').trim()
    || String(process.env.YTDLP_COOKIES_TEXT || '').trim()
    || String(process.env.YTDLP_COOKIES_BASE64 || '').trim()
    || String(process.env.YOUTUBE_COOKIES_TEXT || '').trim()
    || String(process.env.YOUTUBE_COOKIES_BASE64 || '').trim()
    || String(process.env.YOUTUBE_COOKIES_JSON || '').trim()
    || String(process.env.YOUTUBE_COOKIE || '').trim()
  );
}

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

function isBotCheckError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('not a bot')
    || message.includes('sign in to confirm')
    || message.includes('use --cookies')
    || message.includes('cookies-from-browser')
    || message.includes('status code: 429')
    || message.includes('http error 429');
}

function isTimeoutError(error) {
  return Number(error?.status || 0) === 408
    || String(error?.message || '').toLowerCase().includes('timeout');
}

function isNetworkTlsErrorText(value) {
  const message = String(value || '').toLowerCase();
  return message.includes('unexpected_eof_while_reading')
    || message.includes('eof occurred in violation of protocol')
    || message.includes('ssl')
    || message.includes('tls')
    || message.includes('connection reset')
    || message.includes('remote end closed connection')
    || message.includes('unable to download api page');
}

function envEnabled(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
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

function looksBinary(text) {
  if (!text) return false;
  let bad = 0;
  const sample = text.slice(0, 4000);
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 32 || code === 0xFFFD) bad += 1;
  }
  return bad > Math.max(8, sample.length * 0.01);
}

function jsonCookiesToNetscape(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return '';
  }
  if (!Array.isArray(parsed)) return '';
  const lines = ['# Netscape HTTP Cookie File'];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const domain = String(entry.domain || '').trim();
    const name = String(entry.name || '').trim();
    const value = String(entry.value ?? '').trim();
    if (!domain || !name) continue;
    const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
    const cookiePath = String(entry.path || '/').trim() || '/';
    const secure = entry.secure ? 'TRUE' : 'FALSE';
    const expires = Number(entry.expirationDate || entry.expires || 0);
    lines.push([
      domain,
      includeSubdomains,
      cookiePath,
      secure,
      Math.max(0, Math.floor(expires)),
      name,
      value
    ].join('\t'));
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

function repairFlattenedNetscape(text) {
  // Sisipkan newline sebelum domain berikutnya kalau seluruh isi ngumpul jadi 1 baris.
  // Pattern entry yang valid setelah field VALUE adalah: <value>.<domain>.com<TAB>TRUE/FALSE<TAB>/<TAB>TRUE/FALSE<TAB>...
  // Pakai lookahead ketat: setelah domain harus ada TAB + TRUE/FALSE + TAB + path.
  // Lookbehind [^.\n\t] memastikan kita tidak split di awal file atau tengah domain.
  return text.replace(
    /(?<=[A-Za-z0-9_+\/=%&\-])(?=\.(?:youtube|google|googlevideo|ytimg)\.com\t(?:TRUE|FALSE)\t\/\t)/g,
    '\n'
  );
}

function normalizeCookieText(raw) {
  let text = String(raw || '');
  // Buang BOM, normalisasi newline, hapus kutip pembungkus paste env.
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').trim();
  if (!text) return '';

  if (looksBinary(text)) {
    cookieStatus = { state: 'invalid', validCount: 0, totalLines: 0, reason: 'binary-or-corrupt' };
    return '';
  }

  if (text.startsWith('[') || text.startsWith('{')) {
    const converted = jsonCookiesToNetscape(text);
    if (converted) text = converted;
  }

  // Kalau seluruh cookies nempel jadi 1 baris karena env var kehilangan \n,
  // pisahkan otomatis sebelum domain berikutnya.
  if (!text.includes('\n')) {
    text = repairFlattenedNetscape(text);
  }

  // Format "name=value; name2=value2" (tanpa tab) dari header Cookie.
  if (!text.includes('\t')) {
    const rows = ['# Netscape HTTP Cookie File'];
    for (const item of text.split(/[;\n]/)) {
      const [name, ...rest] = item.trim().split('=');
      const value = rest.join('=');
      if (!name || !value) continue;
      rows.push(`.youtube.com\tTRUE\t/\tTRUE\t1893456000\t${name.trim()}\t${value.trim()}`);
    }
    text = rows.length > 1 ? rows.join('\n') : '';
    if (!text) {
      cookieStatus = { state: 'invalid', validCount: 0, totalLines: 0, reason: 'no-tabs-and-no-pairs' };
      return '';
    }
  }

  const validRows = [];
  let totalLines = 0;
  for (const original of text.split('\n')) {
    const line = original.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      validRows.push(line);
      continue;
    }
    totalLines += 1;
    const cols = line.split('\t');
    if (cols.length < 7) continue;
    // Buang trailing empty col (jadi 8 kalau ada tab tambahan).
    const normalized = cols.slice(0, 7);
    const [domain, includeSub, cookiePath, secure, expires, name] = normalized;
    if (!domain || !name) continue;
    if (!/^\.?[\w-]+(?:\.[\w-]+)+$/.test(domain)) continue;
    if (!/^(TRUE|FALSE)$/i.test(includeSub)) continue;
    if (!/^(TRUE|FALSE)$/i.test(secure)) continue;
    if (!/^-?\d+$/.test(expires)) continue;
    if (!cookiePath.startsWith('/')) continue;
    validRows.push(normalized.join('\t'));
  }

  const validCount = validRows.filter((row) => !row.startsWith('#')).length;
  if (!validCount) {
    cookieStatus = { state: 'invalid', validCount: 0, totalLines, reason: 'no-valid-rows' };
    return '';
  }

  if (!validRows.some((row) => row.startsWith('# Netscape HTTP Cookie File'))) {
    validRows.unshift('# Netscape HTTP Cookie File');
  }
  cookieStatus = { state: 'ok', validCount, totalLines, reason: '' };
  return `${validRows.join('\n')}\n`;
}

function envCookieText() {
  const rawText = process.env.YTDLP_COOKIES_TEXT || process.env.YOUTUBE_COOKIES_TEXT || '';
  if (rawText) return normalizeCookieText(rawText);
  const rawBase64 = process.env.YTDLP_COOKIES_BASE64 || process.env.YOUTUBE_COOKIES_BASE64 || '';
  if (rawBase64) {
    try {
      return normalizeCookieText(Buffer.from(rawBase64, 'base64').toString('utf8'));
    } catch {
      cookieStatus = { state: 'invalid', validCount: 0, totalLines: 0, reason: 'base64-decode-failed' };
      return '';
    }
  }
  if (process.env.YOUTUBE_COOKIES_JSON) return normalizeCookieText(process.env.YOUTUBE_COOKIES_JSON);
  if (process.env.YOUTUBE_COOKIE) return normalizeCookieText(process.env.YOUTUBE_COOKIE);
  return '';
}

function resolveGeneratedCookiesFile() {
  const cookiesFile = String(process.env.YTDLP_COOKIES_FILE || '').trim();
  if (cookiesFile) {
    if (existsSync(cookiesFile)) {
      cookieStatus = { state: 'ok', validCount: -1, totalLines: -1, reason: 'external-file' };
      return cookiesFile;
    }
    cookieStatus = { state: 'invalid', validCount: 0, totalLines: 0, reason: 'cookies-file-missing' };
    return '';
  }
  const text = envCookieText();
  if (!text) {
    if (cookieStatus.state !== 'invalid' && !hasCookieAttempt()) {
      cookieStatus = { state: 'absent', validCount: 0, totalLines: 0, reason: '' };
    }
    if (!cookieLogged && cookieStatus.state === 'invalid') {
      cookieLogged = true;
      console.warn(`[youtube] cookie env diabaikan, format rusak (${cookieStatus.reason}). Pastikan cookies.txt Netscape disalin lengkap dengan newline.`);
    }
    return '';
  }
  const key = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
  if (cachedCookiesFile && cachedCookiesKey === key && existsSync(cachedCookiesFile)) return cachedCookiesFile;
  const dir = path.join(os.tmpdir(), 'audio-studio-cookies');
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `youtube-${key}.txt`);
  writeFileSync(filePath, text, { mode: 0o600 });
  cachedCookiesKey = key;
  cachedCookiesFile = filePath;
  if (!cookieLogged) {
    cookieLogged = true;
    console.log(`[youtube] cookies.txt siap (${cookieStatus.validCount} entri valid).`);
  }
  return filePath;
}

function hasCookieSupport() {
  return Boolean(resolveGeneratedCookiesFile());
}

function botCheckMessage() {
  if (cookieStatus.state === 'invalid') {
    return `Cookie YouTube terbaca tapi formatnya rusak (${cookieStatus.reason}). Salin ulang cookies.txt Netscape dari extension "Get cookies.txt LOCALLY" lengkap dengan newline antar baris, lalu restart Space.`;
  }
  return 'YouTube menolak request dari hosting ini karena bot-check. Tambahkan cookie YouTube ke secret YTDLP_COOKIES_TEXT/YTDLP_COOKIES_BASE64/YTDLP_COOKIES_FILE di backend, lalu restart Space. Atau upload file audio langsung.';
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
  const preferLocal = envEnabled('YTDLP_PREFER_LOCAL', isWindows || envEnabled('YTDLP_FORCE_UPDATE', false));
  const systemCandidates = [isWindows ? 'yt-dlp.exe' : 'yt-dlp', 'yt-dlp'];
  const candidates = [
    envPath,
    ...(preferLocal ? [localYtDlp, ...systemCandidates] : [...systemCandidates, localYtDlp])
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

export async function getYoutubeRuntimeStatus() {
  const status = inspectCookies();
  let ytdlp = { available: false, path: '', version: '', error: '' };
  try {
    const binary = await resolveYtDlpPath();
    if (binary) {
      const version = cleanErrorText(await execFileAsync(binary, ['--version'], 8000));
      ytdlp = { available: true, path: binary.includes(path.sep) ? path.basename(binary) : binary, version, error: '' };
    } else {
      ytdlp = { available: false, path: '', version: '', error: 'yt-dlp tidak ditemukan.' };
    }
  } catch (error) {
    ytdlp = { available: false, path: '', version: '', error: cleanErrorText(error.message) };
  }
  return {
    ytdlp,
    cookies: {
      state: status.state,
      validCount: status.validCount,
      totalLines: status.totalLines,
      reason: status.reason,
      envSet: status.envSet,
      hasFile: Boolean(status.file)
    },
    ffmpeg: Boolean(ffmpegPath),
    downloadOrder: orderedStrategies({ sectionEnd: 45 }).slice(0, 20),
    forceUpdate: envEnabled('YTDLP_FORCE_UPDATE', false),
    preferLocal: envEnabled('YTDLP_PREFER_LOCAL', isWindows || envEnabled('YTDLP_FORCE_UPDATE', false))
  };
}

function jsRuntimeArgs() {
  if (String(process.env.YTDLP_DISABLE_JS_RUNTIME || '').toLowerCase() === 'true') {
    return [];
  }

  const configured = String(process.env.YTDLP_JS_RUNTIMES || process.env.YTDLP_JS_RUNTIME || '').trim();
  const runtimes = configured
    ? configured.split(',').map((item) => item.trim()).filter(Boolean)
    : (process.execPath ? [`node:${process.execPath}`] : ['node']);

  return runtimes.flatMap((runtime) => ['--js-runtimes', runtime]);
}

function ytDlpCommonArgs(options = {}) {
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', String(process.env.YTDLP_SOCKET_TIMEOUT || 15),
    '--retries', String(process.env.YTDLP_RETRIES || 2),
    '--fragment-retries', String(process.env.YTDLP_FRAGMENT_RETRIES || process.env.YTDLP_RETRIES || 2),
    '--extractor-retries', String(process.env.YTDLP_EXTRACTOR_RETRIES || 4),
    '--retry-sleep', String(process.env.YTDLP_RETRY_SLEEP || 'extractor:linear=1::4'),
    '--concurrent-fragments', String(process.env.YTDLP_CONCURRENT_FRAGMENTS || 1),
    ...jsRuntimeArgs()
  ];
  const cookiesFile = resolveGeneratedCookiesFile();
  const proxy = String(process.env.YOUTUBE_PROXY || '').trim();
  const extractorArgs = buildExtractorArgs(options);
  const impersonate = String(process.env.YTDLP_IMPERSONATE || '').trim();
  const httpChunkSize = String(process.env.YTDLP_HTTP_CHUNK_SIZE || '').trim();
  const sleepRequests = String(process.env.YTDLP_SLEEP_REQUESTS || '').trim();

  if (cookiesFile) args.push('--cookies', cookiesFile);
  if (proxy) args.push('--proxy', proxy);
  if (envEnabled('YTDLP_FORCE_IPV4', true)) args.push('--force-ipv4');
  if (envEnabled('YTDLP_LEGACY_SERVER_CONNECT', false)) args.push('--legacy-server-connect');
  if (envEnabled('YTDLP_NO_CHECK_CERTIFICATES', false)) args.push('--no-check-certificates');
  if (impersonate) args.push('--impersonate', impersonate);
  if (httpChunkSize) args.push('--http-chunk-size', httpChunkSize);
  if (sleepRequests) args.push('--sleep-requests', sleepRequests);
  if (extractorArgs) args.push('--extractor-args', extractorArgs);
  return args;
}

function buildExtractorArgs(options = {}) {
  const parts = [];
  const playerClient = options.playerClient
    || process.env.YOUTUBE_PLAYER_CLIENT
    || process.env.YTDLP_PLAYER_CLIENT
    || '';
  const playerClientArg = options.extractorArgs
    || process.env.YTDLP_EXTRACTOR_ARGS
    || `youtube:player_client=${playerClient || 'mweb,tv_embedded,web'}`;
  if (playerClientArg) parts.push(playerClientArg);

  const visitorData = String(process.env.YOUTUBE_VISITOR_DATA || '').trim();
  const poToken = String(process.env.YOUTUBE_PO_TOKEN || process.env.YTDLP_PO_TOKEN || '').trim();
  const dataSyncId = String(process.env.YOUTUBE_DATA_SYNC_ID || '').trim();
  const playerSkip = String(process.env.YOUTUBE_PLAYER_SKIP || '').trim();
  const extraYoutubeArgs = [];

  if (visitorData) extraYoutubeArgs.push(`visitor_data=${visitorData}`);
  if (poToken) extraYoutubeArgs.push(`po_token=${poToken}`);
  if (dataSyncId) extraYoutubeArgs.push(`data_sync_id=${dataSyncId}`);
  if (playerSkip) extraYoutubeArgs.push(`player_skip=${playerSkip}`);
  if (extraYoutubeArgs.length) parts.push(`youtube:${extraYoutubeArgs.join(';')}`);
  return parts.join(' ');
}

async function runYtDlp(args, timeoutMs = 25000) {
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

async function removeDownloadedFiles(uploadsDir, prefix) {
  const files = await fs.readdir(uploadsDir).catch(() => []);
  await Promise.all(files
    .filter((file) => file.startsWith(prefix))
    .map((file) => fs.unlink(path.join(uploadsDir, file)).catch(() => {})));
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

function inferAudioContainerFromUrl(url) {
  try {
    const parsed = new URL(url);
    const mime = decodeURIComponent(parsed.searchParams.get('mime') || '').toLowerCase();
    if (mime.includes('webm')) return 'webm';
    if (mime.includes('mp4')) return 'm4a';
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  } catch {
    // Use safe default below.
  }
  return 'm4a';
}

async function getDirectMediaUrl(url, options = {}) {
  const output = await runYtDlp([
    ...ytDlpCommonArgs(options),
    '--format', 'bestaudio[ext=m4a]/bestaudio/best[height<=360]/best',
    '--get-url',
    url
  ], Number(process.env.YTDLP_GET_URL_TIMEOUT_MS || 45000));
  const directUrl = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^https?:\/\//i.test(line));
  if (!directUrl) throw httpError('yt-dlp tidak mengembalikan direct media URL.', 422);
  return directUrl;
}

async function downloadDirectMediaSection(url, uploadsDir, options = {}) {
  const directUrl = await getDirectMediaUrl(url, options);
  const sectionEnd = Math.max(30, Math.ceil(Number(options.sectionEnd || 0)));
  const ext = inferAudioContainerFromUrl(directUrl);
  const outputPath = path.join(uploadsDir, `youtube-${nanoid(10)}-section.${ext}`);
  const timeoutMs = Number(process.env.YOUTUBE_DIRECT_SECTION_TIMEOUT_MS || process.env.YTDLP_SECTION_TIMEOUT_MS || 120000);
  const args = [
    '-nostdin',
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-user_agent', USER_AGENT,
    '-t', String(sectionEnd),
    '-i', directUrl,
    '-vn',
    '-map', '0:a:0',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath
  ];
  if (!ffmpegPath) throw httpError('FFmpeg tidak tersedia untuk direct-section YouTube.', 503);
  try {
    await execFileAsync(ffmpegPath, args, timeoutMs);
    const stat = await fs.stat(outputPath).catch(() => null);
    if (!stat?.size) throw httpError('Direct-section menghasilkan file kosong.', 422);
    return outputPath;
  } catch (error) {
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  }
}

async function downloadDirectMedia(url, uploadsDir, options = {}) {
  const directUrl = await getDirectMediaUrl(url, options);
  const response = await fetch(directUrl, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(Number(process.env.YOUTUBE_DIRECT_DOWNLOAD_TIMEOUT_MS || 90000))
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

function sectionArgs(options = {}) {
  const sectionEnd = Number(options.sectionEnd || 0);
  if (!sectionEnd || sectionEnd < 30 || String(process.env.YTDLP_ENABLE_SECTIONS || 'true').toLowerCase() === 'false') {
    return [];
  }
  const args = [
    '--download-sections', `*0-${Math.ceil(sectionEnd)}`,
    '--force-keyframes-at-cuts'
  ];
  if (ffmpegPath) args.push('--ffmpeg-location', path.dirname(ffmpegPath));
  return args;
}

async function downloadWithYtDlp(url, uploadsDir, options = {}) {
  const id = nanoid(10);
  const outputPrefix = `youtube-${id}.`;
  const outputTemplate = path.join(uploadsDir, `${outputPrefix}%(ext)s`);
  try {
    await runYtDlp([
      ...ytDlpCommonArgs(options),
      ...sectionArgs(options),
      '--format', 'bestaudio[ext=m4a]/bestaudio/best',
      '--output', outputTemplate,
      url
    ], Number(options.sectionEnd
      ? (process.env.YTDLP_SECTION_TIMEOUT_MS || 45000)
      : (process.env.YTDLP_DOWNLOAD_TIMEOUT_MS || 90000)));
  } catch (error) {
    await removeDownloadedFiles(uploadsDir, outputPrefix);
    throw error;
  }
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
    return await downloadStream(stream, outputPath, Number(process.env.YTDL_CORE_DOWNLOAD_TIMEOUT_MS || 60000));
  } catch (error) {
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  }
}

function orderedStrategies(options = {}) {
  const configured = String(process.env.YOUTUBE_DOWNLOAD_ORDER || '').trim();
  const base = configured
    ? configured.split(',').map((item) => item.trim()).filter(Boolean)
    : ['direct-section', 'direct-url', 'ytdl-core', 'yt-dlp'];
  const strategies = [];
  const add = (strategy) => {
    if (strategy && !strategies.includes(strategy)) strategies.push(strategy);
  };
  if (options.sectionEnd) add('direct-section');
  add('direct-url');
  for (const strategy of base) add(strategy);
  if (options.sectionEnd && !strategies.includes('yt-dlp-section')) add('yt-dlp-section');

  if (String(process.env.YTDLP_ALT_CLIENT_FALLBACKS || 'true').toLowerCase() !== 'false') {
    const insertAfter = (needle, extra) => {
      if (strategies.includes(extra)) return;
      const index = strategies.indexOf(needle);
      if (index >= 0) strategies.splice(index + 1, 0, extra);
    };
    // Tambah beberapa client publik. Ini bukan jaminan melewati bot-check,
    // tapi sering cukup untuk video yang gagal di satu client extractor.
    insertAfter('direct-section', 'direct-section-default');
    insertAfter('direct-section-default', 'direct-section-tv');
    insertAfter('direct-section-tv', 'direct-section-mweb');
    insertAfter('direct-section-mweb', 'direct-section-ios');
    insertAfter('direct-section-ios', 'direct-section-web-embedded');
    insertAfter('direct-url', 'direct-url-default');
    insertAfter('direct-url-default', 'direct-url-tv');
    insertAfter('direct-url-tv', 'direct-url-mweb');
    insertAfter('direct-url-mweb', 'direct-url-ios');
    insertAfter('direct-url-ios', 'direct-url-web-embedded');
    insertAfter('yt-dlp-section', 'yt-dlp-section-default');
    insertAfter('yt-dlp-section-default', 'yt-dlp-section-tv');
    insertAfter('yt-dlp-section-tv', 'yt-dlp-section-mweb');
    insertAfter('yt-dlp-section-mweb', 'yt-dlp-section-ios');
    insertAfter('yt-dlp', 'yt-dlp-default');
    insertAfter('yt-dlp-default', 'yt-dlp-tv');
    insertAfter('yt-dlp-tv', 'yt-dlp-mweb');
    insertAfter('yt-dlp-mweb', 'yt-dlp-ios');
    insertAfter('yt-dlp-ios', 'yt-dlp-web-embedded');
  }

  return strategies;
}

function strategyOptions(strategy, options = {}) {
  const next = { ...options };
  if (strategy.endsWith('-default')) {
    next.extractorArgs = 'youtube:player_client=default';
  } else if (strategy.endsWith('-tv')) {
    next.extractorArgs = 'youtube:player_client=tv_embedded,web';
  } else if (strategy.endsWith('-mweb')) {
    next.extractorArgs = 'youtube:player_client=mweb';
  } else if (strategy.endsWith('-ios')) {
    next.extractorArgs = 'youtube:player_client=ios';
  } else if (strategy.endsWith('-web-embedded')) {
    next.extractorArgs = 'youtube:player_client=web_embedded';
  }
  return next;
}

export async function downloadYoutubeAudio(input, uploadsDir, options = {}) {
  const { url } = normalizeYoutubeUrl(input);
  const failures = [];

  for (const strategy of orderedStrategies(options)) {
    try {
      if (strategy.startsWith('direct-section')) {
        const outputPath = await downloadDirectMediaSection(url, uploadsDir, strategyOptions(strategy, options));
        return { path: outputPath, method: strategy, failures, sectionEnd: options.sectionEnd || 0 };
      }
      if (strategy.startsWith('yt-dlp-section')) {
        const outputPath = await downloadWithYtDlp(url, uploadsDir, strategyOptions(strategy, options));
        return { path: outputPath, method: strategy, failures, sectionEnd: options.sectionEnd || 0 };
      }
      if (strategy === 'yt-dlp' || strategy === 'yt-dlp-default' || strategy === 'yt-dlp-tv' || strategy === 'yt-dlp-mweb' || strategy === 'yt-dlp-ios') {
        const outputPath = await downloadWithYtDlp(url, uploadsDir, strategyOptions(strategy));
        return { path: outputPath, method: strategy, failures };
      }
      if (strategy.startsWith('direct-url')) {
        const outputPath = await downloadDirectMedia(url, uploadsDir, strategyOptions(strategy));
        return { path: outputPath, method: strategy, failures };
      }
      if (strategy === 'ytdl-core') {
        const outputPath = await downloadWithYtdl(url, uploadsDir);
        return { path: outputPath, method: 'ytdl-core', failures };
      }
    } catch (error) {
      failures.push(`${strategy}: ${cleanErrorText(error.message)}`);
      // Jangan berhenti di bot-check/timeout pertama. Client extractor lain
      // atau direct media URL masih bisa berhasil untuk video yang sama.
      if (isBotCheckError(error) && !hasCookieSupport()) continue;
      if (isTimeoutError(error) && strategy.startsWith('yt-dlp')) continue;
    }
  }

  let finalMessage;
  if (cookieStatus.state === 'invalid') {
    finalMessage = `Cookie YouTube terbaca tapi formatnya rusak (${cookieStatus.reason}). Salin ulang cookies.txt Netscape lengkap dengan newline antar baris, lalu restart Space.`;
  } else if (cookieStatus.state === 'ok') {
    finalMessage = failures.some((item) => isNetworkTlsErrorText(item))
      ? 'Download YouTube gagal walau cookie sudah dikonfigurasi. Ada error SSL/TLS dari jaringan hosting ke YouTube; backend sudah paksa IPv4 dan retry, jadi langkah berikutnya adalah pakai YOUTUBE_PROXY atau deploy di provider/IP lain.'
      : 'Download YouTube gagal walau cookie sudah dikonfigurasi. Cookie bisa sudah rotated/kurang lengkap, atau YouTube meminta PO Token. Coba export cookie ulang dari incognito, atau isi YOUTUBE_PO_TOKEN dan YOUTUBE_VISITOR_DATA.';
  } else if (failures.some((item) => item.toLowerCase().includes('timeout'))) {
    finalMessage = 'Download YouTube timeout di semua fallback. Backend sudah mencoba mode potongan dan beberapa client extractor; coba kecilkan Max Duration, isi cookie YouTube, atau pakai proxy hosting yang tidak dibatasi YouTube.';
  } else {
    finalMessage = 'Download YouTube gagal. Backend sudah mencoba beberapa fallback public. Jika hosting terkena bot-check YouTube, isi YTDLP_COOKIES_TEXT/YTDLP_COOKIES_BASE64/YTDLP_COOKIES_FILE, atau set YOUTUBE_PROXY lalu restart backend.';
  }
  const error = httpError(finalMessage, 422);
  error.details = failures;
  error.cookieStatus = cookieStatus;
  throw error;
}
