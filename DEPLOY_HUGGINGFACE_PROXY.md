# Hugging Face + Proxy YouTube

Panduan ini untuk tetap memakai Hugging Face Spaces, tetapi download YouTube diarahkan lewat proxy khusus. Ini membantu kalau IP Hugging Face sering kena bot-check/timeout dari YouTube.

## 1. Pakai Space Docker

Pastikan Space memakai:

- SDK: **Docker**
- Port app: `7860`
- Repo berisi `Dockerfile` project ini

Setelah push perubahan, klik **Restart** atau **Factory rebuild** supaya image Docker baru dipakai.

## 2. Secret Wajib

Di Hugging Face Space buka:

**Settings > Variables and secrets > New secret**

Isi minimal:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=random_hex_panjang
SECRETS_MASTER_KEY=base64_32_byte
ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=password_admin_kuat
APP_PUBLIC_URL=https://NAMA_SPACE.hf.space
YTDLP_COOKIES_BASE64=hasil_base64_cookies_txt
```

Kalau `DATABASE_URL` sudah sukses seperti sebelumnya, pakai nilai yang sama.

## 3. Secret Proxy YouTube

Cara paling simpel:

```env
YOUTUBE_PROXY=http://username:password@host:port
YOUTUBE_PROXY_STRICT=true
YOUTUBE_PROXY_REQUIRED=true
```

Contoh format yang diterima:

```env
YOUTUBE_PROXY=http://user:pass@proxy.example.com:8000
YOUTUBE_PROXY=https://user:pass@proxy.example.com:8000
YOUTUBE_PROXY=socks5://user:pass@proxy.example.com:1080
YOUTUBE_PROXY=socks5h://user:pass@proxy.example.com:1080
```

Kalau username/password punya karakter aneh seperti `@`, `:`, `/`, `#`, lebih aman pakai mode terpisah:

```env
YOUTUBE_PROXY_PROTOCOL=http
YOUTUBE_PROXY_HOST=proxy.example.com
YOUTUBE_PROXY_PORT=8000
YOUTUBE_PROXY_USERNAME=username
YOUTUBE_PROXY_PASSWORD=password
YOUTUBE_PROXY_STRICT=true
YOUTUBE_PROXY_REQUIRED=true
```

`YOUTUBE_PROXY_STRICT=true` membuat backend hanya memakai strategi `yt-dlp` yang mendukung `--proxy`, jadi proses download tidak diam-diam balik lewat IP Hugging Face.

`YOUTUBE_PROXY_REQUIRED=true` membuat download langsung gagal kalau proxy belum valid. Ini berguna supaya kamu tahu proxy memang aktif.

## 4. Secret YouTube yang Disarankan

Tetap isi cookies, karena proxy saja belum tentu cukup:

```env
YTDLP_COOKIES_BASE64=hasil_base64_cookies_txt
YTDLP_BGUTIL_PROVIDER=true
YTDLP_BGUTIL_PROVIDER_URL=http://127.0.0.1:4416
YTDLP_BGUTIL_DISABLE_INNERTUBE=1
YOUTUBE_PO_DOWNLOAD_ORDER=yt-dlp-section-mweb,yt-dlp-mweb,yt-dlp-section,yt-dlp
YOUTUBE_PO_GET_URL_TIMEOUT_MS=45000
YTDLP_PATH=/usr/local/bin/yt-dlp-py
YTDLP_PREFER_LOCAL=true
YTDLP_FORCE_UPDATE=true
YTDLP_STARTUP_UPDATE=true
```

Kalau punya token manual:

```env
YOUTUBE_PO_TOKEN=mweb.gvs+TOKEN_KAMU
YOUTUBE_VISITOR_DATA=VISITOR_DATA_KAMU
```

## 5. Cek Setelah Restart

Buka:

```text
https://NAMA_SPACE.hf.space/api/youtube-runtime-status
```

Target sehat:

```json
{
  "ytdlp": { "available": true, "path": "yt-dlp-py" },
  "poProvider": { "enabled": true, "ok": true },
  "proxy": { "enabled": true, "strict": true, "valid": true },
  "cookies": { "state": "ok", "hasLoginCookies": true, "hasVisitorCookie": true }
}
```

Kalau `proxy.enabled=false`, berarti secret proxy belum kebaca atau formatnya salah.

Kalau `proxy.valid=false`, pakai format terpisah `YOUTUBE_PROXY_HOST`, `YOUTUBE_PROXY_PORT`, `YOUTUBE_PROXY_USERNAME`, dan `YOUTUBE_PROXY_PASSWORD`.

## 6. Proxy yang Cocok

Gunakan proxy HTTP(S) atau SOCKS dari provider yang memang mengizinkan traffic YouTube/streaming. Untuk hasil paling stabil, pilih lokasi proxy yang sama dengan area login cookie YouTube kamu.

Jangan pakai open proxy publik gratis. Biasanya lambat, sering mati, dan sering sudah diblokir YouTube.

## 7. Kalau Masih Gagal

1. Cek `/api/youtube-runtime-status`.
2. Pastikan `proxy.enabled=true`.
3. Pastikan cookies masih `ok`.
4. Export ulang cookies dari browser/incognito yang sudah login YouTube.
5. Coba proxy lain, karena YouTube bisa memblokir IP proxy tertentu.
