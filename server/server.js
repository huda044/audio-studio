import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import audioRoutes from './routes/audio.routes.js';
import aiRoutes from './routes/ai.routes.js';
import logger from './lib/logger.js';
import { requestLogger, metricsEndpoint } from './middleware/observability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function resolveUploadsDir() {
  const fsSync = await import('node:fs');
  const candidates = [];
  if (process.env.UPLOADS_DIR) candidates.push(process.env.UPLOADS_DIR);
  candidates.push(path.join(rootDir, 'uploads'));
  candidates.push(path.join(os.tmpdir(), 'audio-studio-uploads'));
  for (const dir of candidates) {
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.access(dir, fsSync.constants.W_OK);
      return dir;
    } catch {
      // try next
    }
  }
  return path.join(os.tmpdir(), 'audio-studio-uploads');
}

const uploadsDir = await resolveUploadsDir();
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
  // supaya tidak mengganggu tooling/dev-only. 'unsafe-inline' diperlukan karena Vite
  // menyuntikkan script preload & style bootstrap inline.
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
        "script-src 'self' 'unsafe-inline'",
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
  const fullPath = path.resolve(uploadsDir, requestedFile);
  if (!fullPath.startsWith(path.resolve(uploadsDir))) {
    return res.status(403).json({ error: 'Akses file ditolak.' });
  }
  next();
});

app.use('/api/files', express.static(uploadsDir, {
  index: false,
  setHeaders(res, filePath) {
    res.setHeader('Cache-Control', 'no-store');
    if (!/\.ogg$/i.test(filePath)) {
      res.setHeader('Content-Type', 'application/octet-stream');
    }
  }
}));

app.use(requestLogger);
app.use('/api', audioRoutes);
app.use('/api', aiRoutes);
app.get('/metrics', metricsEndpoint);

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
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      } else if (/\.(js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  app.get('*', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
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
  if (err.details && (status < 500 || process.env.EXPOSE_ERROR_DETAILS === 'true')) body.details = err.details;
  res.status(status).json(body);
});

const cleanupTimer = setInterval(async () => {
  const maxAgeMs = 1000 * 60 * 60 * 3;
  const now = Date.now();
  try {
    const files = await fs.readdir(uploadsDir);
    await Promise.all(files.map(async (file) => {
      if (file === '.gitkeep') return;
      const fullPath = path.join(uploadsDir, file);
      const stat = await fs.stat(fullPath);
      if (now - stat.mtimeMs > maxAgeMs) await fs.unlink(fullPath);
    }));
  } catch (error) {
    logger.error('cleanup failed', { error: error.message });
  }
}, 1000 * 60 * 30);
cleanupTimer.unref?.();

const server = app.listen(port, () => {
  logger.info('server started', { port, mode: 'upload-only', uploadsDir: Boolean(uploadsDir) });
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
  // Beri waktu singkat bagi request in-flight sebelum menutup socket.
  server.close((err) => {
    if (err) logger.error('shutdown close error', { error: err.message });
    else logger.info('shutdown clean');
    process.exit(err ? 1 : 0);
  });
  // Hard stop bila setelah batas waktu masih ada koneksi nge-hang.
  setTimeout(() => {
    logger.warn('shutdown force exit');
    process.exit(1);
  }, Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000)).unref();
}
['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

export default app;
