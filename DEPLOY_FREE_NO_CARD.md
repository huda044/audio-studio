# Deploy Gratis Tanpa Kartu

Kalau tidak punya credit card, Oracle Cloud bukan pilihan karena akun OCI biasanya butuh kartu untuk verifikasi. Untuk project Audio Studio, opsi no-card yang paling masuk akal adalah:

1. **Render Free + Docker** untuk deploy cloud gratis.
2. **PC/laptop sendiri + Cloudflare Quick Tunnel** untuk tes paling cepat dan biasanya lebih ramah YouTube karena memakai IP internet rumah.

Cloudflare Workers/Pages tidak cocok untuk backend ini karena app butuh Node server panjang, FFmpeg, Python, yt-dlp, file sementara, dan proses download/convert yang bisa lama.

## Opsi 1: Render Free Docker

Render cocok dicoba dulu karena bisa build dari `Dockerfile`, jadi isi container sama dengan build production: frontend React, backend Express, FFmpeg, yt-dlp, dan PO token provider.

Dokumen resmi Render menyebut free deploy tidak membutuhkan payment untuk web service/static site, tetapi free web service bisa sleep setelah tidak aktif.

### Langkah

1. Push repo ini ke GitHub.
2. Buka https://render.com/
3. Sign up pakai GitHub.
4. Pilih **New +** lalu **Blueprint** jika ingin memakai `render.yaml`, atau pilih **Web Service** manual.
5. Hubungkan repo.
6. Kalau manual:
   - Runtime/Language: **Docker**
   - Dockerfile path: `./Dockerfile`
   - Plan: **Free**
   - Health check path: `/health`
7. Isi environment variables yang bertanda secret di dashboard Render.

Minimal secret:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=isi_random_panjang
SECRETS_MASTER_KEY=isi_base64_32_byte
ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=password_admin_kuat
YTDLP_COOKIES_BASE64=hasil_base64_cookies_txt
APP_PUBLIC_URL=https://nama-service.onrender.com
```

Generate secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Masukkan output pertama ke `JWT_SECRET`, output kedua ke `SECRETS_MASTER_KEY`.

Kalau cookies YouTube multiline susah ditempel, ubah ke base64:

```bash
base64 -w 0 cookies.txt
```

Lalu isi:

```env
YTDLP_COOKIES_BASE64=hasil_base64
YTDLP_COOKIES_TEXT=
```

### Setelah Deploy

Buka:

```text
https://nama-service.onrender.com/health
https://nama-service.onrender.com/api/youtube-runtime-status
```

Target sehat:

```json
{
  "ytdlp": { "path": "yt-dlp-py" },
  "poProvider": { "enabled": true, "ok": true },
  "cookies": { "state": "ok", "hasLoginCookies": true, "hasVisitorCookie": true }
}
```

Catatan penting:

- Render free bisa sleep, jadi request pertama setelah idle bisa lambat.
- Storage file lokal tidak permanen. Pakai `DATABASE_URL` untuk akun, API key Roblox, grup, invoice, dan history.
- YouTube tetap bisa memblokir IP cloud. Kalau Render juga kena bot-check, opsi paling stabil tanpa kartu adalah menjalankan backend di PC sendiri lewat tunnel.

## Opsi 2: PC Sendiri + Cloudflare Quick Tunnel

Ini bukan hosting cloud permanen, tapi bagus untuk development/testing tanpa kartu. App berjalan di PC kamu, lalu Cloudflare memberi URL sementara `trycloudflare.com`.

Kelebihan:

- Tidak perlu credit card.
- Tidak perlu VPS.
- YouTube sering lebih lancar karena memakai IP internet rumah, bukan IP datacenter hosting.

Batasan:

- PC harus menyala.
- URL quick tunnel berubah setiap dijalankan ulang.
- Untuk production serius tetap lebih baik VPS/domain.

### Jalankan App Lokal

Install Docker Desktop dulu, lalu dari folder project:

```bash
docker build -t audio-studio .
docker run --rm -p 7860:7860 --env-file .env.oracle audio-studio
```

Atau kalau sudah punya Docker Compose:

```bash
cp .env.oracle.example .env.oracle
# isi .env.oracle dulu
docker compose -f docker-compose.oracle.yml up --build
```

### Publish Dengan Quick Tunnel

Pakai Wrangler:

```bash
npx wrangler tunnel quick-start http://localhost:7860
```

Nanti terminal akan menampilkan URL seperti:

```text
https://random-words.trycloudflare.com
```

Masukkan URL itu ke `APP_PUBLIC_URL` kalau fitur OAuth/callback butuh public URL.

## Opsi 3: Hugging Face Spaces

Hugging Face tetap gratis/no-card dan bisa Docker, tapi untuk kasus kamu YouTube sudah sering gagal karena bot-check/timeout walaupun cookie dan PO provider sehat. Jadi untuk project ini Hugging Face tidak saya jadikan pilihan utama lagi.

## Rekomendasi

Mulai dari **Render Free Docker** karena paling mirip deploy cloud normal tanpa kartu. Kalau YouTube masih gagal dengan pesan bot-check, pindah ke **PC sendiri + Cloudflare Quick Tunnel** untuk membuktikan bahwa masalahnya memang IP hosting, bukan kode app.
