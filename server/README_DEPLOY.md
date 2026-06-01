# Backend Deploy ke Hugging Face Space

Backend memakai FFmpeg, yt-dlp, file upload, dan request yang bisa lama. Disarankan deploy sebagai Docker Space di Hugging Face. Frontend tetap di Vercel.

## Hugging Face Space (Docker)

Repo ini sudah berisi `Dockerfile` di root dan front-matter HF Space di `README.md` (`sdk: docker`, `app_port: 7860`). Ikuti langkah berikut:

1. Buat Space baru di Hugging Face dengan SDK **Docker**.
2. Hubungkan repo (lewat git push langsung ke remote Space, atau sync dari GitHub).
3. Buka Settings → Variables and secrets, isi env minimal:

   ```env
   CLIENT_ORIGIN=https://<frontend-vercel>.vercel.app
   APP_PUBLIC_URL=https://<frontend-vercel>.vercel.app
   JWT_SECRET=random-panjang-stabil
   SECRETS_MASTER_KEY=isi-output-node-scripts-generate-master-key
   DATABASE_URL=postgres://user:password@host:5432/db
   GOOGLE_CLIENT_ID=
   ADMIN_BOOTSTRAP_USERNAME=admin
   ADMIN_BOOTSTRAP_EMAIL=admin@example.com
   ADMIN_BOOTSTRAP_PASSWORD=ganti-password-admin-kuat
   ADMIN_BOOTSTRAP_RESET_PASSWORD=false
   ```

4. Build Space. Container listen di port `7860` dan publish API di URL Space, contoh `https://<username>-<space-name>.hf.space`.
5. Di Vercel project frontend, set:

   ```env
   VITE_API_BASE=https://<username>-<space-name>.hf.space
   ```

   lalu redeploy frontend.

Generate `SECRETS_MASTER_KEY` dari folder `server` dengan `node scripts/generate-master-key.mjs`. Nilainya harus tetap sama antar deploy. Kalau berubah, API key Roblox lama tidak bisa didekripsi walaupun database masih ada.

## Limit yang Dibuat

- Upload backend default: `250MB`
- Audio preview inline hanya untuk file hasil proses sampai `8MB`
- File lebih besar memakai URL `/api/files/...` agar response tidak berat
- File sementara auto-cleanup setelah beberapa jam
- Proses FFmpeg dibatasi queue supaya server tidak overload saat banyak user
- Upload Roblox otomatis dipotong per part mengikuti limit Open Cloud audio: maksimal 7 menit dan di bawah 20MB per asset
- Endpoint mengembalikan `requestId`, `conversionTrace`, `warnings`, dan `uploadSummary` agar status berhasil/gagal/pending bisa dilacak jelas

## Data Akun Tidak Reset Saat Deploy

HF Space free tidak punya persistent disk untuk `/data`. Selalu pakai database eksternal supaya akun terdaftar, API key Roblox terenkripsi, Group ID, Creator ID, invoice, dan history tidak hilang.

```env
DATABASE_URL=postgres://user:password@host:5432/db
SECRETS_MASTER_KEY=isi-output-node-scripts-generate-master-key
JWT_SECRET=random-panjang-stabil
```

`DATABASE_URL` dipakai sebagai data store utama. File JSON di `DATA_DIR` hanya menjadi mirror lokal sementara dan akan hilang saat Space rebuild/restart.

## Akun Admin CMS

Admin panel memakai akun login biasa dengan role `admin`, bukan `ADMIN_SECRET`. Saat deploy, isi env berikut untuk membuat/mengaktifkan akun admin otomatis:

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

Untuk cek apakah yt-dlp, FFmpeg, dan cookie sudah kebaca di backend, buka:

```text
https://<username>-<space-name>.hf.space/api/youtube-runtime-status
```

Jika `ytdlp.available=true` tetapi `cookies.state=absent`, backend sudah siap tetapi masih bisa ditolak YouTube di IP hosting. Isi cookie YouTube yang valid jika muncul bot-check.

Jika cookies sudah terbaca `ok` tetapi detail error masih "Sign in to confirm you're not a bot", cookies kemungkinan kurang lengkap/rotated atau YouTube meminta PO Token. Export ulang cookies dari private/incognito window yang login YouTube. Kalau tetap gagal, isi:

```env
YOUTUBE_PO_TOKEN=mweb.gvs+TOKEN_KAMU
YOUTUBE_VISITOR_DATA=VISITOR_DATA_KAMU
```

`YOUTUBE_PO_TOKEN` boleh juga diisi token mentah; backend akan menganggapnya sebagai `mweb.gvs`.

Dockerfile sudah menyiapkan `bgutil-ytdlp-pot-provider` otomatis. Setelah build Space, endpoint `/api/youtube-runtime-status` seharusnya menampilkan `ytdlp.path` sebagai `yt-dlp-py`, artinya yt-dlp Python + plugin provider yang dipakai. Kalau ingin mematikan provider ini:

```env
YTDLP_BGUTIL_PROVIDER=false
```

Backend memakai partial download (`YTDLP_ENABLE_SECTIONS=true`) agar video panjang tidak selalu diunduh penuh. Mode paling awal adalah `direct-section`: backend ambil direct media URL dulu, lalu FFmpeg hanya membaca potongan durasi yang dibutuhkan. Setelah itu baru fallback ke client extractor (`mweb`, `tv`, `ios`, `default`) sebelum menyerah.

Untuk link yang butuh YouTube challenge solver, backend otomatis menjalankan yt-dlp dengan runtime Node (`--js-runtimes node:<node backend>`). Kalau hosting memakai path Node khusus, isi `YTDLP_JS_RUNTIMES=node:/path/to/node`.

Untuk error SSL/TLS dari hosting ke YouTube, backend default memaksa IPv4 (`YTDLP_FORCE_IPV4=true`), menurunkan koneksi paralel, dan memberi retry extractor. Kalau masih muncul `UNEXPECTED_EOF_WHILE_READING`, aktifkan proxy pribadi lewat `YOUTUBE_PROXY` atau pindah provider/IP hosting.

Jika IP hosting tetap kena bot-check, isi cookie YouTube yang masih valid. Kalau cookie sudah valid tetapi YouTube tetap meminta token, yt-dlp sekarang mendukung env `YOUTUBE_PO_TOKEN` dan `YOUTUBE_VISITOR_DATA` yang diteruskan ke extractor args. Tidak ada bypass yang selalu berhasil kalau YouTube memblokir IP/session, tetapi fallback ini menghindari timeout download penuh dan memperbesar peluang sukses untuk video public.

## Catatan HF Space Free

- Space free bisa sleep saat idle. Request pertama setelah sleep akan lebih lambat karena container cold start.
- Resource CPU dan RAM dibatasi, tidak ideal untuk traffic besar terus-menerus. Untuk pemakaian berat, upgrade ke HF Space upgraded hardware atau pindah ke VPS sendiri.
