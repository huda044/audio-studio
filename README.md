---
title: Audio Studio
emoji: 🎧
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Audio Studio

Audio Studio adalah aplikasi full-stack untuk mengambil audio dari YouTube atau upload file lokal, memprosesnya dengan FFmpeg, menampilkan preview waveform, lalu mengunggah hasilnya ke Roblox Open Cloud Audio API.

## Prasyarat

- Node.js 18+
- FFmpeg tersedia di PATH
- yt-dlp tersedia di PATH untuk download YouTube

Jika FFmpeg atau yt-dlp belum ada di PATH, install terlebih dahulu lalu restart terminal.

## Instalasi

```bash
cd server
npm install

cd ../client
npm install
```

## Menjalankan

Terminal 1:

```bash
cd server
npm run dev
```

Terminal 2:

```bash
cd client
npm run dev
```

Buka URL Vite yang muncul, biasanya `http://localhost:5173`.

## Deploy

Project ini dideploy dalam dua bagian: frontend React di Vercel, backend Express di Hugging Face Space (Docker).

### Frontend di Vercel

1. Push project ke GitHub.
2. Buka Vercel, pilih **Add New Project**, lalu pilih repo ini.
3. Set **Root Directory** ke `client`.
4. Tambahkan Environment Variable:

   ```bash
   VITE_API_BASE=https://<username>-<space-name>.hf.space
   VITE_GOOGLE_CLIENT_ID=<opsional>
   ```

5. Deploy. Vercel akan build folder `client` dengan Vite dan publish `dist`.

### Backend di Hugging Face Space (Docker)

Backend memakai FFmpeg, yt-dlp, dan upload file, jadi tidak cocok untuk Vercel serverless. Repo ini sudah punya `Dockerfile` dan front-matter HF Space di `README.md` (`sdk: docker`, `app_port: 7860`).

1. Buat Space baru di Hugging Face dengan SDK **Docker**.
2. Push repo ini ke Space (atau hubungkan dari GitHub).
3. Di Space Settings → Variables and secrets, isi minimal:

   ```bash
   CLIENT_ORIGIN=https://<frontend-vercel>.vercel.app
   APP_PUBLIC_URL=https://<frontend-vercel>.vercel.app
   JWT_SECRET=<random-panjang-stabil>
   SECRETS_MASTER_KEY=<output node server/scripts/generate-master-key.mjs>
   DATABASE_URL=postgres://user:pass@host:5432/db
   GOOGLE_CLIENT_ID=<opsional>
   ADMIN_BOOTSTRAP_USERNAME=admin
   ADMIN_BOOTSTRAP_EMAIL=admin@example.com
   ADMIN_BOOTSTRAP_PASSWORD=<password-admin-kuat>
   ```

4. Build Space. Container akan listen di port `7860` dan expose API di URL Space, contoh `https://<username>-<space-name>.hf.space`.
5. Pakai URL itu sebagai `VITE_API_BASE` di Vercel, lalu redeploy frontend.

Catatan penting:

- HF Space free tidak punya persistent disk untuk `/data`. Selalu isi `DATABASE_URL` dari PostgreSQL managed (Neon/Supabase/Railway/Render DB) supaya akun, API key Roblox terenkripsi, group/creator id, history, dan invoice tidak hilang saat Space rebuild atau restart.
- `SECRETS_MASTER_KEY` wajib tetap sama antar deploy, kalau berubah API key Roblox lama tidak bisa didekripsi.
- HF Space free bisa sleep saat idle. Request pertama setelah idle akan lebih lambat karena cold start container.
- Detail troubleshooting yt-dlp/cookies/PO token ada di `server/README_DEPLOY.md`.

Untuk lokal, contoh env tersedia di `client/.env.example` dan `server/.env.example`.

## Pengembangan

Lint, format, dan test tersedia di masing-masing folder:

```bash
# Server (Express)
cd server
npm run lint          # ESLint
npm run format        # Prettier (tulis ulang)
npm test              # node --test (unit test)

# Client (React + Vite)
cd client
npm run lint          # ESLint (+ React Hooks)
npm run build         # build produksi
```

CI di GitHub Actions (`.github/workflows/ci.yml`) menjalankan lint + test untuk server dan lint + build untuk client pada setiap push ke `main` dan setiap pull request.

## Endpoint Backend

- `GET /api/youtube-info?url=...` mengambil judul, thumbnail, dan durasi YouTube.
- `POST /api/process` menerima file audio atau URL YouTube plus pengaturan efek, lalu mengembalikan audio `.ogg` yang sudah diproses.
- `POST /api/upload-roblox` menerima audio hasil proses dan kredensial Roblox Open Cloud, auto-split jika perlu, lalu mengembalikan `rbxassetid://...`.

## Catatan Keamanan

- API key Roblox tidak dilog server dan tidak dikirim balik ke browser.
- API key Roblox disimpan terenkripsi server-side memakai `SECRETS_MASTER_KEY`.
- `JWT_SECRET` wajib di-set ke string random panjang saat `NODE_ENV=production`. Server akan menolak start kalau `JWT_SECRET` kosong atau masih nilai default, supaya token auth tidak bisa dipalsukan.
- Pastikan `SECRETS_MASTER_KEY` tidak berubah antar deploy, supaya API key lama masih bisa didekripsi.
- File sementara di folder `uploads` dibersihkan otomatis secara berkala.
