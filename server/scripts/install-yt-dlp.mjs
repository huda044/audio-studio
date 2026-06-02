import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const binDir = path.join(serverRoot, 'bin');
const platform = process.platform;
const arch = process.arch;

if (String(process.env.YTDLP_SKIP_INSTALL || 'false').toLowerCase() === 'true') {
  console.log('YTDLP_SKIP_INSTALL=true, skipping yt-dlp download.');
  process.exit(0);
}

function targetInfo() {
  if (platform === 'win32') {
    return {
      fileName: 'yt-dlp.exe',
      url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    };
  }
  if (platform === 'darwin') {
    return {
      fileName: 'yt-dlp',
      url: arch === 'arm64'
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
    };
  }
  if (platform === 'linux') {
    return {
      fileName: 'yt-dlp',
      url: arch === 'arm64'
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux'
    };
  }
  return {
    fileName: 'yt-dlp',
    url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
  };
}

function execFileAsync(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

const target = targetInfo();
const outputPath = path.join(binDir, target.fileName);

await fs.mkdir(binDir, { recursive: true });

const forceUpdate = String(process.env.YTDLP_FORCE_UPDATE || 'false').toLowerCase() === 'true';

if (!forceUpdate) {
  try {
    const version = await execFileAsync(outputPath, ['--version']);
    console.log(`yt-dlp already installed: ${version}`);
    process.exit(0);
  } catch {
    // Download below.
  }
} else {
  console.log('YTDLP_FORCE_UPDATE=true, downloading latest yt-dlp release.');
}

console.log(`Downloading yt-dlp from ${target.url}`);
const response = await fetch(target.url, { redirect: 'follow' });
if (!response.ok) {
  throw new Error(`Failed to download yt-dlp: HTTP ${response.status}`);
}

const buffer = Buffer.from(await response.arrayBuffer());
await fs.writeFile(outputPath, buffer);
if (platform !== 'win32') await fs.chmod(outputPath, 0o755);

const version = await execFileAsync(outputPath, ['--version']);
console.log(`yt-dlp installed: ${version}`);
