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

Render Free tetap punya batasan: service bisa sleep saat idle, filesystem tidak permanen, dan resource bukan untuk traffic besar terus-menerus. Tetapi untuk backend FFmpeg gratis, ini lebih kuat daripada Vercel serverless.
