import ytdl from '@distube/ytdl-core';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { nanoid } from 'nanoid';

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
  const info = await ytdl.getInfo(url);
  const details = info.videoDetails;
  const thumbnails = details.thumbnails || [];

  return {
    title: details.title || 'YouTube Audio',
    thumbnail: thumbnails.at(-1)?.url || '',
    duration: Number(details.lengthSeconds || 0),
    url
  };
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
