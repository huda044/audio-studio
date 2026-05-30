# Deploy ke Oracle Cloud Always Free VPS

Panduan ini untuk menjalankan Audio Studio sebagai Docker container di Oracle Cloud VPS. Ini lebih cocok daripada Cloudflare Workers karena app ini butuh Node, FFmpeg, Python, yt-dlp, file sementara, dan PO token provider.

## 1. Buat VM Oracle

Di Oracle Cloud Console:

1. Create VM instance.
2. Image: Ubuntu 22.04 atau Ubuntu 24.04.
3. Shape gratis yang disarankan: `VM.Standard.A1.Flex`.
4. Mulai aman: 2 OCPU, 12 GB RAM. Kalau kapasitas susah, coba 1 OCPU, 6 GB RAM.
5. Tambahkan SSH public key.
6. Pastikan public IPv4 aktif.

Di OCI network security list / NSG, buka inbound:

- TCP `22` dari IP kamu untuk SSH.
- TCP `7860` dari `0.0.0.0/0` untuk akses app awal.

Oracle docs resmi:

- Always Free resources: https://docs.oracle.com/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- SSH ke Linux instance: https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/connect-to-linux-instance.htm

## 2. SSH ke VM

Contoh untuk Ubuntu:

```bash
ssh ubuntu@PUBLIC_IP_ORACLE
```

Kalau image Oracle Linux, user default biasanya `opc`, tapi panduan ini disiapkan untuk Ubuntu.

## 3. Install Docker

Clone repo:

```bash
git clone https://github.com/USERNAME/REPO-KAMU.git audio-studio
cd audio-studio
```

Install Docker:

```bash
chmod +x scripts/oracle-install-docker.sh scripts/oracle-deploy.sh
./scripts/oracle-install-docker.sh
```

Logout lalu login SSH ulang supaya group `docker` aktif:

```bash
exit
ssh ubuntu@PUBLIC_IP_ORACLE
cd audio-studio
```

## 4. Isi env production

```bash
cp .env.oracle.example .env.oracle
nano .env.oracle
```

Minimal isi:

```env
APP_PUBLIC_URL=http://PUBLIC_IP_ORACLE:7860
JWT_SECRET=isi_random_panjang
SECRETS_MASTER_KEY=isi_output_generate_master_key
DATABASE_URL=postgresql://...
YTDLP_COOKIES_TEXT=isi_cookies_txt_netscape
```

Generate secret di VPS:

```bash
docker run --rm node:20-bookworm-slim node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
docker run --rm node:20-bookworm-slim node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Masukkan output pertama ke `JWT_SECRET`, output kedua ke `SECRETS_MASTER_KEY`.

Kalau cookies multiline susah ditempel, pakai base64:

```bash
base64 -w 0 cookies.txt
```

Lalu isi:

```env
YTDLP_COOKIES_BASE64=hasil_base64
YTDLP_COOKIES_TEXT=
```

## 5. Deploy

```bash
./scripts/oracle-deploy.sh
```

Cek:

```bash
docker compose -f docker-compose.oracle.yml ps
docker compose -f docker-compose.oracle.yml logs -f --tail=100
curl http://127.0.0.1:7860/health
curl http://127.0.0.1:7860/api/youtube-runtime-status
```

Buka browser:

```text
http://PUBLIC_IP_ORACLE:7860
```

## 6. Update deploy setelah push baru

```bash
cd audio-studio
git pull
./scripts/oracle-deploy.sh
```

## 7. Kalau YouTube masih bot-check

Oracle VPS biasanya lebih baik daripada Hugging Face, tapi YouTube tetap bisa menolak IP cloud. Cek:

```bash
curl http://127.0.0.1:7860/api/youtube-runtime-status
```

Target sehat:

```json
{
  "ytdlp": { "path": "yt-dlp-py" },
  "poProvider": { "enabled": true, "ok": true },
  "cookies": { "state": "ok", "hasLoginCookies": true, "hasVisitorCookie": true }
}
```

Kalau masih gagal:

1. Export ulang cookies dari browser yang login YouTube.
2. Isi `YOUTUBE_PO_TOKEN` dan `YOUTUBE_VISITOR_DATA` jika punya.
3. Opsi terakhir: isi `YOUTUBE_PROXY` dengan proxy residential/ISP.

## 8. Catatan keamanan

- Jangan commit `.env.oracle`.
- Jangan ganti `SECRETS_MASTER_KEY` setelah user menyimpan API key Roblox.
- Pakai PostgreSQL external tetap disarankan, walaupun VPS punya volume lokal.
- Kalau nanti punya domain, lebih bagus pasang reverse proxy HTTPS di port 443.
