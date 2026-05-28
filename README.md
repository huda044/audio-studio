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

## Deploy Gratis

Frontend React bisa dipublish ke Vercel gratis dari folder `client`.

1. Push project ke GitHub.
2. Buka Vercel, pilih **Add New Project**.
3. Pilih repository project ini.
4. Set **Root Directory** ke `client`.
5. Tambahkan Environment Variable:

```bash
VITE_API_BASE=https://url-backend-kamu
```

Backend Express sebaiknya dipublish ke hosting Node terpisah seperti Render, Railway, Fly.io, atau VPS kecil, karena proses audio memakai FFmpeg, upload file, temporary storage, dan request yang bisa lama. Setelah backend online, isi URL frontend Vercel ke env backend:

```bash
CLIENT_ORIGIN=https://nama-project.vercel.app
```

Untuk lokal, contoh env tersedia di `client/.env.example` dan `server/.env.example`.

Deployment saat ini:

- Frontend: `https://client-daax4042s-projects.vercel.app`
- Backend API: `https://server-eight-nu-65.vercel.app`

Catatan Vercel gratis: backend audio berjalan sebagai serverless function. File pendek sampai sedang cocok untuk testing, preview, dan upload ringan.

Untuk mode public yang lebih kuat dan masih gratis, gunakan:

- Frontend: Vercel Free
- Backend: Render Free Web Service

Saya sudah menambahkan `render.yaml` untuk deploy backend ke Render. Backend Render default menerima upload sampai `250MB` melalui env `MAX_UPLOAD_MB=250`. Lihat panduan ringkas di `server/README_DEPLOY.md`.

## Endpoint Backend

- `GET /api/youtube-info?url=...` mengambil judul, thumbnail, dan durasi YouTube.
- `POST /api/process` menerima file audio atau URL YouTube plus pengaturan efek, lalu mengembalikan audio `.ogg` yang sudah diproses.
- `POST /api/upload-roblox` menerima audio hasil proses dan kredensial Roblox Open Cloud, auto-split jika perlu, lalu mengembalikan `rbxassetid://...`.

## Catatan Keamanan

- API key Roblox tidak disimpan atau dilog server.
- Frontend menyimpan API key di `localStorage` dalam bentuk terenkripsi memakai `crypto-js`.
- File sementara di folder `uploads` dibersihkan otomatis secara berkala.
