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
JWT_SECRET=ganti-dengan-random-secret-panjang
PROCESS_RATE_LIMIT=12
INFO_RATE_LIMIT=45
JSON_LIMIT=512kb
```

Naikkan `MAX_UPLOAD_MB` hanya kalau platform hosting mengizinkan upload sebesar itu.

Fitur akun menyimpan data profile ke `DATA_DIR`. Di hosting gratis tanpa storage persistent, data bisa hilang saat container dibuat ulang. Untuk akun yang benar-benar tahan lama, aktifkan persistent storage/bucket atau pindah backend ke layanan database gratis.

Pengaturan hemat limit:

- `PROCESS_RATE_LIMIT` membatasi konversi/upload berat per window 30 menit.
- `INFO_RATE_LIMIT` membatasi preview YouTube per menit.
- `INLINE_AUDIO_LIMIT_MB` mencegah response preview terlalu besar.
- Riwayat akun dipangkas otomatis agar storage tidak cepat penuh.
