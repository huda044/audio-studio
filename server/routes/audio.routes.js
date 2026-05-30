import express from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { processAudio, splitAudioIfNeeded } from '../services/ffmpeg.service.js';
import { uploadAudioParts, checkAssetStatus } from '../services/roblox.service.js';
import { downloadYoutubeAudio, getYoutubeInfo, getYoutubeRuntimeStatus, inspectCookies, normalizeYoutubeUrl } from '../services/youtube.service.js';
import { downloadSoundCloudAudio, getSoundCloudInfo, isSoundCloudUrl, normalizeSoundCloudUrl } from '../services/soundcloud.service.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { assertConversionAllowed, recordConversion, verifyToken, getServerApiKeyForUser } from '../services/account.service.js';
import { encryptSecret, isCryptoConfigured } from '../services/crypto.service.js';
import { probeAudio } from '../services/ffmpeg.service.js';
import { createTaskQueue } from '../services/taskQueue.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveUploadsDir() {
  const candidates = [];
  if (process.env.UPLOADS_DIR) candidates.push(process.env.UPLOADS_DIR);
  if (process.env.VERCEL) candidates.push(path.join(os.tmpdir(), 'audio-studio-uploads'));
  candidates.push(path.resolve(__dirname, '..', '..', 'uploads'));
  candidates.push(path.join(os.tmpdir(), 'audio-studio-uploads'));
  for (const dir of candidates) {
    try {
      fsSync.mkdirSync(dir, { recursive: true });
      fsSync.accessSync(dir, fsSync.constants.W_OK);
      return dir;
    } catch {
      // try next
    }
  }
  return path.join(os.tmpdir(), 'audio-studio-uploads');
}

const uploadsDir = resolveUploadsDir();

const router = express.Router();
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 250);
const inlineAudioLimitBytes = Number(process.env.INLINE_AUDIO_LIMIT_MB || 8) * 1024 * 1024;
const robloxAudioMaxDuration = Number(process.env.ROBLOX_AUDIO_MAX_DURATION_SECONDS || 420);
const robloxAudioMaxBytes = Number(process.env.ROBLOX_AUDIO_MAX_BYTES || (19 * 1024 * 1024));
const conversionQueue = createTaskQueue({
  name: 'conversion',
  concurrency: Math.max(1, Number(process.env.CONVERSION_CONCURRENCY || 2)),
  maxQueue: Math.max(1, Number(process.env.CONVERSION_QUEUE_LIMIT || 20))
});
const robloxQueue = createTaskQueue({
  name: 'roblox-upload',
  concurrency: Math.max(1, Number(process.env.ROBLOX_UPLOAD_CONCURRENCY || 1)),
  maxQueue: Math.max(1, Number(process.env.ROBLOX_UPLOAD_QUEUE_LIMIT || 15))
});
const processLimit = rateLimit({
  windowMs: 1000 * 60 * 30,
  max: Number(process.env.PROCESS_RATE_LIMIT || 12),
  message: 'Limit konversi sementara tercapai. Coba lagi beberapa menit.'
});
const infoLimit = rateLimit({
  windowMs: 1000 * 60,
  max: Number(process.env.INFO_RATE_LIMIT || 45),
  message: 'Preview YouTube terlalu sering. Tunggu sebentar.'
});

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-wav'].includes(file.mimetype)
      || /\.(mp3|wav|ogg)$/i.test(file.originalname);
    cb(ok ? null : new Error('Format file harus .mp3, .wav, atau .ogg'), ok);
  }
});

function cleanNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function parseSettings(raw = '{}') {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
  } catch {
    const error = new Error('Pengaturan audio tidak valid.');
    error.status = 400;
    throw error;
  }
  parsed = parsed && typeof parsed === 'object' ? parsed : {};
  const maxDurationLimit = cleanNumber(parsed.maxDurationLimit ?? 14400, 14400, 30, 14400);
  return {
    speed: cleanNumber(parsed.speed ?? 2.3, 2.3, 0.5, 3),
    amplify: cleanNumber(parsed.amplify ?? -4, -4, -20, 20),
    maxDuration: cleanNumber(parsed.maxDuration ?? 400, 400, 30, maxDurationLimit),
    maxDurationLimit,
    pitch: cleanNumber(parsed.pitch ?? 0, 0, -12, 12),
    bassBoost: Boolean(parsed.bassBoost),
    reverb: Boolean(parsed.reverb),
    normalize: Boolean(parsed.normalize),
    echo: Boolean(parsed.echo),
    fadeIn: cleanNumber(parsed.fadeIn ?? 0, 0, 0, 30),
    fadeOut: cleanNumber(parsed.fadeOut ?? 0, 0, 0, 30),
    trimStart: cleanNumber(parsed.trimStart ?? 0, 0, 0, 14400),
    trimEnd: cleanNumber(parsed.trimEnd ?? 0, 0, 0, 14400),
    eqPreset: typeof parsed.eqPreset === 'string' ? parsed.eqPreset : ''
  };
}

async function removeQuiet(filePath) {
  if (filePath) await fs.unlink(filePath).catch(() => {});
}

function readAuth(req) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    return token ? verifyToken(token) : null;
  } catch {
    return null;
  }
}

function formatSeconds(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const sec = total % 60;
  return `${minutes}:${String(sec).padStart(2, '0')}`;
}

function parsePayload(raw, label = 'payload') {
  try {
    return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
  } catch {
    const error = new Error(`${label} tidak valid.`);
    error.status = 400;
    throw error;
  }
}

function cleanNumericId(value) {
  const text = String(value || '').trim();
  return /^\d{2,32}$/.test(text) ? text : '';
}

function resolveRobloxCreator(creator = {}, required = true) {
  const groupId = cleanNumericId(creator.groupId);
  const userId = cleanNumericId(creator.userId);
  if (groupId) return { creator: { groupId }, mode: 'group', warnings: [] };
  if (userId) return { creator: { userId }, mode: 'personal', warnings: [] };
  const message = 'Isi Roblox User ID untuk Personal atau Group ID untuk Group sebelum upload.';
  if (required) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  return { creator: null, mode: 'unknown', warnings: [message] };
}

function computeYoutubeSectionEnd(settings = {}, sourceDuration = 0) {
  if (String(process.env.YTDLP_ENABLE_SECTIONS || 'true').toLowerCase() === 'false') return 0;
  const speed = Math.min(Math.max(Number(settings.speed || 1), 0.5), 3);
  const maxDuration = Math.min(Math.max(Number(settings.maxDuration || 400), 30), Number(settings.maxDurationLimit || 14400));
  const trimStart = Math.max(0, Number(settings.trimStart || 0));
  const trimEnd = Math.max(0, Number(settings.trimEnd || 0));
  const neededInput = Math.ceil(maxDuration * speed + 12);
  let end = trimEnd > trimStart ? trimEnd : trimStart + neededInput;
  if (sourceDuration) end = Math.min(end, Math.ceil(sourceDuration));
  return end >= 30 ? end : 0;
}

router.get('/security-status', infoLimit, (_req, res) => {
  res.json({
    cryptoConfigured: isCryptoConfigured(),
    cipher: 'aes-256-gcm',
    notice: isCryptoConfigured()
      ? 'API key Roblox disimpan terenkripsi AES-256-GCM di server.'
      : 'SECRETS_MASTER_KEY belum di-set di server. Generate 32-byte random base64 dan tambahkan ke env.'
  });
});

router.get('/youtube-cookies-status', infoLimit, async (_req, res, next) => {
  try {
    const status = inspectCookies();
    // Jangan bocorkan path file di luar dev.
    const safe = {
      state: status.state,
      validCount: status.validCount,
      totalLines: status.totalLines,
      reason: status.reason,
      envSet: status.envSet,
      hasFile: Boolean(status.file)
    };
    res.json(safe);
  } catch (error) {
    next(error);
  }
});

router.get('/youtube-runtime-status', infoLimit, async (_req, res, next) => {
  try {
    res.json(await getYoutubeRuntimeStatus());
  } catch (error) {
    next(error);
  }
});

router.get('/youtube-info', infoLimit, async (req, res, next) => {
  try {
    if (!req.query.url) return res.status(400).json({ error: 'URL YouTube wajib diisi.' });
    const info = await getYoutubeInfo(String(req.query.url));
    res.json(info);
  } catch (error) {
    next(error);
  }
});

router.get('/soundcloud-info', infoLimit, async (req, res, next) => {
  try {
    if (!req.query.url) return res.status(400).json({ error: 'URL SoundCloud wajib diisi.' });
    const info = await getSoundCloudInfo(String(req.query.url));
    res.json(info);
  } catch (error) {
    next(error);
  }
});

// Helper: detect source type dari URL atau alias 'youtubeUrl' / 'sourceUrl'.
function detectSourceUrl(body) {
  const candidates = [body?.sourceUrl, body?.youtubeUrl, body?.soundcloudUrl];
  for (const raw of candidates) {
    const url = String(raw || '').trim();
    if (!url) continue;
    if (isSoundCloudUrl(url)) return { kind: 'soundcloud', url: normalizeSoundCloudUrl(url) };
    try {
      const { url: ytUrl } = normalizeYoutubeUrl(url);
      return { kind: 'youtube', url: ytUrl };
    } catch {
      // Bukan YouTube; biarkan loop kepikir kandidat berikutnya
    }
  }
  return { kind: '', url: '' };
}

router.post('/process', processLimit, upload.single('audio'), async (req, res, next) => {
  let sourcePath = req.file?.path;
  let downloadedPath = '';
  try {
    const responseBody = await conversionQueue.push(async () => {
      const auth = readAuth(req);
      if (!auth) {
        const error = new Error('Login dibutuhkan untuk konversi audio.');
        error.status = 401;
        throw error;
      }
      const settings = parseSettings(req.body.settings);
      const requestedMaxDuration = settings.maxDuration;
      const source = detectSourceUrl(req.body || {});
      const sourceUrl = source.url;
      const sourceKind = source.kind;
      const warnings = [];
      const downloadTrace = [];
      let meta = sourceUrl
        ? (sourceKind === 'soundcloud' ? await getSoundCloudInfo(sourceUrl) : await getYoutubeInfo(sourceUrl))
        : {
          title: req.file?.originalname || 'Audio Studio',
          thumbnail: '',
          durationSource: req.file ? 'upload' : 'unknown'
        };

      if (!sourcePath && sourceUrl) {
        const sectionEnd = computeYoutubeSectionEnd(settings, Number(meta.duration || 0));
        const download = sourceKind === 'soundcloud'
          ? await downloadSoundCloudAudio(sourceUrl, uploadsDir, { sectionEnd })
          : await downloadYoutubeAudio(sourceUrl, uploadsDir, { sectionEnd });
        sourcePath = typeof download === 'string' ? download : download.path;
        downloadedPath = sourcePath;
        const sourceLabel = sourceKind === 'soundcloud' ? 'SoundCloud' : 'YouTube';
        if (download?.method) {
          downloadTrace.push({
            step: 'Download',
            status: 'Accepted',
            message: `${sourceLabel} berhasil diambil lewat ${download.method}${download.sectionEnd ? ` sampai ${formatSeconds(download.sectionEnd)}` : ''}.`
          });
        }
        if (download?.failures?.length) {
          warnings.push(`Fallback download dipakai: ${download.failures.map((item) => item.split(':')[0]).join(', ')} gagal dulu.`);
        }
      }

      if (!sourcePath) {
        const error = new Error('Upload file audio atau masukkan URL YouTube/SoundCloud.');
        error.status = 400;
        throw error;
      }

      let sourceDuration = 0;
      let sourceProbe = null;
      try {
        if (sourceUrl && meta.duration) sourceDuration = Number(meta.duration) || 0;
        sourceProbe = await probeAudio(sourcePath);
        const probedDuration = Number(sourceProbe.format.duration || 0);
        if (probedDuration) sourceDuration = probedDuration;
      } catch (error) {
        warnings.push(`Durasi sumber tidak terbaca sempurna: ${error.message}`);
        sourceDuration = 0;
      }
      if (sourceDuration && sourceUrl && (!meta.duration || meta.durationSource !== 'ffprobe')) {
        meta = { ...meta, duration: sourceDuration, durationSource: 'ffprobe' };
      }
      const account = await assertConversionAllowed(auth.sub, sourceDuration);
      if (account.plan.plan === 'paid') {
        settings.maxDurationLimit = 14400;
        settings.maxDuration = Math.max(30, Math.ceil(Math.min(requestedMaxDuration || 400, settings.maxDurationLimit)));
      } else {
        settings.maxDurationLimit = 600;
        settings.maxDuration = Math.min(requestedMaxDuration || settings.maxDuration, 600);
      }

      const outputName = `processed-${nanoid(10)}.ogg`;
      const outputPath = path.join(uploadsDir, outputName);
      const result = await processAudio({ inputPath: sourcePath, outputPath, settings, sourceDuration });
      warnings.push(...(result.warnings || []));
      const shouldInlineAudio = result.sizeBytes <= inlineAudioLimitBytes;
      const audioBuffer = shouldInlineAudio ? await fs.readFile(outputPath) : null;

      const user = await recordConversion(auth.sub, {
        source: sourceKind || (sourceUrl ? 'url' : 'upload'),
        duration: result.duration,
        title: meta.title
      });
      return {
        fileName: outputName,
        audioUrl: `/api/files/${outputName}`,
        audioDataUrl: audioBuffer ? `data:audio/ogg;base64,${audioBuffer.toString('base64')}` : '',
        duration: result.duration,
        sizeBytes: result.sizeBytes,
        title: meta.title,
        thumbnail: meta.thumbnail,
        sourceDuration,
        sourceDurationText: sourceDuration ? formatSeconds(sourceDuration) : '',
        outputDurationText: formatSeconds(result.duration),
        durationSource: meta.durationSource || (sourceDuration ? 'ffprobe' : 'unknown'),
        sourceProbe: {
          format: result.source?.format || sourceProbe?.format?.format_name || '',
          codec: result.source?.codec || ''
        },
        appliedSettings: result.appliedSettings,
        appliedEffects: result.effects,
        warnings,
        filterCount: result.filters.length,
        output: {
          format: result.format,
          codec: result.codec,
          bitrate: result.bitrate,
          effectiveDuration: result.effectiveDuration
        },
        conversionTrace: [
          {
            step: sourceKind === 'soundcloud' ? 'SoundCloud' : (sourceKind === 'youtube' ? 'YouTube' : 'Upload'),
            status: 'Accepted',
            message: sourceDuration
              ? `Sumber terbaca ${formatSeconds(sourceDuration)}.`
              : 'Sumber terbaca, tetapi durasi asli tidak tersedia.'
          },
          ...downloadTrace,
          {
            step: 'FFmpeg',
            status: 'Accepted',
            message: `${result.effects.length} efek/filter diterapkan ke output OGG.`
          },
          {
            step: 'Output',
            status: 'Accepted',
            message: `Output ${formatSeconds(result.duration)} (${Math.round(result.sizeBytes / 1024)} KB) siap diputar dan diupload.`
          }
        ],
        source: sourceKind || (sourceUrl ? 'url' : 'upload'),
        queue: conversionQueue.stats(),
        account: user ? { usage: user.usage, subscription: user.subscription } : null
      };
    });
    res.json(responseBody);
  } catch (error) {
    next(error);
  } finally {
    await removeQuiet(req.file?.path);
    await removeQuiet(downloadedPath);
  }
});

async function resolveApiKeyFromRequest(req, body = {}) {
  const auth = readAuth(req);
  // 1) Pakai key tersimpan server berdasarkan keyRef (groupId atau 'personal')
  const keyRef = String(body.keyRef || '').trim();
  if (auth?.sub && keyRef) {
    const groupId = keyRef === 'personal' ? '' : keyRef;
    try {
      const apiKey = await getServerApiKeyForUser(auth.sub, { groupId });
      if (apiKey) return { apiKey, source: 'server-stored' };
    } catch (error) {
      // Bubble up "legacy / decrypt error" supaya UI bisa minta user re-enter
      throw error;
    }
  }
  // 2) Klien lama kirim plaintext apiKey langsung (one-shot, tidak disimpan)
  const plain = String(body.apiKey || '').trim();
  if (plain) return { apiKey: plain, source: 'inline' };
  return { apiKey: '', source: 'absent' };
}

router.post('/asset-status', infoLimit, async (req, res, next) => {
  try {
    const { operationId } = req.body || {};
    if (!operationId) return res.status(400).json({ error: 'operationId wajib.' });
    const { apiKey } = await resolveApiKeyFromRequest(req, req.body || {});
    if (!apiKey) return res.status(400).json({ error: 'API key Roblox tidak tersedia. Login dan simpan key di halaman API Keys.' });
    const result = await checkAssetStatus(operationId, apiKey);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/roblox-test', infoLimit, async (req, res, next) => {
  try {
    const { creator } = req.body || {};
    const { apiKey } = await resolveApiKeyFromRequest(req, req.body || {});
    if (!apiKey) return res.status(400).json({ error: 'API key Roblox wajib diisi atau disimpan dulu di halaman API Keys.' });
    const target = resolveRobloxCreator(creator, false);
    const trace = [{
      step: 'Target',
      status: target.creator ? 'Accepted' : 'Pending',
      message: target.creator
        ? `Mode ${target.mode} siap dicek.`
        : target.warnings[0]
    }];
    const axios = (await import('axios')).default;
    try {
      trace.push({
        step: 'Open Cloud',
        status: 'Pending',
        message: 'Menghubungi Roblox Assets API dengan API key ini.'
      });
      const response = await axios.get('https://apis.roblox.com/assets/v1/operations/dummy-op', {
        headers: { 'x-api-key': apiKey },
        timeout: 8000,
        validateStatus: () => true
      });
      if (response.status === 401 || response.status === 403) {
        trace.push({
          step: 'Open Cloud',
          status: 'Failed',
          message: 'API key ditolak Roblox. Cek key dan permission Assets API.'
        });
        return res.json({ ok: false, status: response.status, error: 'API key tidak valid atau tidak punya permission Assets.', trace });
      }
      if (response.status >= 500) {
        trace.push({
          step: 'Open Cloud',
          status: 'Failed',
          message: 'Roblox API sedang bermasalah.'
        });
        return res.json({ ok: false, status: response.status, error: 'Roblox API sedang bermasalah, coba lagi nanti.', trace });
      }
      trace.push({
        step: 'Open Cloud',
        status: 'Accepted',
        message: response.status === 404
          ? 'API key diterima. Operation dummy tidak ditemukan, artinya koneksi valid.'
          : `Roblox merespons HTTP ${response.status}. Key tidak ditolak.`
      });
      return res.json({
        ok: true,
        status: response.status,
        message: 'Koneksi Roblox Open Cloud valid. Upload final tetap bergantung pada permission creator dan moderasi Roblox.',
        creator: target.creator,
        warnings: target.warnings,
        trace
      });
    } catch (error) {
      trace.push({ step: 'Open Cloud', status: 'Failed', message: error.message });
      return res.json({ ok: false, error: error.message, trace });
    }
  } catch (error) {
    next(error);
  }
});

router.post('/upload-roblox', processLimit, upload.single('audio'), async (req, res, next) => {
  let splitParts = [];
  try {
    const responseBody = await robloxQueue.push(async () => {
      if (!req.file?.path) {
        const error = new Error('File audio hasil proses wajib dikirim.');
        error.status = 400;
        throw error;
      }
      const payload = parsePayload(req.body.payload, 'Payload upload Roblox');
      const { apiKey } = await resolveApiKeyFromRequest(req, payload);
      if (!apiKey) {
        const error = new Error('API key Roblox wajib disimpan dulu di halaman API Keys.');
        error.status = 400;
        throw error;
      }
      const target = resolveRobloxCreator(payload.creator, true);

      const split = await splitAudioIfNeeded({
        inputPath: req.file.path,
        uploadsDir,
        maxDuration: Math.min(Number(payload.splitDuration ?? 180), robloxAudioMaxDuration),
        maxBytes: robloxAudioMaxBytes
      });
      splitParts = split.wasSplit ? split.parts.map((part) => part.path) : [];

      const parts = await uploadAudioParts({
        parts: split.parts,
        apiKey,
        creator: target.creator,
        displayName: payload.displayName || 'Audio Studio',
        description: payload.description || 'Diproses menggunakan Audio Studio'
      });

      const accepted = parts.filter((part) => part.status === 'Accepted').length;
      const failed = parts.filter((part) => part.status === 'Failed').length;
      const pending = parts.filter((part) => part.status === 'Pending').length;
      return {
        parts,
        wasSplit: split.wasSplit,
        uploadSummary: {
          creator: target.creator,
          mode: target.mode,
          partCount: parts.length,
          accepted,
          failed,
          pending,
          split: split.wasSplit,
          limits: {
            maxDuration: robloxAudioMaxDuration,
            maxBytes: robloxAudioMaxBytes
          },
          queue: robloxQueue.stats()
        }
      };
    });
    res.json(responseBody);
  } catch (error) {
    next(error);
  } finally {
    await removeQuiet(req.file?.path);
    await Promise.all(splitParts.map(removeQuiet));
  }
});

export default router;
