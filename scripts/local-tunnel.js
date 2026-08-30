#!/usr/bin/env node
// local-tunnel.js — nyalakan backend di PC ini + expose via Cloudflare Tunnel,
// lalu (opsional) arahkan frontend Vercel ke URL tunnel tersebut.
//
// Pemakaian:
//   node scripts/local-tunnel.js                   → server + tunnel saja (URL dicetak)
//   node scripts/local-tunnel.js --update-vercel   → + set VITE_API_BASE di Vercel & redeploy produksi
//
// Catatan:
// - URL trycloudflare.com BERUBAH setiap kali tunnel dijalankan ulang. Bila memakai
//   --update-vercel, frontend Vercel otomatis diarahkan ke URL terbaru.
// - PC harus tetap menyala selama situs dipakai. Tekan Ctrl+C untuk mematikan semua.
// - yt-dlp harus tersedia di PATH (atau server/bin/yt-dlp) agar import YouTube jalan.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const UPDATE_VERCEL = process.argv.includes('--update-vercel');
const PORT = process.env.PORT || 4000;
const CLOUDFLARED = path.join(rootDir, 'tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');

function run(cmd, args, { cwd, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: process.platform === 'win32', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let out = '';
    let err = '';
    if (capture) {
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
    }
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve({ out, err }) : reject(new Error(`${cmd} keluar dengan kode ${code}\n${err.slice(-800)}`))));
  });
}

function runStreaming(cmd, args, { cwd, onText, shell = false } = {}) {
  // shell hanya untuk perintah .cmd (npx); exe langsung (node/cloudflared) TANPA shell —
  // shell:true memotong path ber-spasi seperti "C:\Program Files\nodejs\node.exe".
  const child = spawn(cmd, args, { cwd, shell });
  const handle = (d) => onText(String(d));
  child.stdout.on('data', handle);
  child.stderr.on('data', handle);
  return child;
}

const cleanupFns = [];
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nMematikan server & tunnel...');
  for (const fn of cleanupFns) { try { fn(); } catch { /* ignore */ } }
  setTimeout(() => process.exit(code), 800);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  // 1) Nyalakan backend lokal
  console.log(`▶ Menjalankan backend lokal di port ${PORT}...`);
  const server = runStreaming(process.execPath, ['server.js'], {
    cwd: path.join(rootDir, 'server'),
    onText: (t) => process.stdout.write(`[server] ${t}`)
  });
  cleanupFns.push(() => { try { server.kill(); } catch { /* ignore */ } });

  // Tunggu /health siap
  let up = false;
  for (let i = 0; i < 30 && !up; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      up = res.ok;
    } catch { /* belum siap */ }
  }
  if (!up) {
    console.error('✗ Backend tidak merespons /health. Periksa log di atas.');
    return shutdown(1);
  }
  console.log('✓ Backend siap.\n');

  // 2) Nyalakan Cloudflare quick tunnel
  console.log('▶ Menjalankan Cloudflare Tunnel (URL publik akan muncul)...');
  let tunnelUrl = '';
  const tunnel = runStreaming(CLOUDFLARED, ['tunnel', '--url', `http://127.0.0.1:${PORT}`, '--no-autoupdate'], {
    shell: false,
    onText: (t) => {
      process.stdout.write(`[tunnel] ${t}`);
      const match = t.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !tunnelUrl) {
        tunnelUrl = match[0];
        onTunnelReady(tunnelUrl);
      }
    }
  });
  cleanupFns.push(() => { try { tunnel.kill(); } catch { /* ignore */ } });

  async function onTunnelReady(url) {
    console.log(`\n==============================================`);
    console.log(`✓ URL PUBLIK BACKEND: ${url}`);
    console.log(`  Cek kesehatan: ${url}/health`);
    console.log(`==============================================\n`);

    if (!UPDATE_VERCEL) {
      console.log('Tip: jalankan ulang dengan --update-vercel untuk mengarahkan situs Vercel ke URL ini otomatis.');
      return;
    }

    // 3) Perbarui env Vercel + redeploy (VITE_ vars dibaca saat build)
    console.log('▶ Memperbarui VITE_API_BASE di Vercel + redeploy produksi...');
    try {
      await run('npx', ['vercel', 'env', 'rm', 'VITE_API_BASE', 'production', '--yes'], { cwd: path.join(rootDir, 'client'), capture: true }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      const child = spawn('npx', ['vercel', 'env', 'add', 'VITE_API_BASE', 'production'], {
        cwd: path.join(rootDir, 'client'), shell: process.platform === 'win32', stdio: ['pipe', 'inherit', 'inherit']
      });
      child.stdin.write(`${url}\n`);
      child.stdin.end();
      await new Promise((resolve, reject) => { child.on('close', (c) => (c === 0 ? resolve() : reject(new Error('vercel env add gagal')))); child.on('error', reject); });
      await run('npx', ['vercel', '--prod', '--yes'], { cwd: path.join(rootDir, 'client') });
      console.log(`\n✓ SELESAI — https://lucivoid-audio-studio.vercel.app kini memakai backend: ${url}`);
      console.log('  Biarkan jendela ini tetap terbuka selama situs dipakai (Ctrl+C untuk mematikan).');
    } catch (error) {
      console.error(`✗ Gagal update Vercel: ${error.message}`);
      console.error('  URL tunnel tetap jalan — update manual: npx vercel env add VITE_API_BASE production');
    }
  }

  // Jaga proses tetap hidup
  server.on('close', () => { if (!shuttingDown) { console.error('⚠ Backend berhenti tiba-tiba — mematikan tunnel juga.'); shutdown(1); } });
  tunnel.on('close', () => { if (!shuttingDown) { console.error('⚠ Tunnel tertutup.'); shutdown(1); } });
}

main().catch((error) => {
  console.error('✗', error.message);
  shutdown(1);
});
