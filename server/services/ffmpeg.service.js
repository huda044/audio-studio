import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobe.path);

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
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

function buildFilters(settings) {
  const speed = clamp(settings.speed ?? 2.3, 0.5, 3);
  const amplify = clamp(settings.amplify ?? -4, -20, 20);
  const maxDuration = clamp(settings.maxDuration ?? 400, 30, 600);
  const pitch = clamp(settings.pitch ?? 0, -12, 12);
  const filters = [];

  if (pitch !== 0) {
    const factor = Math.pow(2, pitch / 12);
    filters.push(`asetrate=44100*${factor.toFixed(6)}`, 'aresample=44100');
  }

  filters.push(...atempoChain(speed));
  filters.push(`volume=${amplify}dB`);

  if (settings.bassBoost) filters.push('equalizer=f=90:t=q:w=1:g=8');
  if (settings.reverb) filters.push('aecho=0.8:0.88:60:0.35');
  if (settings.fadeIn > 0) filters.push(`afade=t=in:st=0:d=${clamp(settings.fadeIn, 0, 30)}`);
  if (settings.fadeOut > 0) {
    const fadeOut = clamp(settings.fadeOut, 0, 30);
    const start = Math.max(0, maxDuration - fadeOut);
    filters.push(`afade=t=out:st=${start}:d=${fadeOut}`);
  }

  return { filters, maxDuration };
}

export function probeAudio(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

export async function processAudio({ inputPath, outputPath, settings }) {
  const { filters, maxDuration } = buildFilters(settings);
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters(filters)
      .audioCodec('libvorbis')
      .audioBitrate('128k')
      .format('ogg')
      .duration(maxDuration)
      .outputOptions(['-vn'])
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });

  const [stat, probe] = await Promise.all([fs.stat(outputPath), probeAudio(outputPath)]);
  return { sizeBytes: stat.size, duration: Number(probe.format.duration || 0) };
}

async function convertSegment({ inputPath, outputPath, start, duration }) {
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(start)
      .duration(duration)
      .audioCodec('libvorbis')
      .audioBitrate('128k')
      .format('ogg')
      .outputOptions(['-vn'])
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

export async function splitAudioIfNeeded({ inputPath, uploadsDir, maxDuration = 400, maxBytes = 6 * 1024 * 1024 }) {
  const [stat, probe] = await Promise.all([fs.stat(inputPath), probeAudio(inputPath)]);
  const duration = Number(probe.format.duration || 0);
  const durationLimit = clamp(maxDuration, 30, 600);

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
