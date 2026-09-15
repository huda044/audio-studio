import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import audioRoutes from './routes/audio.routes.js';
import aiRoutes from './routes/ai.routes.js';
import uploadsDir from './lib/uploadsDir.js';
import logger from './lib/logger.js';
import { resolveYtDlpPath } from './services/youtube.service.js';
import { requestLogger, metricsEndpoint, internalEndpointGuard } from './middleware/observability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = process.env.PORT || 4000;
// Tentukan clientDist lebih awal supaya middleware security-header bisa memakainya
// untuk memutuskan apakah CSP perlu dipasang (hanya saat melayani SPA).
const clientDist = process.env.CLIENT_DIST;

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  const requestId = String(req.headers['x-request-id'] || randomUUID()).slice(0, 80);
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Defense-in-depth untuk SPA. Hanya aktif saat melayani client (CLIENT_DIST ter-set),
  // supaya tidak mengganggu tooling/dev-only.
  // script-src TANPA 'unsafe-inline': satu-satunya inline script di build Vite adalah
  // module-preload polyfill — sudah dimatikan lewat build.modulePreload.polyfill=false
  // (lihat client/vite.config.js), jadi semua script bertanda src eksternal.
  // style-src masih butuh 'unsafe-inline' karena React memasang style attribute inline
  // (progress bar, skeleton, ErrorBoundary, dsb.) — CSP memblokir style attribute tanpa itu.
  if (clientDist) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "media-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        // connect-src: API sendiri + Open Cloud Roblox (untuk future client-side call jika dibutuhkan).
        "connect-src 'self' https://apis.roblox.com"
      ].join('; ')
    );
  }
  next();
});
// Lewati gzip jika route menandai X-No-Compression (mis. /api/process yang isinya
// base64 audio: gzip-nya berat di CPU & bisa membuat respons seperti "hang" lewat proxy HF).
app.use(compression({
  filter(req, res) {
    if (res.getHeader('X-No-Compression')) return false;
    return compression.filter(req, res);
  }
}));

// Tanpa login/cookie, jadi CORS terbuka aman: API key Roblox dikirim per-request di body,
// tidak ada session/credential yang bisa dicuri lewat CORS. Bila env ALLOWED_ORIGINS diisi
// (comma-separated), maka hanya origin tersebut yang diizinkan — berguna di produksi
// untuk mencegah situs pihak ketiga memakai API ini. Default tetap terbuka (backward-compatible).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));
app.use(express.json({ limit: process.env.JSON_LIMIT || '512kb' }));

// Proteksi path traversal pada file serving.
app.use('/api/files', (req, res, next) => {
  const requestedFile = path.basename(decodeURIComponent(req.path));
  if (requestedFile.includes('..') || requestedFile.includes('/') || requestedFile.includes('\\')) {
    return res.status(400).json({ error: 'Nama file tidak valid.' });
  }
  // `+ path.sep` mencegah prefix bypass klasik (mis. uploadsDir "uploads" cocok dengan
  // jalur fiktif "uploads-evil") — defense-in-depth setelah basename() di atas.
  const basePath = path.resolve(uploadsDir);
  const fullPath = path.resolve(uploadsDir, requestedFile);
  if (!fullPath.startsWith(basePath + path.sep)) {
    return res.status(403).json({ error: 'Akses file ditolak.' });
  }
  next();
});

app.use('/api/files', express.static(uploadsDir, {
  index: false,
  setHeaders(res, filePath) {
    // no-cache (bukan no-store): file hasil konversi immutable selama ada (nama ber-nanoid),
    // jadi browser boleh menyimpan + revalidasi ETag → 304. Ini memangkas undangan ulang
    // yang sama untuk WaveBar, <audio>, upload blob, dan Download ZIP dari file identik.
    // Setelah file di-sweep (>3 jam), revalidasi menghasilkan 404 yang sudah ditangani client.
    res.setHeader('Cache-Control', 'no-cache');
    if (/\.mp3$/i.test(filePath)) res.setHeader('Content-Type', 'audio/mpeg');
    else if (/\.ogg$/i.test(filePath)) res.setHeader('Content-Type', 'audio/ogg');
    else res.setHeader('Content-Type', 'application/octet-stream');
  }
}));

app.use(requestLogger);
app.use('/api', audioRoutes);
app.use('/api', aiRoutes);
// /metrics & /api/stats mengekspos metrik internal (memori, PID, antrean).
// Bila env METRICS_TOKEN di-set, keduanya menuntut token yang cocok.
app.get('/metrics', internalEndpointGuard, metricsEndpoint);

// Route /api yang tidak dikenal harus balas JSON 404, BUKAN jatuh ke catch-all SPA
// (yang akan mengirim index.html dan membuat client gagal parse JSON).
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint API tidak ditemukan.', status: 404 });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'Audio Studio API',
    mode: 'upload-only',
    uptime: Math.round(process.uptime()),
    uploads: Boolean(uploadsDir)
  });
});

if (clientDist) {
  // Aset ber-hash (js/css/img) boleh di-cache lama, tapi index.html JANGAN pernah di-cache
  // supaya browser/CDN HF selalu mengambil bundle terbaru (mencegah bug "stale bundle").
  app.use(express.static(clientDist, {
    index: false,
    setHeaders(res, filePath) {
      // Service worker WAJIB no-cache agar update PWA terdeteksi segera.
      if (filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      } else if (/\.(js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  // Catch-all SPA: semua rute non-API mengembalikan index.html.
  // Express 5 menuntut wildcard bernama ('/*splat'); pola lama '*' menimbulkan
  // PathError saat boot, dan '/*splat' saja TIDAK mencocokkan root '/' (terbukti
  // 404 pada uji pertama) — karena itu rute '/' didaftarkan eksplisit di bawah.
  const sendSpa = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'), (error) => {
      if (error) next(error);
    });
  };
  app.get('/', sendSpa);
  app.get('/*splat', sendSpa);
}

app.use((err, _req, res, _next) => {
  let status = err.status || 500;
  if (err.type === 'entity.parse.failed') status = 400;
  if (err.code === 'LIMIT_UNEXPECTED_FILE') status = 400;
  if (err.message?.startsWith?.('Format file harus')) status = 400;

  const message = err.code === 'LIMIT_FILE_SIZE'
    ? 'File terlalu besar untuk limit server saat ini.'
    : err.type === 'entity.parse.failed'
      ? 'JSON request tidak valid.'
      : status === 500 ? 'Terjadi kesalahan server.' : err.message;
  if (err.retryAfter) res.setHeader('Retry-After', err.retryAfter);
  if (status >= 500) logger.error('server error', { requestId: _req.requestId, error: err.message, stack: err.stack });

  const body = { error: message, status, requestId: _req.requestId };
  // Kode terstruktur ikut dikirim bila ada (mis. youtube_blocked) supaya client bisa
  // bereaksi berbeda — menawarkan jalur upload file, bukan sekadar menampilkan teks.
  if (typeof err.code === 'string' && err.code) body.code = err.code;
  if (err.details && (status < 500 || process.env.EXPOSE_ERROR_DETAILS === 'true')) body.details = err.details;
  res.status(status).json(body);
});

// Sweep file sementara di uploads/. Tiga kelas file menumpuk di sini:
//   1. upload mentah user (nama hex multer, tanpa ekstensi)
//   2. sumber YouTube hasil unduhan (yt-*.mp4) — dihapus di finally route, tapi
//      tetap tertinggal bila proses mati paksa di tengah jalan
//   3. master-* (file kerja internal sebelum dipotong jadi part)
// Semuanya cukup dihapus berdasarkan umur. Dijalankan SEKALI SAAT BOOT lalu berkala:
// tanpa sapuan saat boot, file yang tertinggal dari sesi sebelumnya (mis. .bat
// ditutup di tengah konversi) menumpuk tanpa batas — pernah kejadian 1.2 GB.
const UPLOAD_TTL_MS = Math.max(60 * 1000, Number(process.env.UPLOAD_TTL_MS || 1000 * 60 * 60 * 3));
const CLEANUP_INTERVAL_MS = Math.max(60 * 1000, Number(process.env.CLEANUP_INTERVAL_MS || 1000 * 60 * 10));

async function sweepUploads(reason = 'berkala') {
  const now = Date.now();
  let removed = 0;
  let freedBytes = 0;
  try {
    const files = await fs.readdir(uploadsDir);
    await Promise.all(files.map(async (file) => {
      if (file === '.gitkeep') return;
      const fullPath = path.join(uploadsDir, file);
      try {
        const stat = await fs.stat(fullPath);
        // File kerja internal (master-* dan sumber yt-*) TIDAK berguna begitu prosesnya
        // berhenti — konversi yang terputus (koneksi putus, .bat ditutup) meninggalkan
        // file ini tanpa pemilik. Saat boot, semuanya pasti yatim, jadi disapu tanpa
        // menunggu TTL; saat berkala, ambang yang lebih pendek dari TTL juga cukup.
        const isWorkFile = /^(master-|yt-)/.test(file);
        const maxAge = isWorkFile && reason === 'saat boot' ? 0 : UPLOAD_TTL_MS;
        if (now - stat.mtimeMs > maxAge) {
          await fs.unlink(fullPath);
          removed += 1;
          freedBytes += stat.size;
        }
      } catch (error) {
        // File bisa hilang di antara readdir & stat (race dengan request lain) — abaikan.
        if (error.code !== 'ENOENT') throw error;
      }
    }));
    // Catat hanya bila ada yang dibersihkan, supaya log tidak banjir tiap 10 menit.
    if (removed) {
      logger.info('sweep uploads', {
        reason,
        removed,
        freedMb: Math.round(freedBytes / 1024 / 1024)
      });
    }
  } catch (error) {
    logger.error('cleanup failed', { reason, error: error.message });
  }
}

sweepUploads('saat boot');
const cleanupTimer = setInterval(() => sweepUploads(), CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

const server = app.listen(port, () => {
  logger.info('server started', { port, mode: 'upload-only', uploadsDir: Boolean(uploadsDir) });
});

// Tahan crash satu-error: backend ini berjalan tanpa process manager (jendela .bat),
// jadi satu promise yang gagal atau error async tak terduga TIDAK boleh mematikan
// seluruh server — itu membuat seluruh situs mati sampai user sadar dan menjalankan
// ulang .bat. Trade-off yang disengaja: proses tetap hidup, errornya dicatat penuh
// di jendela .bat supaya bisa didiagnosis.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection (server tetap hidup)', {
    error: reason?.message || String(reason),
    stack: reason?.stack?.split('\n').slice(0, 4).join(' | ')
  });
});
process.on('uncaughtException', (error) => {
  logger.error('uncaught exception (server tetap hidup)', {
    error: error?.message,
    stack: error?.stack?.split('\n').slice(0, 4).join(' | ')
  });
});

// Versi yt-dlp tercatat saat boot: binary yang tua adalah penyebab gagal import
// YouTube yang paling umum (extractor YouTube berubah terus) — dengan ini
// keusangannya langsung terlihat di jendela .bat, tidak perlu menduga-duga.
execFile(resolveYtDlpPath(), ['--version'], { timeout: 15000, windowsHide: true }, (error, stdout) => {
  if (error) {
    logger.warn('yt-dlp tidak ditemukan — fitur import YouTube nonaktif', {
      hint: 'letakkan binary di server/bin/yt-dlp.exe atau set env YTDL_PATH'
    });
  } else {
    logger.info('yt-dlp siap', { version: String(stdout).trim(), path: resolveYtDlpPath() });
  }
});

// Graceful shutdown: berhenti menerima koneksi baru, beri waktu drain queue, lalu tutup.
// Penting untuk HF Space cold-restart & `docker stop` supaya tidak ada request yang dipotong
// mendadak atau konversi FFmpeg yang tertinggal zombie.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutdown received', { signal });
  clearInterval(cleanupTimer);
  // Sapu file kerja yang tersisa saat mati normal (Ctrl+C di jendela .bat). File
  // ber-umur pendek ini (master-*, sumber yt-*, upload mentah) tidak berguna setelah
  // proses berhenti, dan menumpuk bila tiap sesi meninggalkan sisa.
  sweepUploads('saat shutdown').finally(() => {
    // Beri waktu singkat bagi request in-flight sebelum menutup socket.
    server.close((err) => {
      if (err) logger.error('shutdown close error', { error: err.message });
      else logger.info('shutdown clean');
      process.exit(err ? 1 : 0);
    });
  });
  // Hard stop bila setelah batas waktu masih ada koneksi nge-hang.
  setTimeout(() => {
    logger.warn('shutdown force exit');
    process.exit(1);
  }, Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000)).unref();
}
['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

export default app;
