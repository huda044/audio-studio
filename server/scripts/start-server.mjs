import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');

function envDisabled(name) {
  return ['0', 'false', 'no', 'off'].includes(String(process.env[name] || '').toLowerCase());
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: serverRoot,
      stdio: 'inherit',
      env: process.env
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(signal || `exit ${code}`));
    });
  });
}

if (!envDisabled('YTDLP_STARTUP_UPDATE') && !envDisabled('YTDLP_FORCE_UPDATE')) {
  try {
    await runNode(['scripts/install-yt-dlp.mjs']);
  } catch (error) {
    console.warn(`[startup] yt-dlp update dilewati: ${error.message}`);
  }
}

await import('../server.js');
