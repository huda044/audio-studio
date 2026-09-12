#!/usr/bin/env node
// local-tunnel.js — nyalakan backend di PC ini + expose via Cloudflare Tunnel,
// lalu (opsional) arahkan frontend Vercel ke URL tunnel tersebut.
//
// Pemakaian:
//   node scripts/local-tunnel.js                   → server + tunnel saja (URL dicetak)
//   node scripts/local-tunnel.js --update-vercel   → + set VITE_API_BASE di Vercel & redeploy produksi
//
// Keamanan penting:
// - URL Vercel HANYA diperbarui setelah tunnel terbukti melayani /health 200.
//   Kegagalan quick-tunnel (mis. timeout api.trycloudflare.com) tidak akan pernah
//   mengarahkan produksi ke URL mati.
// - Quick tunnel di-retry beberapa kali bila permintaan awal gagal.
// - URL trycloudflare berubah tiap restart; karena itu --update-vercel wajib
//   dijalankan ulang setiap kali backend dinyalakan.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const UPDATE_VERCEL = process.argv.includes('--update-vercel');
const PORT = process.env.PORT || 4000;
const TUNNEL_RETRIES = Math.max(1, Number(process.env.TUNNEL_RETRIES || 4));
const CLIENT_DIR = path.join(rootDir, 'client');
const CLOUDFLARED = path.join(rootDir, 'tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');

// Quick-tunnel host = beberapa slug kata yang dipisah tanda hubung, mis.
// down-nut-tablets-held. Dikecualikan: api. (muncul di pesan error cloudflared).
const TUNNEL_URL_RE = /https:\/\/(?!api\.)[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com(?![a-z0-9./-])/i;

function runShell(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: CLIENT_DIR, shell: true });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} keluar dengan kode ${code}`))));
  });
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Satu percobaan tunnel: spawn cloudflared, pantau outputnya.
// - Jika URL valid muncul → resolve({ url, child }) TANPA membunuh child
//   (child ini yang akan melayani trafik; dipertahankan hidup).
// - Jika child berhenti sebelum URL muncul → resolve({ url: null }).
// - Jika child gagal dibuat URL dalam timeout → child dibunuh, resolve({ url: null }).
function tryTunnelOnce(attempt) {
  return new Promise((resolve) => {
    let url = '';
    let settled = false;
    const settle = (value) => { if (!settled) { settled = true; resolve(value); } };

    console.log(`▶ [percobaan ${attempt}/${TUNNEL_RETRIES}] Meminta quick tunnel Cloudflare...`);
    const child = spawn(CLOUDFLARED, ['tunnel', '--url', `http://127.0.0.1:${PORT}`, '--no-autoupdate'], { shell: false });

    const onText = (d) => {
      const t = String(d);
      const m = t.match(TUNNEL_URL_RE);
      if (m && !url) {
        url = m[0];
        settle({ url, child }); // child dibiarkan hidup
        return;
      }
      if (!url && /failed to request quick tunnel|context deadline|error|unable to/i.test(t)) {
        console.log(`[tunnel] ${t.trim().slice(0, 200)}`);
      }
    };
    child.stdout.on('data', onText);
    child.stderr.on('data', onText);
    child.on('error', (e) => { console.log(`[tunnel] spawn error: ${e.message}`); settle({ url: null }); });

    // Child berhenti sendiri: bila kita sudah punya URL (seharusnya tidak), jaga child;
    // jika belum, ini kegagalan → caller akan retry & spawn baru.
    child.on('close', () => {
      if (!url) settle({ url: null });
      // bila url sudah ter-set, settle sudah dipanggil; child mati di sini berarti
      // tunnel putus — signal ke caller lewat event 'tunnelClosed' di main loop.
    });

    // Bila URL tidak muncul dalam 40 detik → bunuh child ini (belum berguna), retry.
    const guard = setTimeout(() => {
      if (!url) { try { child.kill(); } catch { /* ignore */ } settle({ url: null }); }
    }, 40000);
    child.once('close', () => clearTimeout(guard));
    // Simpan kill-on-shutdown HANYA bila child ini akhirnya dibuang (gagal);
    // child sukses dikelola oleh main loop (dibunuh saat shutdown lewat daftar global).
    const killIfDiscarded = () => { if (!url) { try { child.kill(); } catch { /* ignore */ } } };
    cleanupFns.push(killIfDiscarded);
  });
}

// Verifikasi URL benar-benar melayani /health. Routing tunnel butuh beberapa detik,
// dan saat Cloudflare lambat bisa lebih lama — kita beri ~60 detik + catat statusnya.
async function verifyTunnelHealth(url) {
  let lastStatus = '?';
  for (let i = 0; i < 24; i += 1) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
      lastStatus = String(res.status);
      if (res.ok) {
        try { const j = await res.json(); if (j && j.ok) return true; } catch { /* status 200 sudah cukup */ return true; }
      }
    } catch (e) {
      lastStatus = e.name === 'TimeoutError' ? 'timeout' : 'err';
    }
    process.stdout.write(`\r   menunggu routing tunnel… [${i + 1}/24] status=${lastStatus}   `);
    await sleep(2500);
  }
  process.stdout.write('\n');
  return false;
}

async function startServer() {
  console.log(`▶ Menjalankan backend lokal di port ${PORT}...`);
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(rootDir, 'server') });
  child.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  child.stderr.on('data', (d) => process.stdout.write(`[server] ${d}`));
  child.on('close', () => { if (!shuttingDown) { console.error('⚠ Backend berhenti tiba-tiba.'); shutdown(1); } });
  cleanupFns.push(() => { try { child.kill(); } catch { /* ignore */ } });

  for (let i = 0; i < 40; i += 1) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) { console.log('✓ Backend siap.\n'); return; }
    } catch { /* belum siap */ }
  }
  throw new Error('Backend tidak merespons /health dalam 20 detik.');
}

async function updateVercel(url) {
  console.log('▶ Memperbarui VITE_API_BASE di Vercel + redeploy produksi...');
  try {
    // env rm dulu (abaikan error bila belum ada), lalu env add dengan nilai stdin.
    const rm = spawn('npx', ['vercel', 'env', 'rm', 'VITE_API_BASE', 'production', '--yes'], { cwd: CLIENT_DIR, shell: true });
    await new Promise((r) => rm.on('close', r));
    await new Promise((resolve, reject) => {
      const child = spawn('npx', ['vercel', 'env', 'add', 'VITE_API_BASE', 'production'], { cwd: CLIENT_DIR, shell: true, stdio: ['pipe', 'inherit', 'inherit'] });
      child.stdin.write(`${url}\n`);
      child.stdin.end();
      child.on('close', (c) => (c === 0 ? resolve() : reject(new Error('vercel env add gagal'))));
      child.on('error', reject);
    });
    await runShell('npx', ['vercel', '--prod', '--yes']);
    console.log(`\n✓ SELESAI — https://lucivoid-audio-studio.vercel.app kini memakai backend: ${url}`);
    console.log('  Biarkan jendela ini tetap terbuka selama situs dipakai (Ctrl+C untuk mematikan).');
  } catch (error) {
    console.error(`✗ Gagal update Vercel: ${error.message}`);
    console.error(`  Tunnel tetap jalan di ${url} — update manual bila perlu:`);
    console.error('  cd client && npx vercel env add VITE_API_BASE production');
  }
}

async function main() {
  await startServer();

  let workingUrl = '';
  for (let attempt = 1; attempt <= TUNNEL_RETRIES && !workingUrl; attempt += 1) {
    const { url, child } = await tryTunnelOnce(attempt);
    if (!url) {
      console.log(`  percobaan ${attempt} gagal (quick-tunnel tidak terbentuk).`);
      if (attempt < TUNNEL_RETRIES) { console.log('  menunggu 3 detik lalu coba lagi...'); await sleep(3000); }
      continue;
    }
    console.log(`\n🔗 URL kandidat: ${url} — memverifikasi kesehatan...`);
    const healthy = await verifyTunnelHealth(url);
    if (!healthy) {
      console.log('  Tunnel tidak melayani /health, mencoba ulang...');
      try { child.kill(); } catch { /* ignore */ }
      continue;
    }
    // Sukses: child ini melayani trafik, pertahankan hidup.
    workingUrl = url;
    cleanupFns.push(() => { try { child.kill(); } catch { /* ignore */ } });
    child.on('close', () => { if (!shuttingDown) { console.error('\n⚠ Koneksi tunnel terputus. Menutup — jalankan ulang skrip ini.'); shutdown(1); } });
    console.log(`\n==============================================`);
    console.log(`✓ BACKEND PUBLIK SEHAT: ${workingUrl}`);
    console.log(`  Cek kesehatan: ${workingUrl}/health`);
    console.log(`==============================================\n`);
  }

  if (!workingUrl) {
    console.error('✗ Semua percobaan quick tunnel gagal (kemungkinan koneksi Cloudflare sementara bermasalah).');
    console.error('  Backend lokal tetap jalan di http://127.0.0.1:' + PORT + ' — jalankan ulang skrip untuk tunnel.');
    return shutdown(1);
  }

  if (UPDATE_VERCEL) {
    await updateVercel(workingUrl);
  } else {
    console.log('Tip: tambahkan --update-vercel agar situs Vercel otomatis diarahkan ke URL ini.');
  }
  console.log('\nBackend & tunnel AKTIF. Jendela ini harus tetap terbuka. Tekan Ctrl+C untuk menghentikan.');
}

main().catch((error) => {
  console.error('✗', error.message);
  shutdown(1);
});
