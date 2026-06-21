import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobe.path);

// Batas aman total durasi output (setelah efek/speed) supaya tidak membebani server.
const MAX_OUTPUT_SECONDS = Math.min(Math.max(Number(process.env.MAX_OUTPUT_SECONDS || 3600), 60), 21600);
const SEGMENT_MIN = 30;
const SEGMENT_MAX = Number(process.env.ROBLOX_AUDIO_MAX_DURATION_SECONDS || 420);

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function httpError(message, status = 422, details = []) {
  const error = new Error(message);
  error.status = status;
  if (details.length) error.details = details;
  return error;
}

function atempoChain(speed) {
  let value = clamp(speed, 0.5, 3);
  const filters = [];
  while (value > 2) { filters.push('atempo=2'); value /= 2; }
  while (value < 0.5) { filters.push('atempo=0.5'); value /= 0.5; }
  filters.push(`atempo=${value.toFixed(4)}`);
  return filters;
}

function computeEffectiveDuration({ sourceDuration, trimStart, trimEnd, speed, maxOutputSeconds }) {
  const source = Number(sourceDuration || 0);
  if (!source) return maxOutputSeconds;
  if (trimStart >= source - 0.05) throw httpError('Trim start melebihi durasi sumber audio.', 400);
  const inputDuration = trimEnd > trimStart
    ? Math.max(0, Math.min(trimEnd, source) - trimStart)
    : Math.max(0, source - trimStart);
  if (inputDuration <= 0.05) throw httpError('Range trim terlalu pendek atau tidak valid.', 400);
  const naturalOutputDuration = inputDuration / Math.max(speed, 0.01);
  return Math.max(0.25, Math.min(maxOutputSeconds, naturalOutputDuration));
}

function buildFilters(settings, sourceDuration = 0, maxOutputSeconds = MAX_OUTPUT_SECONDS) {
  const speed = clamp(settings.speed ?? 2.3, 0.5, 3);
  const amplify = clamp(settings.amplify ?? -4, -20, 20);
  const pitch = clamp(settings.pitch ?? 0, -12, 12);
  const fadeIn = clamp(settings.fadeIn ?? 0, 0, 30);
  const fadeOut = clamp(settings.fadeOut ?? 0, 0, 30);
  const trimStart = Math.max(0, Number(settings.trimStart || 0));
  const trimEnd = Math.max(0, Number(settings.trimEnd || 0));
  const effectiveDuration = computeEffectiveDuration({ sourceDuration, trimStart, trimEnd, speed, maxOutputSeconds });
  const warnings = [];
  if (sourceDuration && trimEnd > sourceDuration) warnings.push('Trim end lebih panjang dari sumber, otomatis dipotong ke akhir audio.');

  const appliedSettings = {
    speed: round(speed, 4), amplify, pitch,
    bassBoost: Boolean(settings.bassBoost), reverb: Boolean(settings.reverb),
    normalize: Boolean(settings.normalize), echo: Boolean(settings.echo),
    fadeIn, fadeOut, trimStart, trimEnd,
    eqPreset: typeof settings.eqPreset === 'string' ? settings.eqPreset : ''
  };
  const filters = [];
  const effects = [`Tempo ${appliedSettings.speed}x`, `Volume ${appliedSettings.amplify} dB`];

  if (pitch !== 0) {
    const factor = Math.pow(2, pitch / 12);
    filters.push(`asetrate=44100*${factor.toFixed(6)}`, 'aresample=44100');
    effects.push(`Pitch ${pitch > 0 ? '+' : ''}${pitch} semitone`);
  }
  filters.push(...atempoChain(speed));
  filters.push(`volume=${amplify}dB`);

  const eqPresets = {
    bass_heavy: ['equalizer=f=60:width_type=o:width=2:g=8', 'equalizer=f=200:width_type=o:width=1:g=3'],
    vocal_clear: ['equalizer=f=3000:width_type=o:width=1:g=4', 'equalizer=f=7000:width_type=o:width=1:g=2'],
    lo_fi: ['equalizer=f=100:width_type=o:width=2:g=3', 'equalizer=f=8000:width_type=o:width=2:g=-6'],
    podcast: ['equalizer=f=100:width_type=h:width=80:g=-10', 'equalizer=f=3000:width_type=o:width=1:g=3']
  };
  if (settings.eqPreset && eqPresets[settings.eqPreset]) {
    filters.push(...eqPresets[settings.eqPreset]);
    effects.push(`EQ ${settings.eqPreset.replace(/_/g, ' ')}`);
  }
  if (appliedSettings.bassBoost) { filters.push('equalizer=f=90:t=q:w=1:g=8'); effects.push('Bass boost'); }
  if (appliedSettings.reverb) { filters.push('aecho=0.8:0.88:60:0.35'); effects.push('Reverb'); }
  if (appliedSettings.echo) { filters.push('aecho=0.8:0.9:1000:0.3'); effects.push('Echo'); }
  if (appliedSettings.normalize) {
    if (String(process.env.DISABLE_LOUDNORM || '').toLowerCase() === 'true') warnings.push('Loudnorm di-skip karena DISABLE_LOUDNORM aktif di server.');
    else { filters.push('loudnorm=I=-16:TP=-1.5:LRA=11'); effects.push('Normalize loudness'); }
  }
  if (fadeIn > 0) { filters.push(`afade=t=in:st=0:d=${fadeIn}`); effects.push(`Fade in ${fadeIn}s`); }
  if (fadeOut > 0) { filters.push(`afade=t=out:st=${Math.max(0, effectiveDuration - fadeOut)}:d=${fadeOut}`); effects.push(`Fade out ${fadeOut}s`); }
  if (trimStart > 0) effects.push(`Trim start ${trimStart}s`);
  if (trimEnd > 0) effects.push(`Trim end ${trimEnd}s`);
  filters.push('aresample=44100');

  return { filters, appliedSettings, effects, warnings, effectiveDuration };
}

function buildMinimalFilters(settings) {
  const speed = clamp(settings.speed ?? 2.3, 0.5, 3);
  const amplify = clamp(settings.amplify ?? -4, -20, 20);
  return [...atempoChain(speed), `volume=${amplify}dB`, 'aresample=44100'];
}

export function probeAudio(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, data) => (error ? reject(error) : resolve(data)));
  });
}

function hasAudioStream(probe) {
  return Array.isArray(probe.streams) && probe.streams.some((s) => s.codec_type === 'audio');
}

async function runFfmpegConversion({ inputPath, outputPath, filters, trimStart, effectiveDuration }) {
  await fs.unlink(outputPath).catch(() => {});
  await new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath);
    let stderr = '';
    let settled = false;
    const timeoutMs = Number(process.env.FFMPEG_TIMEOUT_MS || 300000);
    const settle = (error) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(); };
    const timer = setTimeout(() => { cmd.kill('SIGKILL'); settle(httpError('Konversi FFmpeg melewati batas waktu server.', 408)); }, timeoutMs);
    if (trimStart > 0) cmd = cmd.seekInput(trimStart);
    cmd.audioFilters(filters).audioCodec('libvorbis').audioBitrate('128k').audioChannels(2).audioFrequency(44100).format('ogg').outputOptions(['-vn']);
    cmd.duration(effectiveDuration)
      .on('end', () => settle())
      .on('stderr', (line) => { stderr = `${stderr}${line}\n`.slice(-4000); })
      .on('error', (error) => {
        const code = typeof error?.message === 'string' && error.message.match(/code\s+(-?\d+)/)?.[1];
        const numericCode = code ? Number(code) : null;
        const isCrash = numericCode === -11 || numericCode === 139 || numericCode === -6 || numericCode === 134;
        const detail = stderr.trim() || error.message;
        const next = new Error(isCrash
          ? `Konversi FFmpeg crash (signal ${numericCode}). Backend akan coba fallback minimal.`
          : `Konversi FFmpeg gagal: ${detail.split(/\r?\n/).slice(-2).join(' ').slice(0, 320)}`);
        next.status = 422; next.code = isCrash ? 'ffmpeg_crash' : 'ffmpeg_error'; next.cause = error; next.stderr = detail;
        settle(next);
      })
      .save(outputPath);
  });
}

// Proses audio penuh dengan efek (dipakai sebagai master sebelum dipotong jadi part).
async function processFull({ inputPath, outputPath, settings, sourceDuration = 0 }) {
  const sourceProbe = await probeAudio(inputPath).catch((error) => {
    throw httpError(`Sumber audio tidak bisa dibaca FFmpeg: ${error.message}`, 422);
  });
  if (!hasAudioStream(sourceProbe)) throw httpError('Sumber tidak memiliki stream audio yang bisa dikonversi.', 422);
  const detectedSourceDuration = Number(sourceProbe.format?.duration || 0) || Number(sourceDuration || 0);

  const primary = buildFilters(settings, detectedSourceDuration, MAX_OUTPUT_SECONDS);
  let { filters, appliedSettings, effects, warnings, effectiveDuration } = primary;
  const trimStart = appliedSettings.trimStart;
  const fallbackDisabled = String(process.env.DISABLE_AUDIO_FALLBACK || '').toLowerCase() === 'true';

  try {
    await runFfmpegConversion({ inputPath, outputPath, filters, trimStart, effectiveDuration });
  } catch (error) {
    if (fallbackDisabled) throw error;
    const level1 = buildFilters({ ...settings, normalize: false, reverb: false, echo: false }, detectedSourceDuration, MAX_OUTPUT_SECONDS);
    let level1Error = null;
    if (level1.filters.join('|') !== filters.join('|')) {
      try {
        await runFfmpegConversion({ inputPath, outputPath, filters: level1.filters, trimStart: level1.appliedSettings.trimStart, effectiveDuration: level1.effectiveDuration });
        warnings = [...warnings, 'Konversi utama gagal, backend memakai fallback aman tanpa normalize/reverb/echo.'];
        ({ filters, appliedSettings, effects, effectiveDuration } = level1);
      } catch (innerError) { level1Error = innerError; }
    } else { level1Error = error; }

    if (level1Error) {
      const minimalFilters = buildMinimalFilters(settings);
      try {
        await runFfmpegConversion({ inputPath, outputPath, filters: minimalFilters, trimStart: appliedSettings.trimStart, effectiveDuration });
        warnings = [...warnings, 'Filter chain penuh menyebabkan FFmpeg crash. Backend memakai pipeline minimal (tempo + volume saja).'];
        effects = [`Tempo ${appliedSettings.speed}x`, `Volume ${appliedSettings.amplify} dB`, 'Filter berat dilewati (fallback)'];
        filters = minimalFilters;
      } catch { throw error; }
    }
  }

  const [stat, probe] = await Promise.all([fs.stat(outputPath), probeAudio(outputPath)]);
  if (!stat.size) throw httpError('Konversi selesai tetapi file output kosong.', 422);
  if (!hasAudioStream(probe)) throw httpError('Konversi selesai tetapi output tidak memiliki stream audio.', 422);
  const outputDuration = Number(probe.format.duration || 0);
  if (!outputDuration || outputDuration < 0.2) throw httpError('Konversi selesai tetapi durasi output terlalu pendek.', 422);

  return {
    sizeBytes: stat.size, duration: outputDuration, effects, warnings, appliedSettings,
    source: {
      duration: detectedSourceDuration,
      codec: sourceProbe.streams.find((s) => s.codec_type === 'audio')?.codec_name || '',
      format: sourceProbe.format?.format_name || ''
    }
  };
}

// Potong file (sudah berisi efek) menjadi beberapa part berdurasi segmentSeconds.
async function segmentFile({ inputPath, outputDir, segmentSeconds, totalDuration }) {
  if (totalDuration <= segmentSeconds + 0.5) {
    const single = path.join(outputDir, `processed-${nanoid(10)}.ogg`);
    await fs.copyFile(inputPath, single);
    const stat = await fs.stat(single);
    return [{ index: 1, path: single, fileName: path.basename(single), duration: round(totalDuration, 2), sizeBytes: stat.size }];
  }
  const stamp = nanoid(8);
  const pattern = path.join(outputDir, `processed-${stamp}-%03d.ogg`);
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec('libvorbis').audioBitrate('128k').audioChannels(2).audioFrequency(44100)
      .outputOptions(['-vn', '-f', 'segment', '-segment_time', String(segmentSeconds), '-reset_timestamps', '1'])
      .on('end', resolve)
      .on('error', reject)
      .save(pattern);
  });
  const files = (await fs.readdir(outputDir))
    .filter((f) => f.startsWith(`processed-${stamp}-`) && f.endsWith('.ogg'))
    .sort();
  const parts = [];
  for (let i = 0; i < files.length; i += 1) {
    const full = path.join(outputDir, files[i]);
    const [stat, probe] = await Promise.all([fs.stat(full), probeAudio(full).catch(() => null)]);
    if (!stat.size) { await fs.unlink(full).catch(() => {}); continue; }
    parts.push({ index: i + 1, path: full, fileName: files[i], duration: round(Number(probe?.format?.duration || segmentSeconds), 2), sizeBytes: stat.size });
  }
  if (!parts.length) throw httpError('Gagal memotong audio menjadi part.', 422);
  return parts;
}

// API utama: proses + potong jadi beberapa lagu.
export async function processAudioSegmented({ inputPath, outputDir, settings, segmentSeconds, sourceDuration = 0 }) {
  const segSec = clamp(segmentSeconds || 180, SEGMENT_MIN, SEGMENT_MAX);
  const masterPath = path.join(outputDir, `master-${nanoid(10)}.ogg`);
  try {
    const master = await processFull({ inputPath, outputPath: masterPath, settings, sourceDuration });
    const parts = await segmentFile({ inputPath: masterPath, outputDir, segmentSeconds: segSec, totalDuration: master.duration });
    return {
      parts,
      segmentSeconds: segSec,
      totalDuration: master.duration,
      partCount: parts.length,
      appliedSettings: master.appliedSettings,
      effects: master.effects,
      warnings: master.warnings,
      source: master.source,
      format: 'ogg',
      codec: 'libvorbis',
      bitrate: '128k'
    };
  } finally {
    await fs.unlink(masterPath).catch(() => {});
  }
}

async function convertSegment({ inputPath, outputPath, start, duration }) {
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath).seekInput(start).duration(duration)
      .audioCodec('libvorbis').audioBitrate('128k').audioChannels(2).audioFrequency(44100)
      .format('ogg').outputOptions(['-vn'])
      .on('end', resolve).on('error', reject).save(outputPath);
  });
}

// Dipakai saat upload Roblox untuk jaga-jaga jika part masih melebihi limit Roblox.
export async function splitAudioIfNeeded({ inputPath, uploadsDir, maxDuration = 180, maxBytes = 6 * 1024 * 1024 }) {
  const [stat, probe] = await Promise.all([fs.stat(inputPath), probeAudio(inputPath)]);
  const duration = Number(probe.format.duration || 0);
  const durationLimit = clamp(maxDuration, 30, 600);
  if (!hasAudioStream(probe)) throw httpError('File hasil konversi tidak memiliki stream audio untuk diupload.', 422);
  if (!duration || duration < 0.2) throw httpError('Durasi file hasil konversi tidak valid untuk upload Roblox.', 422);

  if (stat.size <= maxBytes && duration <= durationLimit) {
    return { wasSplit: false, parts: [{ path: inputPath, index: 1, duration, sizeBytes: stat.size }] };
  }
  const parts = [];
  const bytesPerSecond = stat.size / Math.max(duration, 1);
  const sizeSafeDuration = Math.max(20, Math.floor((maxBytes * 0.92) / bytesPerSecond));
  const partDuration = Math.max(20, Math.min(durationLimit, sizeSafeDuration));
  const count = Math.ceil(duration / partDuration);
  for (let i = 0; i < count; i += 1) {
    const start = i * partDuration;
    const segmentDuration = Math.min(partDuration, duration - start);
    const outputPath = path.join(uploadsDir, `part-${i + 1}-${nanoid(8)}.ogg`);
    await convertSegment({ inputPath, outputPath, start, duration: segmentDuration });
    const partStat = await fs.stat(outputPath);
    parts.push({ path: outputPath, index: i + 1, duration: segmentDuration, sizeBytes: partStat.size });
  }
  return { wasSplit: true, parts };
}
