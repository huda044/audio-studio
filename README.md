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

# Audio Studio 🎧

![CI](https://img.shields.io/badge/CI-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Docker](https://img.shields.io/badge/docker-ready-blue)

Aplikasi untuk **upload file audio**, memprosesnya dengan FFmpeg (kecepatan, pitch, EQ, fade, efek), preview waveform, lalu mengunggah hasilnya ke **Roblox Open Cloud Audio API**.

Mode aplikasi: **upload-only, tanpa login**. API key Roblox, creator/User ID, dan daftar komunitas/grup disimpan di **browser/perangkat** pengguna (localStorage) — tidak ada akun, tidak ada database.

## ✨ Fitur

- 🎵 **Upload multi-file** — mp3, wav, ogg, m4a, aac, flac
- ⚡ **FFmpeg processing** — speed (0.5x-3x), pitch, volume, EQ, fade, echo, reverb, normalize
- ✂️ **Auto-split** — lagu panjang otomatis dipotong sesuai durasi yang diatur
- 🚀 **Roblox integration** — upload langsung ke Roblox Open Cloud API
- 📊 **Real-time preview** — waveform, audio player per part
- 📦 **Download ZIP** — export semua part dalam satu file zip
- 🤖 **AI integration** — hubungkan model AI (OpenAI, OpenRouter, Groq, dll)
- 🔒 **No login required** — semua data tersimpan di browser Anda

## 📚 Dokumentasi

| Dokumen | Deskripsi |
|---------|-----------|
| [API.md](API.md) | Dokumentasi lengkap endpoint API |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Arsitektur dan alur data |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Panduan deployment (Docker, HF, VPS) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Panduan berkontribusi |

## 🚀 Quick Start

### Prasyarat

- Node.js 18+
- npm 9+

### Instalasi

```bash
# 1. Install dependencies
cd server && npm install
cd ../client && npm install

# 2. Start server (Terminal 1)
cd server && npm run dev

# 3. Start client (Terminal 2)
cd client && npm run dev
```

Buka `http://localhost:5173` di browser.

Atau dengan Makefile:
```bash
make setup   # Install dependencies
make dev     # Start both servers
```

### Docker

```bash
docker build -t audio-studio .
docker run -p 7860:7860 audio-studio
```

## 🧪 Testing

```bash
# Server tests (44 tests)
cd server && npm test

# Client tests
cd client && npm test

# Coverage
cd server && npm run test:coverage
cd client && npm run test:coverage
```

## 📦 Tech Stack

| Bagian | Teknologi |
|--------|-----------|
| **Frontend** | React 18, Vite, Framer Motion, TailwindCSS |
| **Backend** | Express, FFmpeg (fluent-ffmpeg), Multer |
| **Testing** | Vitest, Testing Library |
| **CI/CD** | GitHub Actions |
| **Deploy** | Docker, Hugging Face Spaces |

## 🔌 Endpoint API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/process` | Upload audio + efek → OGG parts |
| `POST` | `/api/upload-roblox` | Upload part ke Roblox |
| `POST` | `/api/roblox-test` | Test API key & creator |
| `POST` | `/api/asset-status` | Cek status moderasi |
| `GET` | `/api/ai/status` | Cek konfigurasi AI |
| `POST` | `/api/ai/chat` | Chat dengan AI |
| `GET` | `/api/stats` | Monitoring server |
| `GET` | `/health` | Health check |

Lihat [API.md](API.md) untuk dokumentasi lengkap.

## 🔒 Keamanan

- Tanpa login: API key Roblox disimpan di **browser** (di-obfuscate)
- API key dikirim ke server **hanya saat upload**
- Tidak ada sesi/cookie → CORS terbuka aman
- File sementara dibersihkan otomatis setiap 30 menit
- Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- Rate limiting per endpoint
- Proteksi path traversal pada file serving

## 🤝 Kontribusi

Lihat [CONTRIBUTING.md](CONTRIBUTING.md) untuk panduan kontribusi.

## 📄 Lisensi

MIT License - lihat [LICENSE](LICENSE) untuk detail.
