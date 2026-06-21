import express from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { processAudio, splitAudioIfNeeded, probeAudio } from '../services/ffmpeg.service.js';
import { uploadAudioParts, checkAssetStatus } from '../services/roblox.service.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { createTaskQueue } from '../services/taskQueue.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveUploadsDir() {
  const candidates = [];
  if (process.env.UPLOADS_DIR) candidates.push(process.env.UPLOADS_DIR);
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
const robloxAudioMaxBytes = Number(process.env.ROBLOX_AUDIO_MAX_BYTES || 19 * 1024 * 1024);
const appMaxDurationSeconds = Math.min(Math.max(Number(process.env.APP_MAX_DURATION_SECONDS || 200), 30), 14400);

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
  max: Number(process.env.PROCESS_RATE_LIMIT || 30),
  message: 'Limit konversi sementara tercapai. Coba lagi beberapa menit.'
});
const infoLimit = rateLimit({
  windowMs: 1000 * 60,
  max: Number(process.env.INFO_RATE_LIMIT || 60),
  message: 'Terlalu sering request. Tunggu sebentar.'
});

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/flac'].includes(file.mimetype)
      || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.originalname);
    cb(ok ? null : new Error('Format file harus .mp3, .wav, .ogg, .m4a, .aac, atau .flac'), ok);
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
  const maxDurationLimit = Math.min(cleanNumber(parsed.maxDurationLimit ?? appMaxDurationSeconds, appMaxDurationSeconds, 30, 14400), appMaxDurationSeconds);
  return {
    speed: cleanNumber(parsed.speed ?? 2.3, 2.3, 0.5, 3),
    amplify: cleanNumber(parsed.amplify ?? -4, -4, -20, 20),
    maxDuration: cleanNumber(parsed.maxDuration ?? appMaxDurationSeconds, appMaxDurationSeconds, 30, maxDurationLimit),
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

function resolveApiKey(body = {}) {
  return String(body.apiKey || '').trim();
}

// POST /api/process — terima file audio + setting efek, kembalikan audio .ogg yang sudah diproses.
router.post('/process', processLimit, upload.single('audio'), async (req, res, next) => {
  try {
    const responseBody = await conversionQueue.push(async () => {
      if (!req.file?.path) {
        const error = new Error('Upload file audio (.mp3, .wav, .ogg, .m4a, .aac, .flac) dulu.');
        error.status = 400;
        throw error;
      }
      const settings = parseSettings(req.body.settings);
      const requestedMaxDuration = settings.maxDuration;
      const title = String(req.body.title || req.file.originalname || 'Audio Studio').trim().slice(0, 180);
      const warnings = [];

      let sourceDuration = 0;
      let sourceProbe = null;
      try {
        sourceProbe = await probeAudio(req.file.path);
        sourceDuration = Number(sourceProbe.format?.duration || 0) || 0;
      } catch (error) {
        warnings.push(`Durasi sumber tidak terbaca sempurna: ${error.message}`);
      }

      settings.maxDurationLimit = appMaxDurationSeconds;
      settings.maxDuration = Math.max(30, Math.ceil(Math.min(requestedMaxDuration || appMaxDurationSeconds, appMaxDurationSeconds)));

      const outputName = `processed-${nanoid(10)}.ogg`;
      const outputPath = path.join(uploadsDir, outputName);
      const result = await processAudio({ inputPath: req.file.path, outputPath, settings, sourceDuration });
      warnings.push(...(result.warnings || []));

      const shouldInlineAudio = result.sizeBytes <= inlineAudioLimitBytes;
      const audioBuffer = shouldInlineAudio ? await fs.readFile(outputPath) : null;

      return {
        fileName: outputName,
        audioUrl: `/api/files/${outputName}`,
        audioDataUrl: audioBuffer ? `data:audio/ogg;base64,${audioBuffer.toString('base64')}` : '',
        duration: result.duration,
        sizeBytes: result.sizeBytes,
        title,
        sourceDuration,
        sourceDurationText: sourceDuration ? formatSeconds(sourceDuration) : '',
        outputDurationText: formatSeconds(result.duration),
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
            step: 'Upload',
            status: 'Accepted',
            message: sourceDuration ? `File terbaca ${formatSeconds(sourceDuration)}.` : 'File terbaca.'
          },
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
        queue: conversionQueue.stats()
      };
    });
    res.json(responseBody);
  } catch (error) {
    next(error);
  } finally {
    await removeQuiet(req.file?.path);
  }
});

// POST /api/roblox-test — cek validitas API key Roblox dan target creator.
router.post('/roblox-test', infoLimit, async (req, res, next) => {
  try {
    const { creator } = req.body || {};
    const apiKey = resolveApiKey(req.body || {});
    if (!apiKey) return res.status(400).json({ error: 'API key Roblox wajib diisi dulu di Pengaturan.' });
    const target = resolveRobloxCreator(creator, false);
    const trace = [{
      step: 'Target',
      status: target.creator ? 'Accepted' : 'Pending',
      message: target.creator ? `Mode ${target.mode} siap dicek.` : target.warnings[0]
    }];
    const axios = (await import('axios')).default;
    try {
      trace.push({ step: 'Open Cloud', status: 'Pending', message: 'Menghubungi Roblox Assets API dengan API key ini.' });
      const response = await axios.get('https://apis.roblox.com/assets/v1/operations/dummy-op', {
        headers: { 'x-api-key': apiKey },
        timeout: 8000,
        validateStatus: () => true
      });
      if (response.status === 401 || response.status === 403) {
        trace.push({ step: 'Open Cloud', status: 'Failed', message: 'API key ditolak Roblox. Cek key dan permission Assets API.' });
        return res.json({ ok: false, status: response.status, error: 'API key tidak valid atau tidak punya permission Assets.', trace });
      }
      if (response.status >= 500) {
        trace.push({ step: 'Open Cloud', status: 'Failed', message: 'Roblox API sedang bermasalah.' });
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

// POST /api/asset-status — cek status moderasi operationId Roblox.
router.post('/asset-status', infoLimit, async (req, res, next) => {
  try {
    const { operationId } = req.body || {};
    if (!operationId) return res.status(400).json({ error: 'operationId wajib.' });
    const apiKey = resolveApiKey(req.body || {});
    if (!apiKey) return res.status(400).json({ error: 'API key Roblox tidak tersedia. Isi dulu di Pengaturan.' });
    const result = await checkAssetStatus(operationId, apiKey);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/upload-roblox — terima audio hasil proses + API key (sekali pakai), upload ke Roblox.
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
      const apiKey = resolveApiKey(payload);
      if (!apiKey) {
        const error = new Error('API key Roblox wajib diisi dulu di Pengaturan.');
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
          limits: { maxDuration: robloxAudioMaxDuration, maxBytes: robloxAudioMaxBytes },
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
