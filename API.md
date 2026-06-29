# Audio Studio API Documentation

Dokumentasi lengkap untuk Audio Studio API endpoints.

## Base URL

- Development: `http://localhost:4000`
- Production: URL deployment Anda (Hugging Face Space, VPS, dll)

## Authentication

Audio Studio menggunakan mode **upload-only tanpa login**. API key Roblox dikirim per-request di body, tidak disimpan di server.

## Endpoints

### Audio Processing

#### POST /api/process

Upload file audio dan proses dengan efek yang dikonfigurasi.

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `audio` (file, required): File audio (mp3, wav, ogg, m4a, aac, flac)
  - `settings` (string, optional): JSON string dengan konfigurasi audio
  - `segmentSeconds` (number, optional): Durasi per part dalam detik (default: 180, range: 30-420)
  - `title` (string, optional): Judul audio

**Settings JSON:**
```json
{
  "speed": 2.3,
  "amplify": -4,
  "pitch": 0,
  "bassBoost": false,
  "reverb": false,
  "normalize": false,
  "echo": false,
  "fadeIn": 0,
  "fadeOut": 0,
  "trimStart": 0,
  "trimEnd": 0,
  "eqPreset": "",
  "maxDuration": 300,
  "maxDurationLimit": 3600
}
```

**Response (200 OK):**
```json
{
  "title": "My Audio",
  "parts": [
    {
      "index": 1,
      "fileName": "processed-abc123-001.ogg",
      "audioUrl": "/api/files/processed-abc123-001.ogg",
      "audioDataUrl": "data:audio/ogg;base64,...",
      "duration": 180.5,
      "durationText": "3:00",
      "sizeBytes": 2880000
    }
  ],
  "partCount": 1,
  "segmentSeconds": 180,
  "segmentText": "3:00",
  "totalDuration": 180.5,
  "totalDurationText": "3:00",
  "sourceDuration": 420,
  "sourceDurationText": "7:00",
  "appliedSettings": {
    "speed": 2.3,
    "amplify": -4,
    "pitch": 0
  },
  "appliedEffects": ["Tempo 2.3x", "Volume -4 dB"],
  "warnings": [],
  "output": {
    "format": "ogg",
    "codec": "libvorbis",
    "bitrate": "128k"
  }
}
```

**Errors:**
- `400`: File tidak valid atau settings tidak valid
- `408`: Konversi melebihi batas waktu
- `422`: Konversi FFmpeg gagal

---

### Roblox Integration

#### POST /api/upload-roblox

Upload audio hasil proses ke Roblox Open Cloud.

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `audio` (file, required): File audio hasil proses
  - `payload` (string, required): JSON string dengan konfigurasi upload

**Payload JSON:**
```json
{
  "apiKey": "your-roblox-api-key",
  "creator": {
    "userId": "123456789",
    "groupId": ""
  },
  "displayName": "My Audio - Part 1",
  "description": "Uploaded via Audio Studio",
  "splitDuration": 180
}
```

**Response (200 OK):**
```json
{
  "parts": [
    {
      "part": 1,
      "status": "Accepted",
      "assetId": "123456789",
      "rbxassetid": "rbxassetid://123456789",
      "operationId": "operation-abc123",
      "httpStatus": 200,
      "error": null,
      "trace": [
        {
          "step": "Persiapan",
          "status": "Pending",
          "message": "Part 1 siap dikirim (2880 KB)."
        },
        {
          "step": "Submit Open Cloud",
          "status": "Accepted",
          "message": "Roblox menerima request. Operation ID: operation-abc123."
        },
        {
          "step": "Moderasi Roblox",
          "status": "Accepted",
          "message": "Asset diterima Roblox dengan ID 123456789."
        }
      ]
    }
  ],
  "wasSplit": false,
  "uploadSummary": {
    "creator": {
      "userId": "123456789"
    },
    "mode": "personal",
    "partCount": 1,
    "accepted": 1,
    "failed": 0,
    "pending": 0,
    "split": false,
    "limits": {
      "maxDuration": 420,
      "maxBytes": 19922944
    }
  }
}
```

**Errors:**
- `400`: API key atau creator tidak valid
- `401`: API key ditolak Roblox
- `413`: File terlalu besar
- `429`: Rate limit tercapai

---

#### POST /api/roblox-test

Test validitas API key Roblox dan target creator.

**Request:**
- Content-Type: `application/json`
- Body:
```json
{
  "apiKey": "your-roblox-api-key",
  "creator": {
    "userId": "123456789"
  }
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "status": 404,
  "message": "Koneksi Roblox Open Cloud valid. Upload final tetap bergantung pada permission creator dan moderasi Roblox.",
  "creator": {
    "userId": "123456789"
  },
  "warnings": [],
  "trace": [
    {
      "step": "Target",
      "status": "Accepted",
      "message": "Mode personal siap dicek."
    },
    {
      "step": "Open Cloud",
      "status": "Accepted",
      "message": "API key diterima. Operation dummy tidak ditemukan, artinya koneksi valid."
    }
  ]
}
```

---

#### POST /api/asset-status

Cek status moderasi asset Roblox berdasarkan operationId.

**Request:**
- Content-Type: `application/json`
- Body:
```json
{
  "operationId": "operation-abc123",
  "apiKey": "your-roblox-api-key"
}
```

**Response (200 OK):**
```json
{
  "status": "Accepted",
  "assetId": "123456789",
  "rbxassetid": "rbxassetid://123456789"
}
```

**Status values:**
- `Pending`: Masih dalam moderasi
- `Accepted`: Diterima
- `Failed`: Ditolak

---

### AI Integration

#### GET /api/ai/status

Cek apakah konfigurasi AI sudah lengkap.

**Response (200 OK):**
```json
{
  "configured": true,
  "model": "gpt-3.5-turbo",
  "baseUrl": "https://api.openai.com/v1"
}
```

---

#### POST /api/ai/chat

Kirim chat ke AI model yang dikonfigurasi.

**Request:**
- Content-Type: `application/json`
- Body:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Bagaimana cara mengoptimalkan audio untuk game?"
    }
  ],
  "temperature": 0.7,
  "maxTokens": 1000
}
```

**Response (200 OK):**
```json
{
  "reply": "Untuk mengoptimalkan audio untuk game, Anda bisa...",
  "usage": {
    "promptTokens": 15,
    "completionTokens": 150,
    "totalTokens": 165
  }
}
```

---

### System

#### GET /health

Health check endpoint.

**Response (200 OK):**
```json
{
  "ok": true,
  "name": "Audio Studio API",
  "mode": "upload-only",
  "uptime": 3600,
  "uploads": true
}
```

---

#### GET /api/stats

Monitoring endpoint untuk observability.

**Response (200 OK):**
```json
{
  "uptime": 3600,
  "queues": {
    "conversion": {
      "active": 0,
      "queued": 0,
      "maxQueue": 20,
      "concurrency": 2
    },
    "roblox": {
      "active": 0,
      "queued": 0,
      "maxQueue": 15,
      "concurrency": 1
    }
  },
  "memory": {
    "rss": 85000000,
    "heapUsed": 45000000,
    "heapTotal": 67000000,
    "external": 2500000
  },
  "node": "v20.10.0",
  "pid": 12345
}
```

---

## Rate Limiting

Semua endpoints memiliki rate limiting:

- `/api/process`: 30 requests per 30 menit
- `/api/upload-roblox`: 60 requests per 30 menit
- `/api/roblox-test`: 60 requests per 1 menit
- `/api/asset-status`: 60 requests per 1 menit
- `/api/stats`: 20 requests per 1 menit

Response ketika rate limit tercapai:
```json
{
  "error": "Limit konversi sementara tercapai. Coba lagi beberapa menit.",
  "status": 429
}
```

---

## File Size Limits

- Max upload size: 250 MB (configurable via `MAX_UPLOAD_MB`)
- Max audio duration: 420 seconds per part (Roblox limit)
- Max audio size: 19 MB per part (Roblox limit)

---

## Error Handling

Semua error responses memiliki format:
```json
{
  "error": "Error message",
  "status": 400,
  "requestId": "abc123",
  "details": []
}
```

---

## CORS

CORS dikonfigurasi berdasarkan environment variable `ALLOWED_ORIGINS`. Jika tidak diset, CORS terbuka untuk semua origins (aman karena tidak ada session/cookie).

---

## Notes

- Audio hasil proses disimpan sementara di server (3 jam) sebelum dibersihkan otomatis
- API key Roblox tidak pernah disimpan di server
- Semua konversi menggunakan FFmpeg dengan libvorbis codec
- Output format selalu OGG dengan bitrate 128k
