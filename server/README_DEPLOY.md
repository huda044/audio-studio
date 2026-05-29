# Backend Deploy Gratis yang Disarankan

Untuk penggunaan public dan file lebih besar, deploy backend ke Render Free sebagai web service biasa. Frontend tetap di Vercel.

## Render

1. Push repository ini ke GitHub.
2. Buka Render, pilih **New +** lalu **Blueprint**.
3. Pilih repository ini.
4. Render akan membaca `render.yaml`.
5. Setelah service aktif, ambil URL backend Render, contoh:

```text
https://audio-studio-api.onrender.com
```

6. Di Vercel project frontend, ubah Environment Variable:

```env
VITE_API_BASE=https://audio-studio-api.onrender.com
```

7. Redeploy frontend Vercel.

## Limit yang Dibuat

- Upload backend default: `250MB`
- Audio preview inline hanya untuk file hasil proses sampai `8MB`
- File lebih besar memakai URL `/api/files/...` agar response tidak berat
- File sementara auto-cleanup setelah beberapa jam
- Proses FFmpeg dibatasi queue supaya server tidak overload saat banyak user
- Upload Roblox otomatis dipotong per part mengikuti limit Open Cloud audio: maksimal 7 menit dan di bawah 20MB per asset
- Endpoint mengembalikan `requestId`, `conversionTrace`, `warnings`, dan `uploadSummary` agar status berhasil/gagal/pending bisa dilacak jelas

## Data Akun Tidak Reset Saat Deploy

Untuk menyimpan akun terdaftar, API key Roblox terenkripsi, Group ID, Creator ID, invoice, dan history secara permanen, isi env backend:

```env
DATABASE_URL=postgres://user:password@host:5432/db
SECRETS_MASTER_KEY=isi-output-node-scripts-generate-master-key
JWT_SECRET=random-panjang-stabil
```

`DATABASE_URL` dipakai sebagai data store utama. File JSON di `DATA_DIR` hanya menjadi mirror lokal. Kalau `DATABASE_URL` kosong, backend memakai file lokal dan data bisa reset saat Render/container rebuild tanpa persistent disk.

Generate `SECRETS_MASTER_KEY` dari folder `server` dengan `node scripts/generate-master-key.mjs`, lalu simpan hasilnya sebagai env hosting. Nilainya harus tetap sama antar deploy. Kalau berubah, API key Roblox lama tidak bisa didekripsi walaupun database masih ada.

## Akun Admin CMS

Admin panel sekarang memakai akun login biasa dengan role `admin`, bukan `ADMIN_SECRET`.
Saat deploy, isi env berikut untuk membuat/mengaktifkan akun admin otomatis:

```env
ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=ganti-password-admin-kuat
ADMIN_BOOTSTRAP_RESET_PASSWORD=false
```

Setelah login dengan akun itu, menu **CMS Admin** muncul otomatis untuk kelola user, invoice, audit activity, email test, dan konfigurasi sistem.

## YouTube di Hosting Public

Jika konversi YouTube gagal dengan pesan bot-check, berarti YouTube menolak request dari IP hosting. Isi salah satu secret berikut lalu restart Space:

```env
YTDLP_COOKIES_TEXT=isi export cookies.txt format Netscape
# atau
YTDLP_COOKIES_BASE64=base64_dari_file_cookies_txt
```

Backend memakai partial download (`YTDLP_ENABLE_SECTIONS=true`) agar video panjang tidak selalu diunduh penuh. Sekarang mode paling awal adalah `direct-section`: backend ambil direct media URL dulu, lalu FFmpeg hanya membaca potongan durasi yang dibutuhkan. Setelah itu baru fallback ke client extractor (`mweb`, `tv`, `ios`, `default`) sebelum menyerah.

Untuk link yang butuh YouTube challenge solver, backend otomatis menjalankan yt-dlp dengan runtime Node (`--js-runtimes node:<node backend>`). Kalau hosting memakai path Node khusus, isi `YTDLP_JS_RUNTIMES=node:/path/to/node`.

Untuk error SSL/TLS dari hosting ke YouTube, backend default memaksa IPv4 (`YTDLP_FORCE_IPV4=true`), menurunkan koneksi paralel, dan memberi retry extractor. Kalau masih muncul `UNEXPECTED_EOF_WHILE_READING`, aktifkan proxy pribadi lewat `YOUTUBE_PROXY` atau pindah provider/IP hosting.

Jika IP hosting tetap kena bot-check, isi cookie YouTube yang masih valid. Kalau cookie sudah valid tetapi YouTube tetap meminta token, yt-dlp sekarang mendukung env `YOUTUBE_PO_TOKEN` dan `YOUTUBE_VISITOR_DATA` yang diteruskan ke extractor args. Tidak ada bypass yang selalu berhasil kalau YouTube memblokir IP/session, tetapi fallback ini menghindari timeout download penuh dan memperbesar peluang sukses untuk video public.

Render Free tetap punya batasan: service bisa sleep saat idle, filesystem tidak permanen, dan resource bukan untuk traffic besar terus-menerus. Tetapi untuk backend FFmpeg gratis, ini lebih kuat daripada Vercel serverless.
