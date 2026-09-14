import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { nanoid } from 'nanoid';
import { clientAbortError } from './taskQueue.service.js';

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobe.path);

// Log ketersediaan binary saat boot — memudahkan diagnosa di log Hugging Face
// kalau konversi gagal/diam (mis. binary ffmpeg-static tidak ter-unduh di container).
try {
  const ffOk = ffmpegPath && fsSync.existsSync(ffmpegPath);
  const probeOk = ffprobe?.path && fsSync.existsSync(ffprobe.path);
  console.log(`[ffmpeg] binary: ${ffmpegPath || 'null'} ${ffOk ? 'OK' : 'MISSING'}`);
  console.log(`[ffmpeg] ffprobe: ${ffprobe?.path || 'null'} ${probeOk ? 'OK' : 'MISSING'}`);
  if (!ffOk || !probeOk) console.error('[ffmpeg] PERINGATAN: binary FFmpeg/ffprobe tidak ditemukan — konversi tidak akan jalan.');
} catch (error) {
  console.error('[ffmpeg] gagal cek binary:', error.message);
}

// Batas aman total durasi OUTPUT (setelah efek/speed, sebelum dipotong jadi part) supaya
// tidak membebani server. BERBEDA dari APP_MAX_DURATION_SECONDS yang membatasi durasi SUMBER
// per-request — keduanya independen. Ini di-pass sebagai maxOutputSeconds ke buildFilters.
// Default 4 jam (14400s): cukup untuk sumber YouTube 3 jam pada tempo normal.
const MAX_OUTPUT_SECONDS = Math.min(Math.max(Number(process.env.MAX_OUTPUT_SECONDS || 14400), 60), 21600);
const SEGMENT_MIN = 30;
const SEGMENT_MAX = Number(process.env.ROBLOX_AUDIO_MAX_DURATION_SECONDS || 420);

// Format output konversi. MP3 (libmp3lame VBR ~V2 ≈190kbps) dipilih karena:
// 1) encoder LAME jauh lebih baik dari libvorbis ffmpeg di kualitas-dengung,
// 2) kompatibel penuh dengan Roblox audio upload + semua pemutar.
// Set AUDIO_FORMAT=ogg untuk kembali ke Vorbis (legacy).
const AUDIO_FORMAT = String(process.env.AUDIO_FORMAT || 'mp3').toLowerCase() === 'ogg' ? 'ogg' : 'mp3';
export const OUTPUT_EXT = AUDIO_FORMAT === 'ogg' ? '.ogg' : '.mp3';
export const OUTPUT_MIME = AUDIO_FORMAT === 'ogg' ? 'audio/ogg' : 'audio/mpeg';

// Pasang codec + kualitas output ke command ffmpeg sesuai AUDIO_FORMAT.
// MP3 memakai VBR -q:a 2 (kualitas tinggi, ~190 kbps); OGG memakai libvorbis 160k.
function applyOutputCodec(cmd) {
  return AUDIO_FORMAT === 'ogg'
    ? cmd.audioCodec('libvorbis').audioBitrate('160k')
    : cmd.audioCodec('libmp3lame').outputOptions(['-q:a', '2']);
}

// Kualitas time-stretch adalah faktor terbesar "audio jadi rusak/serem" setelah
// percepatan. Default pakai rubberband (R3 finer engine, formant dipertahankan
// supaya vokal tidak jadi chipmunk/serak) — jauh lebih halus dari atempo bawaan.
// Otomatis jatuh ke atempo bila binary tidak punya librubberband.
const RUBBERBAND_OK = (() => {
  try {
    const out = execFileSync(ffmpegPath, ['-hide_banner', '-filters'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    return /rubberband/.test(out);
  } catch { return false; }
})();
const USE_RUBBERBAND = RUBBERBAND_OK && String(process.env.DISABLE_RUBBERBAND || '').toLowerCase() !== 'true';
console.log(`[ffmpeg] time-stretch engine: ${USE_RUBBERBAND ? 'rubberband (high quality)' : 'atempo (fallback)'}`);

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

// Format jam untuk pesan peringatan (mis. 14400 → "4 jam", 5400 → "1.5 jam").
function formatHours(seconds) {
  const hours = Number(seconds || 0) / 3600;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} jam`;
}

function httpError(message, status = 422, details = []) {
  const error = new Error(message);
  error.status = status;
  if (details.length) error.details = details;
  return error;
}

export function atempoChain(speed) {
  let value = clamp(speed, 0.5, 3);
  const filters = [];
  while (value > 2) { filters.push('atempo=2'); value /= 2; }
  while (value < 0.5) { filters.push('atempo=0.5'); value /= 0.5; }
  filters.push(`atempo=${value.toFixed(4)}`);
  return filters;
}

// Chain time-stretch berkualitas. Rubberband menangani seluruh rentang speed
// (0.5–3) dalam satu filter, jadi tidak perlu chaining seperti atempo.
// formant=preserved menjaga karakter vokal saat dipercepat (anti-chipmunk).
function tempoChain(speed) {
  const value = clamp(speed, 0.5, 3);
  if (USE_RUBBERBAND) return [`rubberband=tempo=${value.toFixed(4)}:formant=preserved`];
  return atempoChain(value);
}

export function computeEffectiveDuration({ sourceDuration, trimStart, trimEnd, speed, maxOutputSeconds }) {
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

export function buildFilters(settings, sourceDuration = 0, maxOutputSeconds = MAX_OUTPUT_SECONDS) {
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
  // Jujur: kalau plafon output memotong bagian akhir audio, beri tahu user.
  const trimmedInput = trimEnd > trimStart
    ? Math.max(0, Math.min(trimEnd, sourceDuration) - trimStart)
    : Math.max(0, sourceDuration - trimStart);
  const naturalOutput = trimmedInput / Math.max(speed, 0.01);
  if (sourceDuration && naturalOutput > maxOutputSeconds + 1) {
    warnings.push(`Audio sangat panjang: output dibatasi ${formatHours(maxOutputSeconds)} — bagian akhir terpotong.`);
  }

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
  filters.push(...tempoChain(speed));
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
  return [...tempoChain(speed), `volume=${amplify}dB`, 'aresample=44100'];
}

export function probeAudio(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, data) => (error ? reject(error) : resolve(data)));
  });
}

// ===================== SMART SPLIT — potong di jeda hening =====================
// Masalah: -segment_time memotong persis di detik ke-N, sering di tengah nada/kata.
// Solusi: jalankan silencedetect ffmpeg (gratis, bawaan), lalu geser tiap titik potong
// ke tengah jeda hening terdekat (dalam toleransi). Tanpa jeda yang cocok → potong
// persis seperti sebelumnya. Matikan lewat env DISABLE_SMART_SPLIT=true.

// Parser murni untuk stderr silencedetect. Jeda di akhir file tidak pernah
// mendapat silence_end (file habis) — tutup dengan totalDuration bila tersedia.
export function parseSilences(stderr, totalDuration = 0) {
  const silences = [];
  let currentStart = null;
  for (const line of String(stderr).split(/\r?\n/)) {
    const startMatch = line.match(/silence_start:\s*(-?[0-9.]+)/);
    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
      continue;
    }
    const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
    if (endMatch && currentStart !== null) {
      const end = parseFloat(endMatch[1]);
      silences.push({ start: Math.min(currentStart, end), end: Math.max(currentStart, end) });
      currentStart = null;
    }
  }
  if (currentStart !== null && totalDuration > currentStart) {
    silences.push({ start: currentStart, end: totalDuration });
  }
  return silences;
}

// Diskalakan jeda hening dari timeline SUMBER ke timeline MASTER hasil konversi.
// Master = sumber dipotong trimStart lalu dipercepat `speed`, jadi
// t_master = (t_sumber - trimStart) / speed. Deteksi dijalankan di sumber secara
// PARALEL dengan konversi (nol waktu tambahan), bukan decode ulang file master.
// Catatan: threshold -35dB mengukur sumber — kalau amplify ekstrem, jeda tipis
// bisa meleset sedikit; toleransi ±8s menyerapnya.
export function scaleSilences(silences = [], { speed = 1, trimStart = 0, maxDuration = Infinity } = {}) {
  const spd = Math.max(0.05, Number(speed) || 1);
  const t0 = Math.max(0, Number(trimStart) || 0);
  const out = [];
  for (const sil of silences) {
    const start = (Math.max(0, Number(sil.start) || 0) - t0) / spd;
    const end = (Math.max(0, Number(sil.end) || 0) - t0) / spd;
    if (end <= 0) continue; // jeda ada di bagian trim
    const clampedEnd = Math.min(end, maxDuration);
    const clampedStart = Math.max(0, Math.min(start, clampedEnd - 0.05));
    if (clampedEnd - clampedStart < 0.1) continue;
    out.push({ start: clampedStart, end: clampedEnd });
  }
  return out;
}

// Murni: dari daftar jeda hening, hitung titik potong final (detik, 2 desimal).
export function computeSmartCuts({ totalDuration, segSec, silences = [], tolerance = 8, minTail = 25, minPart = 30 }) {
  const cuts = [];
  const used = new Set();
  let prev = 0;
  for (let ideal = segSec; ideal < totalDuration - minTail; ideal += segSec) {
    const lo = ideal - tolerance;
    const hi = ideal + tolerance;
    let bestMid = null;
    let bestDist = Infinity;
    let bestIndex = -1;
    silences.forEach((s, i) => {
      if (used.has(i)) return;
      const mid = (s.start + s.end) / 2;
      if (mid < lo || mid > hi) return;
      if (mid <= prev + 1) return; // wajib maju, tidak boleh menumpuk
      const dist = Math.abs(mid - ideal);
      if (dist < bestDist) { bestDist = dist; bestMid = mid; bestIndex = i; }
    });
    const cut = bestMid !== null
      ? Math.round(bestMid * 100) / 100
      : Math.round(ideal * 100) / 100;
    if (cut - prev >= minPart) {
      cuts.push(cut);
      prev = cut;
      if (bestIndex >= 0) used.add(bestIndex);
    }
  }
  return cuts;
}

// Deteksi jeda hening lewat binary ffmpeg langsung (bukan fluent-ffmpeg) supaya
// stderr mudah ditangap. Dijalankan di file SUMBER — dipanggil paralel dengan
// konversi master, hasilnya diskalakan via scaleSilences(). Timeout → resolve
// dengan stderr yang sudah terkumpul (graceful: potong persis seperti biasa).
async function detectSilences(inputPath, { signal } = {}) {
  if (String(process.env.DISABLE_SMART_SPLIT || '').toLowerCase() === 'true') return '';
  const noiseDb = Number(process.env.SMART_SILENCE_NOISE_DB || -35);
  const minDur = Number(process.env.SMART_SILENCE_MIN_D || 0.5);
  const timeoutMs = Math.max(10000, Number(process.env.SMART_SILENCE_TIMEOUT_MS || 300000));
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve('');
    let stderr = '';
    let settled = false;
    const finish = () => { if (!settled) { settled = true; clearTimeout(timer); if (signal && onAbort) signal.removeEventListener('abort', onAbort); resolve(stderr); } };
    const child = spawn(ffmpegPath, [
      '-hide_banner', '-nostats', '-i', inputPath,
      '-af', `silencedetect=noise=${noiseDb}dB:d=${minDur}`,
      '-f', 'null', '-'
    ], { windowsHide: true });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } finish(); }, timeoutMs);
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => { stderr += d; });
    let onAbort = null;
    if (signal) {
      onAbort = () => { try { child.kill('SIGKILL'); } catch { /* ignore */ } finish(); };
      signal.addEventListener('abort', onAbort, { once: true });
    }
    child.on('error', finish);
    child.on('close', finish);
  });
}

function hasAudioStream(probe) {
  return Array.isArray(probe.streams) && probe.streams.some((s) => s.codec_type === 'audio');
}

async function runFfmpegConversion({ inputPath, outputPath, filters, trimStart, effectiveDuration, onProgress, signal }) {
  await fs.unlink(outputPath).catch(() => {});
  await new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(clientAbortError());
    let cmd = ffmpeg(inputPath);
    let stderr = '';
    let settled = false;
    // 30 menit: encode sumber multi-jam butuh headroom (sebelumnya 10 menit).
    const timeoutMs = Number(process.env.FFMPEG_TIMEOUT_MS || 1800000);
    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => { cmd.kill('SIGKILL'); settle(httpError('Konversi FFmpeg melewati batas waktu server.', 408)); }, timeoutMs);
    // Client membatalkan / menutup tab: bunuh proses FFmpeg agar slot queue cepat bebas.
    let onAbort = null;
    if (signal) {
      onAbort = () => { cmd.kill('SIGKILL'); settle(clientAbortError()); };
      signal.addEventListener('abort', onAbort, { once: true });
    }
    if (trimStart > 0) cmd = cmd.seekInput(trimStart);
    cmd = applyOutputCodec(cmd.audioFilters(filters).audioChannels(2).audioFrequency(44100).format(AUDIO_FORMAT).outputOptions(['-vn']));
    cmd.duration(effectiveDuration)
      .on('progress', (p) => { if (onProgress && Number.isFinite(p?.percent)) onProgress(Math.max(0, Math.min(100, p.percent))); })
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
// `sourceProbe` opsional: bila route sudah mem-probe sumber, pass dari sini agar tidak
// ada probe ganda (menghemat ~1-2 detik per file pada pipeline konversi).
async function processFull({ inputPath, outputPath, settings, sourceDuration = 0, onProgress, sourceProbe: prefetchedProbe, signal }) {
  const sourceProbe = prefetchedProbe || await probeAudio(inputPath).catch((error) => {
    throw httpError(`Sumber audio tidak bisa dibaca FFmpeg: ${error.message}`, 422);
  });
  if (!hasAudioStream(sourceProbe)) throw httpError('Sumber tidak memiliki stream audio yang bisa dikonversi.', 422);
  const detectedSourceDuration = Number(sourceProbe.format?.duration || 0) || Number(sourceDuration || 0);

  const primary = buildFilters(settings, detectedSourceDuration, MAX_OUTPUT_SECONDS);
  let { filters, appliedSettings, effects, warnings, effectiveDuration } = primary;
  const trimStart = appliedSettings.trimStart;
  const fallbackDisabled = String(process.env.DISABLE_AUDIO_FALLBACK || '').toLowerCase() === 'true';

  try {
    await runFfmpegConversion({ inputPath, outputPath, filters, trimStart, effectiveDuration, onProgress, signal });
  } catch (error) {
    if (fallbackDisabled) throw error;
    // Abort dari client bukan kegagalan teknis — jangan jalankan pipeline fallback.
    if (error.code === 'client_abort' || signal?.aborted) throw error;
    const level1 = buildFilters({ ...settings, normalize: false, reverb: false, echo: false }, detectedSourceDuration, MAX_OUTPUT_SECONDS);
    let level1Error = null;
    if (level1.filters.join('|') !== filters.join('|')) {
      try {
        await runFfmpegConversion({ inputPath, outputPath, filters: level1.filters, trimStart: level1.appliedSettings.trimStart, effectiveDuration: level1.effectiveDuration, onProgress, signal });
        warnings = [...warnings, 'Konversi utama gagal, backend memakai fallback aman tanpa normalize/reverb/echo.'];
        ({ filters, appliedSettings, effects, effectiveDuration } = level1);
      } catch (innerError) { level1Error = innerError; }
    } else { level1Error = error; }

    if (level1Error) {
      if (level1Error.code === 'client_abort' || signal?.aborted) throw level1Error;
      const minimalFilters = buildMinimalFilters(settings);
      try {
        await runFfmpegConversion({ inputPath, outputPath, filters: minimalFilters, trimStart: appliedSettings.trimStart, effectiveDuration, signal });
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

// Menjalankan pemotongan dengan mode tertentu: 'copy' (stream copy, tanpa
// decode/encode) atau 'encode' (re-encode penuh).
function runSegmentOnce({ inputPath, pattern, cutOptions, mode, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(clientAbortError());
    const segmentOptions = ['-vn', '-f', 'segment', ...cutOptions, '-reset_timestamps', '1'];
    let cmd = ffmpeg(inputPath);
    cmd = mode === 'copy'
      ? cmd.outputOptions([...segmentOptions, '-c', 'copy', '-segment_format', AUDIO_FORMAT])
      : applyOutputCodec(cmd.audioChannels(2).audioFrequency(44100)
        .format(AUDIO_FORMAT).outputOptions(segmentOptions));
    cmd
      .on('progress', (p) => { if (onProgress && Number.isFinite(p?.percent)) onProgress(Math.max(0, Math.min(100, p.percent))); })
      .on('end', resolve)
      .on('error', (error) => reject(signal?.aborted ? clientAbortError() : error));
    if (signal) signal.addEventListener('abort', () => cmd.kill('SIGKILL'), { once: true });
    cmd.save(pattern);
  });
}

// Potong file (sudah berisi efek) menjadi beberapa part berdurasi segmentSeconds.
// `cutPoints` opsional (smart split): daftar detik eksplisit → dipakai lewat
// -segment_times; kosong → perilaku lama (-segment_time berulang).
//
// Mode default = STREAM COPY: source sudah berformat final, jadi memotongnya tidak
// perlu decode+encode lagi (dulu di-encode ulang → membuang sekitar setengah waktu
// konversi untuk file panjang, dan menambah generasi artefak). Potongan copy jatuh
// di batas frame (MP3 ±26 ms) — tidak terasa, dan kualitasnya justru lebih baik.
// Bila copy gagal (mis. format tidak mendukung pemotongan copy), otomatis fallback
// ke re-encode seperti perilaku lama.
async function segmentFile({ inputPath, outputDir, segmentSeconds, totalDuration, onProgress, signal, cutPoints }) {
  if (totalDuration <= segmentSeconds + 0.5) {
    const single = path.join(outputDir, `processed-${nanoid(10)}${OUTPUT_EXT}`);
    await fs.copyFile(inputPath, single);
    const stat = await fs.stat(single);
    return [{ index: 1, path: single, fileName: path.basename(single), duration: round(totalDuration, 2), sizeBytes: stat.size }];
  }
  const stamp = nanoid(8);
  const pattern = path.join(outputDir, `processed-${stamp}-%03d${OUTPUT_EXT}`);
  const cutOptions = Array.isArray(cutPoints) && cutPoints.length
    ? ['-segment_times', cutPoints.join(',')]
    : ['-segment_time', String(segmentSeconds)];
  const discardPartial = async () => {
    const partials = (await fs.readdir(outputDir).catch(() => []))
      .filter((f) => f.startsWith(`processed-${stamp}-`) && f.endsWith(OUTPUT_EXT));
    await Promise.all(partials.map((f) => fs.unlink(path.join(outputDir, f)).catch(() => {})));
  };

  try {
    await runSegmentOnce({ inputPath, pattern, cutOptions, mode: 'copy', onProgress, signal });
  } catch (error) {
    if (signal?.aborted || error.code === 'client_abort') throw clientAbortError();
    // Buang potongan yang mungkin sudah tertulis sebelum fallback, supaya daftar
    // part tidak bercampur hasil dua percobaan.
    await discardPartial();
    await runSegmentOnce({ inputPath, pattern, cutOptions, mode: 'encode', onProgress, signal });
  }
  if (signal?.aborted) throw clientAbortError();
  const files = (await fs.readdir(outputDir))
    .filter((f) => f.startsWith(`processed-${stamp}-`) && f.endsWith(OUTPUT_EXT))
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
// `sourceProbe` opsional: bila sudah tersedia (mis. dari route), pass agar tidak double-probe.
// `signal` opsional: abort dari route saat client disconnect → FFmpeg dibunuh di tahap mana pun.
export async function processAudioSegmented({ inputPath, outputDir, settings, segmentSeconds, sourceDuration = 0, onProgress, sourceProbe, signal }) {
  const segSec = clamp(segmentSeconds || 180, SEGMENT_MIN, SEGMENT_MAX);
  const masterPath = path.join(outputDir, `master-${nanoid(10)}${OUTPUT_EXT}`);
  const emit = (pct) => { if (onProgress) onProgress(Math.max(0, Math.min(100, Math.round(pct)))); };
  try {
    if (signal?.aborted) throw clientAbortError();
    emit(3);
    // Deteksi jeda hening di SUMBER berjalan PARALEL dengan konversi master —
    // nol waktu tambahan; hasilnya diskalakan ke timeline master setelah ini.
    const silencesPromise = detectSilences(inputPath, { signal });
    const master = await processFull({
      inputPath, outputPath: masterPath, settings, sourceDuration,
      onProgress: (pct) => emit(5 + pct * 0.8),
      sourceProbe,
      signal
    });
    if (signal?.aborted) throw clientAbortError();
    emit(86);
    // Smart split: gunakan jeda hening sumber (sudah terdeteksi paralel), skala ke timeline master.
    const warnings = [...(master.warnings || [])];
    let cutPoints = [];
    if (master.duration > segSec + 0.5) {
      try {
        const stderr = await silencesPromise;
        const silences = scaleSilences(parseSilences(stderr), {
          speed: master.appliedSettings?.speed || 1,
          trimStart: master.appliedSettings?.trimStart || 0,
          maxDuration: master.duration
        });
        cutPoints = computeSmartCuts({ totalDuration: master.duration, segSec, silences });
        if (cutPoints.length) warnings.push(`Smart split aktif: ${cutPoints.length} titik potong ditempatkan di jeda hening.`);
      } catch {
        // Gagal mendeteksi (timeout/abort sudah ditangani di atas) → potong persis saja.
      }
    }
    if (signal?.aborted) throw clientAbortError();
    const parts = await segmentFile({
      inputPath: masterPath, outputDir, segmentSeconds: segSec, totalDuration: master.duration,
      onProgress: (pct) => emit(86 + pct * 0.13),
      signal,
      cutPoints
    });
    if (signal?.aborted) throw clientAbortError();
    emit(100);
    return {
      parts,
      segmentSeconds: segSec,
      totalDuration: master.duration,
      partCount: parts.length,
      appliedSettings: master.appliedSettings,
      effects: master.effects,
      warnings,
      source: master.source,
      format: AUDIO_FORMAT,
      codec: AUDIO_FORMAT === 'ogg' ? 'libvorbis' : 'libmp3lame',
      bitrate: AUDIO_FORMAT === 'ogg' ? '160k' : 'VBR ~V2'
    };
  } finally {
    await fs.unlink(masterPath).catch(() => {});
  }
}

// Potong satu bagian dari file yang sudah berformat final (dipakai saat part masih
// melebihi limit Roblox). Sama seperti segmentFile: coba stream copy dulu (cepat,
// tanpa generasi artefak baru), fallback ke re-encode bila copy tidak didukung.
async function convertSegment({ inputPath, outputPath, start, duration, signal }) {
  const runOnce = (mode) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(clientAbortError());
    let cmd = ffmpeg(inputPath).seekInput(start).duration(duration).outputOptions(['-vn']);
    cmd = mode === 'copy'
      ? cmd.outputOptions(['-c', 'copy', '-f', AUDIO_FORMAT])
      : applyOutputCodec(cmd.audioChannels(2).audioFrequency(44100).format(AUDIO_FORMAT));
    cmd
      .on('end', resolve)
      .on('error', (error) => reject(signal?.aborted ? clientAbortError() : error));
    if (signal) signal.addEventListener('abort', () => cmd.kill('SIGKILL'), { once: true });
    cmd.save(outputPath);
  });

  try {
    await runOnce('copy');
  } catch (error) {
    if (signal?.aborted || error.code === 'client_abort') throw clientAbortError();
    await fs.unlink(outputPath).catch(() => {});
    await runOnce('encode');
  }
}

// Dipakai saat upload Roblox untuk jaga-jaga jika part masih melebihi limit Roblox.
export async function splitAudioIfNeeded({ inputPath, uploadsDir, maxDuration = 180, maxBytes = 6 * 1024 * 1024, signal }) {
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
    if (signal?.aborted) throw clientAbortError();
    const start = i * partDuration;
    const segmentDuration = Math.min(partDuration, duration - start);
    const outputPath = path.join(uploadsDir, `part-${i + 1}-${nanoid(8)}${OUTPUT_EXT}`);
    await convertSegment({ inputPath, outputPath, start, duration: segmentDuration, signal });
    const partStat = await fs.stat(outputPath);
    parts.push({ path: outputPath, index: i + 1, duration: segmentDuration, sizeBytes: partStat.size });
  }
  return { wasSplit: true, parts };
}
