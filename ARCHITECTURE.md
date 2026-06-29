# Architecture

## System Overview

```mermaid
graph TB
    subgraph Client["Client (React + Vite)"]
        UI[UI Components]
        CTX[App Context]
        LIB[Lib Utilities]
        UI --> CTX
        CTX --> LIB
    end

    subgraph Server["Server (Express)"]
        MW[Middleware]
        ROUTES[Routes]
        SVC[Services]
        MW --> ROUTES
        ROUTES --> SVC
    end

    subgraph External["External Services"]
        ROBLOX[Roblox Open Cloud API]
        AI[AI Provider]
        FFMPEG[FFmpeg Binary]
    end

    Client -->|HTTP API| Server
    SVC --> ROBLOX
    SVC --> FFMPEG
    SVC --> AI
```

## Components

### Client (Frontend)

**Stack:** React 18, Vite, Framer Motion, TailwindCSS

**Structure:**
- `App.jsx` — Root component dengan Context Provider
- `pages/` — Page-level components (Dashboard, ConvertPage, dll)
- `components/` — Reusable UI components
- `lib/` — Utility functions (api, storage, format, utils)

**State Management:**
- React Context API untuk global state
- localStorage untuk persistence (roblox config, history, settings)
- No external state library (Context + hooks cukup untuk skala ini)

**Key Design Decisions:**
- Lazy loading pages berat (ConvertPage ~22KB) untuk initial load cepat
- IntersectionObserver untuk active section detection (efficient)
- API key Roblox di-obfuscate sederhana di localStorage (defense-in-depth)
- ErrorBoundary untuk graceful error handling

### Server (Backend)

**Stack:** Express, FFmpeg, Multer, Axios

**Structure:**
- `server.js` — Entry point, middleware setup, graceful shutdown
- `routes/` — API endpoints (audio, ai)
- `services/` — Business logic (ffmpeg, roblox, ai, taskQueue)
- `middleware/` — Rate limiting, security headers

**Request Flow:**
```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant F as FFmpeg
    participant R as Roblox API

    C->>S: POST /api/process (audio file + settings)
    S->>S: Rate limit check
    S->>S: Parse settings (clamp values)
    S->>F: probeAudio (get duration)
    S->>F: processFull (apply effects)
    S->>F: segmentFile (split into parts)
    S-->>C: Return parts list (inline base64 or URL)

    C->>S: POST /api/upload-roblox (audio part + apiKey)
    S->>S: Validate apiKey & creator
    S->>S: splitAudioIfNeeded (check Roblox limits)
    S->>R: POST /assets (upload audio)
    S->>R: GET /operations/{id} (poll status)
    S-->>C: Return asset status
```

### FFmpeg Pipeline

**Processing Steps:**

1. **Probe** — Baca metadata sumber (duration, codec, streams)
2. **Build Filters** — Susun FFmpeg audio filter chain:
   - `asetrate` + `aresample` (pitch shift)
   - `atempo` chain (speed change, chained untuk >2x)
   - `volume` (amplify/attenuate)
   - `equalizer` (EQ presets, bass boost)
   - `aecho` (reverb, echo)
   - `loudnorm` (normalize)
   - `afade` (fade in/out)
   - `aresample=44100` (final sample rate)
3. **Convert** — Run FFmpeg dengan filter chain + libvorbis codec
4. **Fallback** — Jika gagal, coba tanpa efek berat, lalu minimal (tempo+volume)
5. **Segment** — Potong output jadi parts dengan `-f segment`

**Fallback Strategy:**
```
Full filters → Level 1 (tanpa normalize/reverb/echo) → Minimal (tempo + volume)
```

### Roblox Integration

**Upload Flow:**
1. Validasi ukuran & durasi vs limit Roblox
2. Split jika melebihi limit (durasi max 420s, size max 19MB)
3. POST ke `apis.roblox.com/assets/v1/assets` dengan multipart form
4. Poll `apis.roblox.com/assets/v1/operations/{id}` sampai `done=true`
5. Return status: Accepted / Pending / Failed

**Retry Strategy:**
- Retry pada 429 (rate limit) dan 5xx (server error)
- Max 2 retries dengan exponential backoff
- Non-retryable: 400, 401, 403, 413

## Security Model

```mermaid
graph LR
    subgraph Browser["Browser"]
        LS[localStorage]
        APIKEY[API Key]
        LS -->|obfuscated| APIKEY
    end

    subgraph Server["Server"]
        REQ[Request Body]
        PROC[Process]
        CLEANUP[Auto Cleanup]
        REQ -->|temporary| PROC
        PROC -->|3 hours| CLEANUP
    end

    subgraph Roblox["Roblox"]
        OC[Open Cloud API]
    end

    APIKEY -->|per-request| REQ
    PROC -->|apiKey header| OC
```

**Key Principles:**
- **No login/sessions** — API key dikirim per-request, tidak disimpan di server
- **No database** — Semua data user di localStorage browser
- **API key obfuscation** — Sederhana XOR/base64 di localStorage (bukan encryption)
- **Path traversal protection** — File serving memakai `path.basename()` + resolve check
- **Security headers** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **Rate limiting** — Per-endpoint, mencegah abuse
- **File cleanup** — Auto-delete uploads >3 jam
- **CORS** — Terbuka default (aman karena no session), bisa dibatasi via env

## Performance Considerations

### Client
- **Code splitting** — Lazy load pages berat
- **IntersectionObserver** — Efficient active section tracking
- **memo()** — Cegah re-render komponen statis
- **Inline base64** — Audio <8MB inline untuk hemat request, >8MB via URL

### Server
- **Task Queue** — Konversi & upload di-queue (concurrency configurable)
- **Single probe** — Probe sumber sekali, pass ke service (hindari double-probe)
- **Compression** — gzip semua response kecuali base64 audio (X-No-Compression)
- **Static caching** — Hash assets immutable cache, index.html no-cache
- **Graceful shutdown** — Drain connections sebelum exit

### FFmpeg
- **libvorbis 128k** — Balance quality vs size
- **44100 Hz** — Sample rate standar
- **Segment filter** — Split cepat tanpa re-encode ulang
- **Timeout** — 10 menit max per konversi (FFMPEG_TIMEOUT_MS)

## Deployment

**Single Container:**
- Express serve both API + static client (built by Vite)
- Port 7860 (Hugging Face default)
- FFmpeg binary dari `ffmpeg-static` npm package

**Environment Variables:**
- `PORT` — Server port (default 4000)
- `CLIENT_DIST` — Path ke built client (serve SPA)
- `MAX_UPLOAD_MB` — Max upload size (default 250)
- `CONVERSION_CONCURRENCY` — Parallel conversions (default 2)
- `ALLOWED_ORIGINS` — CORS whitelist (comma-separated)
- `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` — AI integration
