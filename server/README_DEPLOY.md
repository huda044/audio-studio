# Deploy Backend

Backend adalah Express + FFmpeg dengan mode **upload-only** (tanpa login, tanpa database,
tanpa CMS). Yang perlu disiapkan hanya env sesuai `server/.env.example`.

Frontend statis ada di `client/` dan dideploy terpisah (Vercel atau disajikan oleh backend
sendiri lewat `CLIENT_DIST`).

## Pilihan deploy

| Cara | Cocok untuk | Backend URL |
|---|---|---|
| **PC sendiri + Cloudflare tunnel** | Pemakaian pribadi, kualitas & kecepatan terbaik | `https://<slug>.trycloudflare.com` (berubah tiap restart) |
| **Hugging Face Space (Docker)** | Cadangan saat PC mati | `https://<user>-<space>.hf.space` |
| **VPS / Oracle Cloud (Docker)** | Permanen, tanpa bergantung PC | `http://<IP>:7860` (+ reverse proxy untuk HTTPS) |

### 1. PC sendiri + Cloudflare tunnel (rekomendasi saat ini)

```bat
JALANKAN-BACKEND.bat
```

Skrip `scripts/local-tunnel.js` akan:

1. Menyalakan backend di `http://127.0.0.1:4000`.
2. Membuat quick tunnel Cloudflare.
3. **Memverifikasi** tunnel melayani `/health` sebelum mengarahkan produksi (tunnel tidak
   sehat tidak akan pernah dipakai).
4. Dengan flag `--update-vercel`: memperbarui `VITE_API_BASE` di Vercel + redeploy frontend.

Catatan: URL quick tunnel berubah setiap restart, sehingga `--update-vercel` harus dijalankan
ulang tiap kali backend dinyalakan. Verifikasi tunggu ±10 detik sebelum poll pertama karena
record DNS hostname baru butuh waktu tayang (jika dipoll terlalu cepat, resolusi DNS bisa
ter-cache gagal dan seluruh pengecekan berikutnya ikut gagal).

### 2. Hugging Face Space (Docker)

Repo ini sudah punya `Dockerfile` di root dan front-matter HF Space di `README.md`
(`sdk: docker`, `app_port: 7860`).

1. Buat Space dengan SDK **Docker**, lalu push repo ini ke remote Space.
2. Settings → Variables and secrets, isi sesuai kebutuhan (lihat `server/.env.example`).
   Yang biasanya perlu: `ALLOWED_ORIGINS=https://<frontend>.vercel.app` dan (opsional)
   `METRICS_TOKEN`.
3. Build Space. API tersedia di `https://<user>-<space>.hf.space`, health check di `/health`.
4. Di Vercel, set `VITE_API_BASE=https://<user>-<space>.hf.space` lalu redeploy.

### 3. VPS / Oracle Cloud (Docker)

```bash
cp .env.oracle.example .env.oracle   # lalu isi nilainya
bash scripts/oracle-deploy.sh
```

`docker-compose.oracle.yml` memakai volume `./data` dan `./uploads`, health check tiap 60
detik, dan port `7860`. Untuk HTTPS, taruh reverse proxy (Caddy/Nginx) di depannya.

## Batas & perilaku server

- Upload maksimum `250MB` per file (`MAX_UPLOAD_MB`).
- Audio hasil konversi di-inline sebagai base64 hanya bila ≤ `8MB` dan total ≤ `16MB`;
  di atas itu client memakai URL `/api/files/...` (tidak ada data yang hilang).
- File hasil konversi otomatis dibersihkan setelah 3 jam.
- Konversi & upload Roblox masuk antrean (`CONVERSION_CONCURRENCY`, default 2) supaya server
  tidak overload; request ditolak lebih awal dengan status 503 saat antrean penuh.
- Upload Roblox otomatis dipotong mengikuti limit Open Cloud: maksimal 420 detik dan
  di bawah 19 MB per asset.
- Respons menyertakan `requestId`, `warnings`, dan ringkasan upload agar status
  berhasil/gagal/pending bisa dilacak.

## YouTube (yt-dlp)

Binary dicari berurutan: `YTDL_PATH` → `server/bin/yt-dlp(.exe)` → `PATH`.

- Sumber dibatasi `YTDL_MAX_DURATION_SECONDS` (default 3 jam).
- IP datacenter (Space/VPS) sering ditolak YouTube dengan pesan bot-check. Ini batasan
  lingkungan, bukan bug: dari PC sendiri umumnya berhasil. Kalau perlu, jalankan backend di
  PC (pilihan 1) alih-alih hosting publik.

## Catatan HF Space free

- Space free bisa sleep saat idle; request pertama setelah sleep lebih lambat (cold start).
- CPU/RAM dibatasi dan tidak cocok untuk trafik besar. Untuk beban berat, pakai PC sendiri
  atau upgrade hardware Space.
