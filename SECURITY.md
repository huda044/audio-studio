# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 2.x     | ✅ Active support  |
| < 2.0   | ❌ No support      |

## Reporting a Vulnerability

Jika Anda menemukan vulnerability keamanan, **JANGAN** buat issue publik di GitHub.

Laporkan via email ke: **security@huda044.dev**

Sertakan:
1. Deskripsi vulnerability
2. Langkah reproduksi
3. Potensi impact
4. Saran perbaikan (jika ada)

### Response Time

- **Konfirmasi**: dalam 48 jam
- **Assessment**: dalam 5 hari kerja
- **Fix release**: tergantung severity (max 30 hari)

## Security Measures

### API Key Handling
- API key Roblox **tidak disimpan** di server
- API key dikirim per-request di body, bukan header persisten
- API key di client di-obfuscate sederhana (bukan encryption)
- Jangan gunakan API key penting di perangkat publik

### Security Headers
- `Content-Security-Policy` — mencegah XSS, inline script injection
- `Strict-Transport-Security` — enforce HTTPS
- `X-Frame-Options: SAMEORIGIN` — mencegah clickjacking
- `X-Content-Type-Options: nosniff` — mencegah MIME sniffing
- `Referrer-Policy` — control referrer information
- `Permissions-Policy` — disable unused browser features

### Rate Limiting
- `/api/process`: 30 requests / 30 menit
- `/api/upload-roblox`: 60 requests / 30 menit
- `/api/roblox-test`: 60 requests / menit
- `/api/asset-status`: 60 requests / menit
- `/api/stats`: 20 requests / menit

### File Handling
- Path traversal protection pada file serving
- File upload difilter berdasarkan mimetype & extension
- File sementara dibersihkan otomatis setiap 30 menit
- Max upload size: 250 MB (configurable)

### No Session/Database
- Tidak ada login/sessions/cookies
- Tidak ada database
- CORS terbuka aman (no credentials to steal)
- Semua data user di localStorage browser

## Best Practices untuk Deployment

1. Set `ALLOWED_ORIGINS` di production untuk batasi CORS
2. Gunakan HTTPS (Let's Encrypt / Cloudflare)
3. Set `NODE_ENV=production`
4. Monitor logs untuk suspicious activity
5. Update dependencies secara berkala: `npm audit`
6. Gunakan reverse proxy (Nginx) untuk additional protection

## Dependency Security

 Jalankan `npm audit` secara berkala:
```bash
cd server && npm audit
cd client && npm audit
```

GitHub Dependabot akan otomatis membuat PR untuk security updates.
