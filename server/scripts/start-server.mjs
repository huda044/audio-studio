import { spawn } from 'node:child_process';
import process from 'node:process';
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

function startBgutilProvider() {
  if (envDisabled('YTDLP_BGUTIL_PROVIDER')) return null;
  const providerHome = process.env.YTDLP_BGUTIL_PROVIDER_HOME || '/opt/bgutil-ytdlp-pot-provider/server';
  const providerScript = path.join(providerHome, 'build', 'main.js');
  const port = process.env.YTDLP_BGUTIL_PROVIDER_PORT || '4416';
  const child = spawn(process.execPath, [providerScript, '--port', port], {
    cwd: providerHome,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env
  });
  child.on('error', (error) => {
    console.warn(`[startup] bgutil PO Token provider gagal start: ${error.message}`);
  });
  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.warn(`[startup] bgutil PO Token provider berhenti: exit ${code}`);
    } else if (signal) {
      console.warn(`[startup] bgutil PO Token provider berhenti: ${signal}`);
    }
  });
  process.on('exit', () => child.kill());
  return child;
}

async function warmBgutilProvider() {
  if (envDisabled('YTDLP_BGUTIL_PROVIDER')) return;
  const baseUrl = process.env.YTDLP_BGUTIL_PROVIDER_URL || 'http://127.0.0.1:4416';
  const timeoutMs = Number(process.env.YTDLP_BGUTIL_WARMUP_TIMEOUT_MS || 90000);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/ping`, {
        method: 'GET',
        signal: AbortSignal.timeout(15000)
      });
      if (response.ok) {
        console.log('[startup] bgutil PO Token provider siap.');
        return;
      }
    } catch {
      // provider may still be booting; retry until deadline
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  console.warn('[startup] bgutil PO Token provider belum siap setelah warmup timeout.');
}

if (!envDisabled('YTDLP_STARTUP_UPDATE') && !envDisabled('YTDLP_FORCE_UPDATE')) {
  try {
    await runNode(['scripts/install-yt-dlp.mjs']);
  } catch (error) {
    console.warn(`[startup] yt-dlp update dilewati: ${error.message}`);
  }
}

startBgutilProvider();
warmBgutilProvider().catch((error) => {
  console.warn(`[startup] bgutil PO Token provider warmup gagal: ${error.message}`);
});

await import('../server.js');
