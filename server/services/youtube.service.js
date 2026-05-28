import ytdl from '@distube/ytdl-core';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { nanoid } from 'nanoid';

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
    const shortsMatch = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    if (shortsMatch) return shortsMatch[1];
    const embedMatch = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (embedMatch) return embedMatch[1];
  } catch {
    return '';
  }
  return '';
}

function downloadStream(stream, outputPath) {
  return new Promise((resolve, reject) => {
    stream
      .pipe(createWriteStream(outputPath))
      .on('finish', () => resolve(outputPath))
      .on('error', reject);
    stream.on('error', reject);
  });
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile('yt-dlp', args, { windowsHide: true, maxBuffer: 1024 * 1024 * 12 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message || 'yt-dlp gagal dijalankan.'));
        return;
      }
      resolve(stdout);
    });
  });
}

async function getYtDlpInfo(url, videoId) {
  const output = await runYtDlp([
    '--dump-single-json',
    '--no-warnings',
    '--skip-download',
    url
  ]);
  const info = JSON.parse(output);
  return {
    title: info.title || 'YouTube Audio',
    thumbnail: info.thumbnail || info.thumbnails?.at(-1)?.url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
    duration: Number(info.duration || 0),
    url
  };
}

export async function getYoutubeInfo(url) {
  const videoId = extractVideoId(url);
  try {
    const info = await ytdl.getInfo(url);
    const details = info.videoDetails;
    const thumbnails = details.thumbnails || [];

    return {
      title: details.title || 'YouTube Audio',
      thumbnail: thumbnails.at(-1)?.url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
      duration: Number(details.lengthSeconds || 0),
      url
    };
  } catch (error) {
    try {
      return await getYtDlpInfo(url, videoId);
    } catch {
      // Fall through to oEmbed/static thumbnail metadata.
    }
    if (!videoId) throw error;
    try {
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (response.ok) {
        const data = await response.json();
        return {
          title: data.title || 'YouTube Audio',
          thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: 0,
          url
        };
      }
    } catch {
      // Keep the final fallback below.
    }
    return {
      title: 'YouTube Audio',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: 0,
      url
    };
  }
}

export async function downloadYoutubeAudio(url, uploadsDir) {
  const outputPath = path.join(uploadsDir, `youtube-${nanoid(10)}.webm`);
  try {
    const stream = ytdl(url, {
      quality: 'highestaudio',
      filter: 'audioonly',
      highWaterMark: 1 << 25
    });
    return await downloadStream(stream, outputPath);
  } catch {
    const fallbackPath = path.join(uploadsDir, `youtube-${nanoid(10)}.%(ext)s`);
    await runYtDlp([
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--output', fallbackPath,
      '--no-warnings',
      url
    ]);
    return fallbackPath.replace('%(ext)s', 'mp3');
  }
}
