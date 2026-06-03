FROM node:20-bookworm-slim

# Install system dependencies in one layer with cleanup
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg git python3 python3-pip python3-venv \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && python3 -m venv /opt/yt-dlp-venv \
  && /opt/yt-dlp-venv/bin/pip install --no-cache-dir -U "yt-dlp[default]" PySocks bgutil-ytdlp-pot-provider \
  && printf '#!/bin/sh\nexec /opt/yt-dlp-venv/bin/python -m yt_dlp "$@"\n' > /usr/local/bin/yt-dlp-py \
  && chmod a+rx /usr/local/bin/yt-dlp-py \
  && git clone --depth 1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil-ytdlp-pot-provider \
  && cd /opt/bgutil-ytdlp-pot-provider/server \
  && npm ci \
  && npx tsc \
  && rm -rf /var/lib/apt/lists/* /tmp/* /root/.cache

WORKDIR /app

# Install server dependencies first (better layer caching)
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Install client dependencies
COPY client/package*.json ./client/
RUN cd client && npm ci

# Copy source code
COPY server ./server
COPY client ./client

# Build client
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN cd client && npm run build

# Clean up npm caches
RUN rm -rf /root/.npm /tmp/*

ENV NODE_ENV=production
ENV PORT=7860
ENV CLIENT_DIST=/app/client/dist
ENV CLIENT_ORIGIN=
ENV MAX_UPLOAD_MB=250
ENV INLINE_AUDIO_LIMIT_MB=8
ENV DATA_DIR=/data
ENV DATABASE_URL=
ENV POSTGRES_SSL=
ENV DATA_STORE_NAMESPACE=audio-studio
ENV DATA_STORE_TABLE=audio_studio_kv
ENV JWT_SECRET=
ENV SECRETS_MASTER_KEY=
ENV GOOGLE_CLIENT_ID=
ENV ADMIN_BOOTSTRAP_USERNAME=
ENV ADMIN_BOOTSTRAP_EMAIL=
ENV ADMIN_BOOTSTRAP_PASSWORD=
ENV ADMIN_BOOTSTRAP_RESET_PASSWORD=false
ENV EMAIL_DEV_CODES=true
ENV PROCESS_RATE_LIMIT=12
ENV INFO_RATE_LIMIT=45
ENV JSON_LIMIT=512kb
ENV YTDLP_FORCE_UPDATE=true
ENV YTDLP_PREFER_LOCAL=true
ENV YTDLP_STARTUP_UPDATE=true
ENV YTDLP_PATH=/usr/local/bin/yt-dlp-py
ENV YTDLP_BGUTIL_PROVIDER=true
ENV YTDLP_BGUTIL_PROVIDER_HOME=/opt/bgutil-ytdlp-pot-provider/server
ENV YTDLP_BGUTIL_PROVIDER_URL=http://127.0.0.1:4416
ENV YTDLP_BGUTIL_DISABLE_INNERTUBE=1
ENV YTDLP_BGUTIL_WARMUP_TIMEOUT_MS=90000
ENV YOUTUBE_PO_DOWNLOAD_ORDER=yt-dlp-section-mweb,yt-dlp-mweb,ytdl-core,direct-section-mweb,direct-url-mweb
ENV YOUTUBE_PO_GET_URL_TIMEOUT_MS=45000
ENV YTDLP_ENABLE_SECTIONS=true
ENV YTDLP_ALT_CLIENT_FALLBACKS=true
ENV YTDLP_FORCE_IPV4=true
ENV YTDLP_LEGACY_SERVER_CONNECT=false
ENV YTDLP_NO_CHECK_CERTIFICATES=false
ENV YTDLP_SOCKET_TIMEOUT=15
ENV YTDLP_RETRIES=2
ENV YTDLP_FRAGMENT_RETRIES=2
ENV YTDLP_EXTRACTOR_RETRIES=4
ENV YTDLP_RETRY_SLEEP=extractor:linear=1::4
ENV YTDLP_CONCURRENT_FRAGMENTS=1
ENV YOUTUBE_DOWNLOAD_ORDER=direct-section,direct-url,ytdl-core,yt-dlp
ENV YTDLP_GET_URL_TIMEOUT_MS=60000
ENV YTDLP_SECTION_TIMEOUT_MS=60000
ENV YTDLP_DOWNLOAD_TIMEOUT_MS=90000
ENV YOUTUBE_DIRECT_SECTION_TIMEOUT_MS=120000
ENV YOUTUBE_DIRECT_DOWNLOAD_TIMEOUT_MS=60000
ENV YTDL_CORE_DOWNLOAD_TIMEOUT_MS=60000
ENV YOUTUBE_PROXY=
ENV YOUTUBE_PROXY_STRICT=true
ENV YOUTUBE_PROXY_REQUIRED=false
ENV YOUTUBE_PROXY_PROTOCOL=http
ENV YOUTUBE_PROXY_HOST=
ENV YOUTUBE_PROXY_PORT=
ENV YOUTUBE_PROXY_USERNAME=
ENV YOUTUBE_PROXY_PASSWORD=
ENV FREE_CONVERT_LIMIT=3
ENV FREE_DURATION_LIMIT_SECONDS=600
ENV APP_NAME="Audio Studio"
ENV APP_PUBLIC_URL=
ENV APP_COLOR=#06b6d4
ENV SMTP_HOST=
ENV SMTP_PORT=587
ENV SMTP_SECURE=false
ENV SMTP_USER=
ENV SMTP_PASS=
ENV EMAIL_FROM=
ENV MIDTRANS_SERVER_KEY=
ENV MIDTRANS_CLIENT_KEY=
ENV MIDTRANS_PRODUCTION=false

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:7860/health || exit 1

CMD ["node", "server/scripts/start-server.mjs"]
