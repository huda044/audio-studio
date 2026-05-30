# Deploy Gratis Tanpa Kartu

Render meminta kartu untuk verifikasi, jadi jangan dipakai kalau ingin benar-benar tanpa kartu.

Opsi paling praktis untuk project ini adalah deploy sebagai Docker container di platform yang mendukung free/no-card. Repository ini sudah punya `Dockerfile` yang menjalankan frontend React dan backend Express dalam satu service.

## Hugging Face Spaces

1. Buka https://huggingface.co/spaces
2. Pilih **Create new Space**.
3. Pilih **SDK: Docker**.
4. Buat Space public.
5. Upload/push isi repo GitHub ini ke Space.
6. Space akan build Dockerfile dan menjalankan app di port `7860`.

Kelebihan:

- Tidak perlu kartu untuk mulai.
- Frontend dan backend satu domain.
- FFmpeg tersedia dari Docker image.
- Cocok untuk public demo dan testing audio.

Batasan:

- Free hardware tetap terbatas.
- Service bisa sleep.
- File sementara tidak permanen.
- Untuk traffic besar sungguhan, tetap butuh hosting berbayar/VPS.

## Env yang Bisa Diatur

```env
MAX_UPLOAD_MB=250
INLINE_AUDIO_LIMIT_MB=8
DATA_DIR=/data
DATABASE_URL=postgres://user:password@host:5432/db
SECRETS_MASTER_KEY=isi-output-node-scripts-generate-master-key
JWT_SECRET=ganti-dengan-random-secret-panjang
ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=ganti-password-admin-kuat
GOOGLE_CLIENT_ID=isi-kalau-pakai-google-login
SMTP_HOST=isi-kalau-email-verifikasi-asli
SMTP_PORT=587
SMTP_USER=email-smtp
SMTP_PASS=password-smtp
EMAIL_FROM=no-reply@example.com
EMAIL_DEV_CODES=true
PROCESS_RATE_LIMIT=12
INFO_RATE_LIMIT=45
JSON_LIMIT=512kb
YTDLP_ENABLE_SECTIONS=true
YTDLP_ALT_CLIENT_FALLBACKS=true
YTDLP_FORCE_UPDATE=true
YTDLP_PREFER_LOCAL=true
YTDLP_STARTUP_UPDATE=true
YTDLP_PATH=/usr/local/bin/yt-dlp-py
YTDLP_BGUTIL_PROVIDER=true
YTDLP_BGUTIL_PROVIDER_URL=http://127.0.0.1:4416
YTDLP_BGUTIL_DISABLE_INNERTUBE=1
YTDLP_BGUTIL_WARMUP_TIMEOUT_MS=90000
YOUTUBE_PO_DOWNLOAD_ORDER=yt-dlp-section-mweb,yt-dlp-mweb,ytdl-core,direct-section-mweb,direct-url-mweb
YOUTUBE_PO_GET_URL_TIMEOUT_MS=45000
YTDLP_FORCE_IPV4=true
YOUTUBE_DOWNLOAD_ORDER=direct-section,direct-url,ytdl-core,yt-dlp
YTDLP_GET_URL_TIMEOUT_MS=60000
YTDLP_SECTION_TIMEOUT_MS=60000
YOUTUBE_DIRECT_SECTION_TIMEOUT_MS=120000
```

Naikkan `MAX_UPLOAD_MB` hanya kalau platform hosting mengizinkan upload sebesar itu.

Fitur akun sekarang bisa memakai PostgreSQL lewat `DATABASE_URL`. Ini yang disarankan agar akun terdaftar, Group ID, Creator ID, invoice, history, dan API key terenkripsi tetap aman setelah rebuild/redeploy.

Kalau `DATABASE_URL` kosong, data disimpan ke file JSON di `DATA_DIR`. Di hosting gratis tanpa storage persistent, file itu bisa hilang saat container dibuat ulang. `DATA_DIR=/data` hanya aman kalau platform benar-benar memasang persistent storage ke path itu.

Generate `SECRETS_MASTER_KEY` dari folder `server` dengan `node scripts/generate-master-key.mjs`, lalu simpan hasilnya sebagai env hosting.

Pengaturan hemat limit:

- `PROCESS_RATE_LIMIT` membatasi konversi/upload berat per window 30 menit.
- `INFO_RATE_LIMIT` membatasi preview YouTube per menit.
- `INLINE_AUDIO_LIMIT_MB` mencegah response preview terlalu besar.
- `YTDLP_ENABLE_SECTIONS=true` membuat backend mengambil potongan durasi yang dibutuhkan dulu, bukan download video panjang penuh.
- `YTDLP_FORCE_UPDATE=true`, `YTDLP_PREFER_LOCAL=true`, dan `YTDLP_STARTUP_UPDATE=true` membuat Space refresh yt-dlp saat startup lalu memakai binary lokal terbaru.
- `YTDLP_FORCE_IPV4=true` dan `YOUTUBE_DOWNLOAD_ORDER=direct-section,direct-url,ytdl-core,yt-dlp` mengurangi error SSL/TLS dan mencoba direct media URL sebelum download penuh.
- Riwayat akun dipangkas otomatis agar storage tidak cepat penuh.

Untuk cek status runtime YouTube setelah deploy, buka:

```text
https://nama-space-kamu.hf.space/api/youtube-runtime-status
```

Kalau `cookies.state` masih `absent` dan YouTube terkena bot-check, isi secret `YTDLP_COOKIES_TEXT` atau `YTDLP_COOKIES_BASE64` dari cookies.txt format Netscape, lalu restart Space.

Kalau cookies sudah `ok` tetapi YouTube masih menolak dengan "Sign in to confirm you're not a bot", export ulang cookies dari private/incognito window yang sudah login YouTube. Jika masih ditolak, isi PO Token:

```env
YOUTUBE_PO_TOKEN=mweb.gvs+TOKEN_KAMU
YOUTUBE_VISITOR_DATA=VISITOR_DATA_KAMU
```

Jika token yang kamu punya hanya isi token mentah tanpa `mweb.gvs+`, backend otomatis menambahkan prefix itu.

Dockerfile juga memasang `bgutil-ytdlp-pot-provider` sebagai PO Token provider otomatis. Setelah rebuild, `/api/youtube-runtime-status` harus menunjukkan `ytdlp.path` sebagai `yt-dlp-py` kalau provider plugin Python yang dipakai.

Catatan akun, email, Google, dan pembayaran:

- Jika `SMTP_HOST` belum diisi, kode verifikasi muncul sebagai dev code dari API agar sistem tetap bisa dites gratis.
- Untuk email sungguhan, isi SMTP provider.
- Untuk Google Login, isi `GOOGLE_CLIENT_ID` di backend dan `VITE_GOOGLE_CLIENT_ID` saat build frontend.
- `SECRETS_MASTER_KEY` wajib stabil. Kalau berubah, API key Roblox yang sudah terenkripsi tidak bisa dibuka lagi.
- QRIS/DANA/Mandiri saat ini dibuat sebagai invoice manual `Pending`. Admin bisa mengaktifkan invoice dari menu **CMS Admin** setelah login sebagai admin.
