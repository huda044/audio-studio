import ytdl from '@distube/ytdl-core';
import path from 'node:path';
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
  const stream = ytdl(url, {
    quality: 'highestaudio',
    filter: 'audioonly',
    highWaterMark: 1 << 25
  });
  return downloadStream(stream, outputPath);
}
