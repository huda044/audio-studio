---
title: Audio Studio
emoji: 🎧
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Audio Studio

Aplikasi untuk **upload file audio**, memprosesnya dengan FFmpeg (kecepatan, pitch, EQ, fade, efek), preview waveform, lalu mengunggah hasilnya ke **Roblox Open Cloud Audio API**.

Mode aplikasi: **upload-only, tanpa login**. API key Roblox, creator/User ID, dan daftar komunitas/grup disimpan di **browser/perangkat** pengguna (localStorage) — tidak ada akun, tidak ada database.

## Prasyarat (lokal)

- Node.js 18+
- FFmpeg & ffprobe disediakan otomatis lewat paket npm `ffmpeg-static` & `ffprobe-static`.

## Instalasi & menjalankan

```bash
cd server && npm install
cd ../client && npm install
```

Terminal 1 (backend):

```bash
cd server && npm run dev
```

Terminal 2 (frontend):

```bash
cd client && npm run dev
```

Buka URL Vite (default `http://localhost:5173`). Set `VITE_API_BASE=http://localhost:4000` di `client/.env` saat dev terpisah.

## Deploy (Hugging Face Space / Docker / VPS)

`Dockerfile` membangun client lalu menyajikannya dari Express (satu container, satu port `7860`). Cukup satu tempat deploy — tidak butuh database.

1. Build image dari root repo.
2. Container listen di `7860`, serve frontend + API.
3. Env opsional ada di `server/.env.example` (semua punya default wajar).

Tidak ada env wajib untuk fungsi dasar. Tinggal jalan.

## Endpoint Backend

- `POST /api/process` — upload file audio + setting efek → kembalikan audio `.ogg` yang sudah diproses.
- `POST /api/upload-roblox` — terima audio hasil proses + API key (sekali pakai) + creator → upload ke Roblox, auto-split bila perlu.
- `POST /api/roblox-test` — cek validitas API key & target creator.
- `POST /api/asset-status` — cek status moderasi `operationId`.
- `GET /health` — status server.

## Catatan Keamanan

- Tanpa login: API key Roblox disimpan di browser pengguna (disamarkan) dan dikirim ke server **hanya saat upload** — server tidak menyimpannya.
- Karena tersimpan di browser, jangan pakai API key penting di perangkat publik/bersama.
- Tidak ada sesi/cookie, sehingga CORS dibuka tanpa risiko pencurian sesi.
- File audio sementara di `uploads` dibersihkan otomatis secara berkala.
