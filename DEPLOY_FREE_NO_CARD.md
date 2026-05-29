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
```

Naikkan `MAX_UPLOAD_MB` hanya kalau platform hosting mengizinkan upload sebesar itu.

Fitur akun sekarang bisa memakai PostgreSQL lewat `DATABASE_URL`. Ini yang disarankan agar akun terdaftar, Group ID, Creator ID, invoice, history, dan API key terenkripsi tetap aman setelah rebuild/redeploy.

Kalau `DATABASE_URL` kosong, data disimpan ke file JSON di `DATA_DIR`. Di hosting gratis tanpa storage persistent, file itu bisa hilang saat container dibuat ulang. `DATA_DIR=/data` hanya aman kalau platform benar-benar memasang persistent storage ke path itu.

Generate `SECRETS_MASTER_KEY` dari folder `server` dengan `node scripts/generate-master-key.mjs`, lalu simpan hasilnya sebagai env hosting.

Pengaturan hemat limit:

- `PROCESS_RATE_LIMIT` membatasi konversi/upload berat per window 30 menit.
- `INFO_RATE_LIMIT` membatasi preview YouTube per menit.
- `INLINE_AUDIO_LIMIT_MB` mencegah response preview terlalu besar.
- Riwayat akun dipangkas otomatis agar storage tidak cepat penuh.

Catatan akun, email, Google, dan pembayaran:

- Jika `SMTP_HOST` belum diisi, kode verifikasi muncul sebagai dev code dari API agar sistem tetap bisa dites gratis.
- Untuk email sungguhan, isi SMTP provider.
- Untuk Google Login, isi `GOOGLE_CLIENT_ID` di backend dan `VITE_GOOGLE_CLIENT_ID` saat build frontend.
- `SECRETS_MASTER_KEY` wajib stabil. Kalau berubah, API key Roblox yang sudah terenkripsi tidak bisa dibuka lagi.
- QRIS/DANA/Mandiri saat ini dibuat sebagai invoice manual `Pending`. Admin bisa mengaktifkan invoice dari menu **CMS Admin** setelah login sebagai admin.
