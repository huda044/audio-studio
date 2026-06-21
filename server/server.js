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
  next();
});
app.use(compression());

// Tanpa login/cookie, jadi CORS terbuka aman: API key Roblox dikirim per-request di body,
// tidak ada session/credential yang bisa dicuri lewat CORS.
app.use(cors());
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
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

app.use('/api', audioRoutes);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'Audio Studio API',
    mode: 'upload-only',
    uptime: Math.round(process.uptime()),
    uploads: Boolean(uploadsDir)
  });
});

const clientDist = process.env.CLIENT_DIST;
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
  if (status >= 500) console.error('[server-error]', _req.requestId, err.message);

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
    console.error('[cleanup-error]', error.message);
  }
}, 1000 * 60 * 30);
cleanupTimer.unref?.();

app.listen(port, () => {
  console.log(`Audio Studio API (upload-only) berjalan di http://localhost:${port}`);
});

export default app;
