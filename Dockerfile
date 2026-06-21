FROM node:20-bookworm-slim

# curl untuk healthcheck. FFmpeg/ffprobe disediakan oleh paket npm ffmpeg-static & ffprobe-static.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install server deps (layer caching)
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Install client deps
COPY client/package*.json ./client/
RUN cd client && npm ci

# Copy source
COPY server ./server
COPY client ./client

# Build client
RUN cd client && npm run build

# Cleanup
RUN rm -rf /root/.npm /tmp/*

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

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:7860/health || exit 1

CMD ["node", "server/server.js"]
