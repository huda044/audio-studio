# Deployment Guide

Panduan deployment Audio Studio ke berbagai platform.

## Prerequisites

- Docker installed (untuk Docker deployment)
- Node.js 18+ (untuk VPS manual deployment)
- FFmpeg & ffprobe (otomatis via npm packages)

## Local Development

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Start servers (2 terminal)
cd server && npm run dev    # Terminal 1 - Backend
cd client && npm run dev    # Terminal 2 - Frontend
```

Buka `http://localhost:5173` (Vite dev server).

## Vercel Deployment (Frontend Saja — REKOMENDASI)

> **PENTING — arsitektur yang benar:** Vercel hanya untuk **frontend statis** (client).
> Backend Express **tidak bisa** jalan sebagai Vercel Serverless Function karena:
> upload hingga 250 MB (limit body Vercel ±4,5 MB), konversi ffmpeg hingga 10 menit
> (limit eksekusi function jauh lebih pendek), task queue in-memory (hilang antar
> invocation), dan disk ephemeral. Backend tetap di-host yang mendukung proses
> jangka panjang: Hugging Face Space (Docker), VPS Oracle (docker-compose), atau
> host lain — cukup satu instance.

### 1. Deploy frontend

```bash
cd client
npm i -g vercel      # bila CLI belum ada
vercel login         # sekali saja (browser)
vercel --prod
```

Konfigurasi sudah siap di `client/vercel.json` (build Vite, cache asset immutable,
header keamanan).

### 2. Arahkan frontend ke backend

Saat project Vercel ditanya **Environment Variable**, tambahkan:

| Variable | Contoh nilai | Fungsi |
|----------|--------------|--------|
| `VITE_API_BASE` | `https://username-audio-studio.hf.space` | Base URL backend (trailing slash otomatis dibuang) |

Alternatif tanpa env var: tambahkan proxy rewrite di `client/vercel.json` sehingga
panggilan `/api/*` diteruskan ke backend (bebas CORS):

```json
"rewrites": [
  { "source": "/api/(.*)", "destination": "https://<HOST-BACKEND>/api/$1" },
  { "source": "/(.*)", "destination": "/index.html" }
]
```

### 3. Backend di sisi lain

Pastikan `ALLOWED_ORIGINS` di backend memuat domain Vercel
(mis. `https://audio-studio.vercel.app`) bila tidak memakai pendekatan proxy di atas,
dan set `METRICS_TOKEN` untuk melindungi `/metrics` & `/api/stats`.

## Docker Deployment (Recommended — untuk backend)

### Build Image

```bash
docker build -t audio-studio .
```

### Run Container

```bash
docker run -d \
  --name audio-studio \
  -p 7860:7860 \
  -v $(pwd)/uploads:/app/uploads \
  -e PORT=7860 \
  -e AI_API_KEY=your-key \
  audio-studio
```

### Docker Compose

```bash
docker-compose up -d
```

## Hugging Face Space Deployment

1. Buat Space baru di [huggingface.co](https://huggingface.co/new-space)
2. Pilih SDK: **Docker**
3. Set port: **7860**
4. Clone Space repo:
```bash
git clone https://huggingface.co/spaces/yourusername/audio-studio
cd audio-studio
```

5. Copy semua file project ke Space repo
6. Commit & push:
```bash
git add .
git commit -m "Deploy Audio Studio"
git push
```

7. Set Secrets di Space Settings:
   - `AI_API_KEY` (opsional)
   - `AI_MODEL` (opsional)
   - `AI_BASE_URL` (opsional)

8. Space akan auto-build & deploy

## VPS Deployment (Manual)

### 1. Setup Server

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone repo
git clone https://github.com/yourusername/audio-studio.git
cd audio-studio
```

### 2. Build Client

```bash
cd client
npm install
npm run build
```

### 3. Setup Server

```bash
cd ../server
npm install --production
cp .env.example .env
# Edit .env
```

### 4. Configure Environment

Edit `server/.env`:
```env
PORT=7860
CLIENT_DIST=../client/dist
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com
```

### 5. Start with PM2

```bash
pm2 start server.js --name audio-studio
pm2 save
pm2 startup
```

### 6. Setup Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:7860;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 7. Setup SSL (Let's Encrypt)

```bash
sudo certbot --nginx -d yourdomain.com
```

## Environment Variables Reference

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | Server port |
| `CLIENT_DIST` | - | Path ke built client |
| `UPLOADS_DIR` | - | Custom uploads directory |
| `MAX_UPLOAD_MB` | 250 | Max upload size (MB) |
| `INLINE_AUDIO_LIMIT_MB` | 8 | Max size for inline base64 per part (MB) |
| `INLINE_AUDIO_TOTAL_LIMIT_MB` | 16 | Max total inline base64 across all parts in one response (MB) — parts beyond the budget stay accessible via `/api/files/` URLs |
| `METRICS_TOKEN` | - | Bila di-set, endpoint `/metrics` menuntut header `X-Metrics-Token` atau `Authorization: Bearer <token>` yang cocok (timing-safe) |
| `NODE_ENV` | - | Environment (production) |
| `ALLOWED_ORIGINS` | - | CORS whitelist (comma-separated) |
| `JSON_LIMIT` | 512kb | Max JSON body size |
| `CONVERSION_CONCURRENCY` | 2 | Parallel conversions |
| `CONVERSION_QUEUE_LIMIT` | 20 | Max queued conversions |
| `ROBLOX_UPLOAD_CONCURRENCY` | 1 | Parallel Roblox uploads |
| `ROBLOX_UPLOAD_QUEUE_LIMIT` | 15 | Max queued uploads |
| `PROCESS_RATE_LIMIT` | 30 | Process requests per 30min |
| `UPLOAD_RATE_LIMIT` | 60 | Upload requests per 30min |
| `INFO_RATE_LIMIT` | 60 | Info requests per min |
| `STATS_RATE_LIMIT` | 20 | Stats requests per min |
| `FFMPEG_TIMEOUT_MS` | 600000 | FFmpeg timeout (ms) |
| `MAX_OUTPUT_SECONDS` | 3600 | Max output duration (s) |
| `APP_MAX_DURATION_SECONDS` | 200 | Max source duration (s) |
| `ROBLOX_AUDIO_MAX_DURATION_SECONDS` | 420 | Roblox max audio duration (s) |
| `ROBLOX_AUDIO_MAX_BYTES` | 19922944 | Roblox max audio size (bytes) |
| `ROBLOX_UPLOAD_TIMEOUT_MS` | 60000 | Roblox upload timeout (ms) |
| `ROBLOX_POLL_TIMEOUT_MS` | 240000 | Roblox poll timeout (ms) |
| `ROBLOX_POLL_INTERVAL_MS` | 2500 | Roblox poll interval (ms) |
| `SHUTDOWN_TIMEOUT_MS` | 10000 | Graceful shutdown timeout (ms) |
| `AI_API_KEY` | - | AI provider API key |
| `AI_MODEL` | - | AI model name |
| `AI_BASE_URL` | - | AI provider base URL |

### Client

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE` | - | API base URL untuk dev |

## Troubleshooting

### FFmpeg tidak jalan

```bash
# Cek log server untuk:
# [ffmpeg] binary: ... OK/MISSING
```

Jika MISSING:
```bash
cd server
npm rebuild ffmpeg-static ffprobe-static
```

### Upload gagal (413)

- Kurangi `MAX_UPLOAD_MB` di server
- Cek Nginx `client_max_body_size` (VPS)

### Audio tidak bisa diputar

- Pastikan browser support OGG
- Cek network tab untuk 404 di `/api/files/`

### Rate limit tercapai

- Tunggu 30 menit (process/upload)
- Atau restart server (clears in-memory rate limit)

### Roblox upload gagal

- Cek API key validity di Settings
- Pastikan API key punya `asset:write` permission
- Cek User ID / Group ID benar

### Memory tinggi di server

```bash
# Cek stats
curl http://localhost:7860/api/stats

# Restart jika perlu
pm2 restart audio-studio
```
