import express from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { processAudio, splitAudioIfNeeded } from '../services/ffmpeg.service.js';
import { uploadAudioParts } from '../services/roblox.service.js';
import { downloadYoutubeAudio, getYoutubeInfo } from '../services/youtube.service.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { assertConversionAllowed, recordConversion, verifyToken } from '../services/account.service.js';
import { probeAudio } from '../services/ffmpeg.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'audio-studio-uploads')
  : path.resolve(__dirname, '..', '..', 'uploads');

const router = express.Router();
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 250);
const inlineAudioLimitBytes = Number(process.env.INLINE_AUDIO_LIMIT_MB || 8) * 1024 * 1024;
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

function parseSettings(raw = '{}') {
  const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
  return {
    speed: Number(parsed.speed ?? 2.3),
    amplify: Number(parsed.amplify ?? -4),
    maxDuration: Number(parsed.maxDuration ?? 400),
    pitch: Number(parsed.pitch ?? 0),
    bassBoost: Boolean(parsed.bassBoost),
    reverb: Boolean(parsed.reverb),
    fadeIn: Number(parsed.fadeIn ?? 0),
    fadeOut: Number(parsed.fadeOut ?? 0)
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

router.get('/youtube-info', infoLimit, async (req, res, next) => {
  try {
    if (!req.query.url) return res.status(400).json({ error: 'URL YouTube wajib diisi.' });
    const info = await getYoutubeInfo(String(req.query.url));
    res.json(info);
  } catch (error) {
    next(error);
  }
});

router.post('/process', processLimit, upload.single('audio'), async (req, res, next) => {
  let sourcePath = req.file?.path;
  let downloadedPath = '';
  try {
    const auth = readAuth(req);
    if (!auth) return res.status(401).json({ error: 'Login dibutuhkan untuk konversi audio.' });
    const settings = parseSettings(req.body.settings);
    const youtubeUrl = req.body.youtubeUrl?.trim();
    const meta = youtubeUrl ? await getYoutubeInfo(youtubeUrl) : {
      title: req.file?.originalname || 'Audio Studio',
      thumbnail: ''
    };

    if (!sourcePath && youtubeUrl) {
      sourcePath = await downloadYoutubeAudio(youtubeUrl, uploadsDir);
      downloadedPath = sourcePath;
    }

    if (!sourcePath) return res.status(400).json({ error: 'Upload file audio atau masukkan URL YouTube.' });

    let sourceDuration = 0;
    try {
      if (youtubeUrl && meta.duration) sourceDuration = Number(meta.duration) || 0;
      if (!sourceDuration) {
        const probe = await probeAudio(sourcePath);
        sourceDuration = Number(probe.format.duration || 0);
      }
    } catch {
      sourceDuration = 0;
    }
    const account = await assertConversionAllowed(auth.sub, sourceDuration);
    if (account.plan.plan === 'paid') {
      settings.maxDuration = Math.max(30, Math.ceil(sourceDuration || settings.maxDuration || 400));
      settings.maxDurationLimit = 14400;
    } else {
      settings.maxDuration = Math.min(settings.maxDuration, 600);
      settings.maxDurationLimit = 600;
    }

    const outputName = `processed-${nanoid(10)}.ogg`;
    const outputPath = path.join(uploadsDir, outputName);
    const result = await processAudio({ inputPath: sourcePath, outputPath, settings });
    const shouldInlineAudio = result.sizeBytes <= inlineAudioLimitBytes;
    const audioBuffer = shouldInlineAudio ? await fs.readFile(outputPath) : null;

    const user = await recordConversion(auth.sub, {
      source: youtubeUrl ? 'youtube' : 'upload',
      duration: result.duration,
      title: meta.title
    });
    res.json({
      fileName: outputName,
      audioUrl: `/api/files/${outputName}`,
      audioDataUrl: audioBuffer ? `data:audio/ogg;base64,${audioBuffer.toString('base64')}` : '',
      duration: result.duration,
      sizeBytes: result.sizeBytes,
      title: meta.title,
      thumbnail: meta.thumbnail,
      source: youtubeUrl ? 'youtube' : 'upload',
      account: user ? { usage: user.usage, subscription: user.subscription } : null
    });
  } catch (error) {
    next(error);
  } finally {
    await removeQuiet(req.file?.path);
    await removeQuiet(downloadedPath);
  }
});

router.post('/upload-roblox', processLimit, upload.single('audio'), async (req, res, next) => {
  let splitParts = [];
  try {
    if (!req.file?.path) return res.status(400).json({ error: 'File audio hasil proses wajib dikirim.' });
    const payload = JSON.parse(req.body.payload || '{}');
    if (!payload.apiKey) return res.status(400).json({ error: 'API key Roblox wajib diisi.' });

    const split = await splitAudioIfNeeded({
      inputPath: req.file.path,
      uploadsDir,
      maxDuration: Number(payload.splitDuration ?? 180),
      maxBytes: 6 * 1024 * 1024
    });
    splitParts = split.wasSplit ? split.parts.map((part) => part.path) : [];

    const parts = await uploadAudioParts({
      parts: split.parts,
      apiKey: payload.apiKey,
      creator: payload.creator,
      displayName: payload.displayName || 'Audio Studio',
      description: payload.description || 'Diproses menggunakan Audio Studio'
    });

    res.json({ parts, wasSplit: split.wasSplit });
  } catch (error) {
    next(error);
  } finally {
    await removeQuiet(req.file?.path);
    await Promise.all(splitParts.map(removeQuiet));
  }
});

export default router;
