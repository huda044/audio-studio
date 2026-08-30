# ============================================
# Stage 1: Build client
# ============================================
FROM node:20-bookworm-slim AS builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ .
RUN npm run build

# ============================================
# Stage 2: Production image
# ============================================
FROM node:20-bookworm-slim

# Minimal system deps: curl untuk healthcheck
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# yt-dlp untuk fitur import audio dari link YouTube (binary standalone, tanpa python).
# Diambil saat build dari rilis resmi GitHub — gratis, tanpa API key.
RUN mkdir -p /app/bin \
  && curl -fsSL -o /app/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
  && chmod +x /app/bin/yt-dlp

WORKDIR /app

# Copy built client dari stage 1
COPY --from=builder /app/client/dist ./client/dist

# Install server deps (production only)
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy server source
COPY server ./server

# Non-root user untuk security
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

# Environment defaults
ENV NODE_ENV=production
ENV PORT=7860
ENV CLIENT_DIST=/app/client/dist
ENV UPLOADS_DIR=/tmp/audio-studio-uploads
ENV MAX_UPLOAD_MB=250
ENV INLINE_AUDIO_LIMIT_MB=8
ENV APP_MAX_DURATION_SECONDS=200
ENV JSON_LIMIT=512kb
ENV PROCESS_RATE_LIMIT=30
ENV INFO_RATE_LIMIT=60
ENV CONVERSION_CONCURRENCY=2
ENV CONVERSION_QUEUE_LIMIT=20
ENV ROBLOX_AUDIO_MAX_DURATION_SECONDS=420
ENV ROBLOX_AUDIO_MAX_BYTES=19922944
ENV ROBLOX_UPLOAD_CONCURRENCY=1
ENV ROBLOX_UPLOAD_QUEUE_LIMIT=15
ENV SHUTDOWN_TIMEOUT_MS=10000
# Import YouTube (yt-dlp): lokasi binary, batas durasi sumber, limit request per 30 menit.
ENV YTDL_PATH=/app/bin/yt-dlp
ENV YTDL_MAX_DURATION_SECONDS=3600
ENV YT_IMPORT_RATE_LIMIT=10
# Smart split: potong di jeda hening (ffmpeg silencedetect). true = matikan.
ENV DISABLE_SMART_SPLIT=false
ENV SMART_SILENCE_NOISE_DB=-35
ENV SMART_SILENCE_MIN_D=0.5

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:7860/health || exit 1

CMD ["node", "server/server.js"]
