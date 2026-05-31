import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobe.path);

const APP_MAX_DURATION_SECONDS = Math.min(Math.max(Number(process.env.APP_MAX_DURATION_SECONDS || 200), 30), 14400);

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
  while (value > 2) {
    filters.push('atempo=2');
    value /= 2;
  }
  while (value < 0.5) {
    filters.push('atempo=0.5');
    value /= 0.5;
  }
  filters.push(`atempo=${value.toFixed(4)}`);
  return filters;
}

function computeEffectiveDuration({ sourceDuration, trimStart, trimEnd, speed, maxDuration }) {
  const source = Number(sourceDuration || 0);
  if (!source) return maxDuration;
  if (trimStart >= source - 0.05) {
    throw httpError('Trim start melebihi durasi sumber audio.', 400);
  }
  const inputDuration = trimEnd > trimStart
    ? Math.max(0, Math.min(trimEnd, source) - trimStart)
    : Math.max(0, source - trimStart);
  if (inputDuration <= 0.05) {
    throw httpError('Range trim terlalu pendek atau tidak valid.', 400);
  }
  const naturalOutputDuration = inputDuration / Math.max(speed, 0.01);
  return Math.max(0.25, Math.min(maxDuration, naturalOutputDuration));
}

function buildFilters(settings, sourceDuration = 0) {
  const speed = clamp(settings.speed ?? 2.3, 0.5, 3);
  const amplify = clamp(settings.amplify ?? -4, -20, 20);
  const maxDurationLimit = Math.min(clamp(settings.maxDurationLimit ?? APP_MAX_DURATION_SECONDS, 30, 14400), APP_MAX_DURATION_SECONDS);
  const maxDuration = clamp(settings.maxDuration ?? APP_MAX_DURATION_SECONDS, 30, maxDurationLimit);
  const pitch = clamp(settings.pitch ?? 0, -12, 12);
  const fadeIn = clamp(settings.fadeIn ?? 0, 0, 30);
  const fadeOut = clamp(settings.fadeOut ?? 0, 0, 30);
  const trimStart = Math.max(0, Number(settings.trimStart || 0));
  const trimEnd = Math.max(0, Number(settings.trimEnd || 0));
  const effectiveDuration = computeEffectiveDuration({ sourceDuration, trimStart, trimEnd, speed, maxDuration });
  const warnings = [];
  if (sourceDuration && trimEnd > sourceDuration) {
    warnings.push('Trim end lebih panjang dari sumber, otomatis dipotong ke akhir audio.');
  }
  const appliedSettings = {
    speed: round(speed, 4),
    amplify,
    maxDuration,
    maxDurationLimit,
    pitch,
    bassBoost: Boolean(settings.bassBoost),
    reverb: Boolean(settings.reverb),
    normalize: Boolean(settings.normalize),
    echo: Boolean(settings.echo),
    fadeIn,
    fadeOut,
    trimStart,
    trimEnd,
    eqPreset: typeof settings.eqPreset === 'string' ? settings.eqPreset : ''
  };
  const filters = [];
  const effects = [
    `Tempo ${appliedSettings.speed}x`,
    `Volume ${appliedSettings.amplify} dB`
  ];

  if (pitch !== 0) {
    const factor = Math.pow(2, pitch / 12);
    filters.push(`asetrate=44100*${factor.toFixed(6)}`, 'aresample=44100');
    effects.push(`Pitch ${pitch > 0 ? '+' : ''}${pitch} semitone`);
  }

  filters.push(...atempoChain(speed));
  filters.push(`volume=${amplify}dB`);

  // EQ presets
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

  if (appliedSettings.bassBoost) {
    filters.push('equalizer=f=90:t=q:w=1:g=8');
    effects.push('Bass boost');
  }
  if (appliedSettings.reverb) {
    filters.push('aecho=0.8:0.88:60:0.35');
    effects.push('Reverb');
  }
  if (appliedSettings.echo) {
    filters.push('aecho=0.8:0.9:1000:0.3');
    effects.push('Echo');
  }
  if (appliedSettings.normalize) {
    if (String(process.env.DISABLE_LOUDNORM || '').toLowerCase() === 'true') {
      // loudnorm sering segfault di build ffmpeg-static lama; admin bisa matikan via env.
      warnings.push('Loudnorm di-skip karena DISABLE_LOUDNORM aktif di server.');
    } else {
      filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
      effects.push('Normalize loudness');
    }
  }
  if (fadeIn > 0) {
    filters.push(`afade=t=in:st=0:d=${fadeIn}`);
    effects.push(`Fade in ${fadeIn}s`);
  }
  if (fadeOut > 0) {
    const start = Math.max(0, effectiveDuration - fadeOut);
    filters.push(`afade=t=out:st=${start}:d=${fadeOut}`);
    effects.push(`Fade out ${fadeOut}s`);
  }
  if (trimStart > 0) effects.push(`Trim start ${trimStart}s`);
  if (trimEnd > 0) effects.push(`Trim end ${trimEnd}s`);
  filters.push('aresample=44100');

  return { filters, maxDuration, appliedSettings, effects, warnings, effectiveDuration };
}

export function probeAudio(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function hasAudioStream(probe) {
  return Array.isArray(probe.streams) && probe.streams.some((stream) => stream.codec_type === 'audio');
}

async function runFfmpegConversion({ inputPath, outputPath, filters, trimStart, effectiveDuration }) {
  await fs.unlink(outputPath).catch(() => {});
  await new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath);
    let stderr = '';
    let settled = false;
    const timeoutMs = Number(process.env.FFMPEG_TIMEOUT_MS || 300000);
    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      cmd.kill('SIGKILL');
      settle(httpError('Konversi FFmpeg melewati batas waktu server.', 408));
    }, timeoutMs);
    if (trimStart > 0) cmd = cmd.seekInput(trimStart);
    cmd
      .audioFilters(filters)
      .audioCodec('libvorbis')
      .audioBitrate('128k')
      .audioChannels(2)
      .audioFrequency(44100)
      .format('ogg')
      .outputOptions(['-vn']);
    cmd.duration(effectiveDuration)
      .on('end', () => settle())
      .on('stderr', (line) => {
        stderr = `${stderr}${line}\n`.slice(-4000);
      })
      .on('error', (error) => {
        const code = typeof error?.message === 'string' && error.message.match(/code\s+(-?\d+)/)?.[1];
        const numericCode = code ? Number(code) : null;
        const isCrash = numericCode === -11 || numericCode === 139 || numericCode === -6 || numericCode === 134;
        const detail = stderr.trim() || error.message;
        const next = new Error(isCrash
          ? `Konversi FFmpeg crash (signal ${numericCode}). Backend akan coba fallback minimal.`
          : `Konversi FFmpeg gagal: ${detail.split(/\r?\n/).slice(-2).join(' ').slice(0, 320)}`);
        next.status = 422;
        next.code = isCrash ? 'ffmpeg_crash' : 'ffmpeg_error';
        next.cause = error;
        next.stderr = detail;
        settle(next);
      })
      .save(outputPath);
  });
}

function buildMinimalFilters(settings) {
  const speed = clamp(settings.speed ?? 2.3, 0.5, 3);
  const amplify = clamp(settings.amplify ?? -4, -20, 20);
  const filters = [...atempoChain(speed), `volume=${amplify}dB`, 'aresample=44100'];
  return filters;
}

export async function processAudio({ inputPath, outputPath, settings, sourceDuration = 0 }) {
  const sourceProbe = await probeAudio(inputPath).catch((error) => {
    throw httpError(`Sumber audio tidak bisa dibaca FFmpeg: ${error.message}`, 422);
  });
  if (!hasAudioStream(sourceProbe)) {
    throw httpError('Sumber tidak memiliki stream audio yang bisa dikonversi.', 422);
  }
  const detectedSourceDuration = Number(sourceProbe.format?.duration || 0) || Number(sourceDuration || 0);
  const primary = buildFilters(settings, detectedSourceDuration);
  let { filters, appliedSettings, effects, warnings, effectiveDuration } = primary;
  const trimStart = appliedSettings.trimStart;
  const fallbackDisabled = String(process.env.DISABLE_AUDIO_FALLBACK || '').toLowerCase() === 'true';

  try {
    await runFfmpegConversion({ inputPath, outputPath, filters, trimStart, effectiveDuration });
  } catch (error) {
    if (fallbackDisabled) throw error;

    // Fallback level 1: matikan filter berat (loudnorm/reverb/echo) tapi pertahankan EQ + pitch
    const level1Settings = { ...settings, normalize: false, reverb: false, echo: false };
    const level1 = buildFilters(level1Settings, detectedSourceDuration);
    const level1Same = level1.filters.join('|') === filters.join('|');

    let level1Error = null;
    if (!level1Same) {
      try {
        await runFfmpegConversion({
          inputPath,
          outputPath,
          filters: level1.filters,
          trimStart: level1.appliedSettings.trimStart,
          effectiveDuration: level1.effectiveDuration
        });
        warnings = [
          ...warnings,
          'Konversi utama gagal, backend memakai fallback aman tanpa normalize/reverb/echo.'
        ];
        ({ filters, appliedSettings, effects, effectiveDuration } = level1);
      } catch (innerError) {
        level1Error = innerError;
      }
    }

    if (level1Same || level1Error) {
      // Fallback level 2: minimal — tempo + volume saja, tanpa pitch, EQ, efek apapun.
      // Khusus untuk handle ffmpeg crash (SIGSEGV) yang dipicu filter chain berat di ffmpeg-static.
      const minimalFilters = buildMinimalFilters(settings);
      try {
        await runFfmpegConversion({
          inputPath,
          outputPath,
          filters: minimalFilters,
          trimStart: appliedSettings.trimStart,
          effectiveDuration
        });
        warnings = [
          ...warnings,
          'Filter chain penuh menyebabkan FFmpeg crash. Backend memakai pipeline minimal (hanya tempo + volume). Coba kurangi efek atau coba sumber lain.'
        ];
        // Effect list disederhanakan supaya laporan akurat dengan apa yang benar-benar dipakai.
        effects = [`Tempo ${appliedSettings.speed}x`, `Volume ${appliedSettings.amplify} dB`, 'Filter berat dilewati (fallback)'];
        filters = minimalFilters;
      } catch (innerError) {
        // Sudah minimal masih gagal → throw error pertama (paling deskriptif).
        throw error;
      }
    }
  }

  const [stat, probe] = await Promise.all([fs.stat(outputPath), probeAudio(outputPath)]);
  if (!stat.size) {
    const error = new Error('Konversi selesai tetapi file output kosong.');
    error.status = 422;
    throw error;
  }
  if (!hasAudioStream(probe)) {
    throw httpError('Konversi selesai tetapi output tidak memiliki stream audio.', 422);
  }
  const outputDuration = Number(probe.format.duration || 0);
  if (!outputDuration || outputDuration < 0.2) {
    throw httpError('Konversi selesai tetapi durasi output terlalu pendek.', 422);
  }
  return {
    sizeBytes: stat.size,
    duration: outputDuration,
    format: 'ogg',
    codec: 'libvorbis',
    bitrate: '128k',
    filters,
    effects,
    warnings,
    appliedSettings,
    effectiveDuration,
    source: {
      duration: detectedSourceDuration,
      codec: sourceProbe.streams.find((stream) => stream.codec_type === 'audio')?.codec_name || '',
      format: sourceProbe.format?.format_name || ''
    }
  };
}

async function convertSegment({ inputPath, outputPath, start, duration }) {
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(start)
      .duration(duration)
      .audioCodec('libvorbis')
      .audioBitrate('128k')
      .audioChannels(2)
      .audioFrequency(44100)
      .format('ogg')
      .outputOptions(['-vn'])
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

export async function splitAudioIfNeeded({ inputPath, uploadsDir, maxDuration = APP_MAX_DURATION_SECONDS, maxBytes = 6 * 1024 * 1024 }) {
  const [stat, probe] = await Promise.all([fs.stat(inputPath), probeAudio(inputPath)]);
  const duration = Number(probe.format.duration || 0);
  const durationLimit = clamp(maxDuration, 30, 600);
  if (!hasAudioStream(probe)) {
    throw httpError('File hasil konversi tidak memiliki stream audio untuk diupload.', 422);
  }
  if (!duration || duration < 0.2) {
    throw httpError('Durasi file hasil konversi tidak valid untuk upload Roblox.', 422);
  }

  if (stat.size <= maxBytes && duration <= durationLimit) {
    return {
      wasSplit: false,
      parts: [{ path: inputPath, index: 1, duration, sizeBytes: stat.size }]
    };
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
