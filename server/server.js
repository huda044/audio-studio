import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import audioRoutes from './routes/audio.routes.js';
import accountRoutes from './routes/account.routes.js';
import adminRoutes from './routes/admin.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const uploadsDir = process.env.VERCEL ? path.join(os.tmpdir(), 'audio-studio-uploads') : path.join(rootDir, 'uploads');
const port = process.env.PORT || 4000;

await fs.mkdir(uploadsDir, { recursive: true });

const configuredOrigins = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const allowedOrigins = configuredOrigins
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin tidak diizinkan oleh CORS.'));
  }
}));
app.use(express.json({ limit: process.env.JSON_LIMIT || '512kb' }));
app.use('/api/files', express.static(uploadsDir, {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  }
}));
app.use('/api', accountRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', audioRoutes);

app.get('/health', (_req, res) => {
  res.json({ ok: true, name: 'Audio Studio API' });
});

const clientDist = process.env.CLIENT_DIST;
if (clientDist) {
  app.use(express.static(clientDist));
  app.get('*', async (_req, res, next) => {
    try {
      res.sendFile(path.join(clientDist, 'index.html'));
    } catch (error) {
      next(error);
    }
  });
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message = err.code === 'LIMIT_FILE_SIZE'
    ? 'File terlalu besar untuk limit server saat ini.'
    : status === 500 ? 'Terjadi kesalahan server.' : err.message;
  if (status >= 500) console.error('[server-error]', err.message);
  res.status(status).json({ error: message });
});

setInterval(async () => {
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

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Audio Studio API berjalan di http://localhost:${port}`);
  });
}

export default app;
