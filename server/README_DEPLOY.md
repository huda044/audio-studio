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

Backend memakai partial download (`YTDLP_ENABLE_SECTIONS=true`) agar video panjang tidak selalu diunduh penuh. Timeout default juga dibuat lebih pendek supaya proses tidak menggantung lama.

Untuk link yang butuh YouTube challenge solver, backend otomatis menjalankan yt-dlp dengan runtime Node (`--js-runtimes node:<node backend>`). Kalau hosting memakai path Node khusus, isi `YTDLP_JS_RUNTIMES=node:/path/to/node`.

Jika client YouTube utama gagal, backend juga mencoba fallback `player_client=default` (`YTDLP_ALT_CLIENT_FALLBACKS=true`) sebelum menyerah.

Render Free tetap punya batasan: service bisa sleep saat idle, filesystem tidak permanen, dan resource bukan untuk traffic besar terus-menerus. Tetapi untuk backend FFmpeg gratis, ini lebih kuat daripada Vercel serverless.
