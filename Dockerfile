FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY client/package*.json ./client/
RUN cd client && npm ci

COPY server ./server
COPY client ./client

ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN cd client && npm run build

ENV NODE_ENV=production
ENV PORT=7860
ENV CLIENT_DIST=/app/client/dist
ENV CLIENT_ORIGIN=
ENV MAX_UPLOAD_MB=250
ENV INLINE_AUDIO_LIMIT_MB=8
ENV DATA_DIR=/data
ENV JWT_SECRET=audio-studio-change-this-secret
ENV GOOGLE_CLIENT_ID=
ENV ADMIN_SECRET=
ENV EMAIL_DEV_CODES=true
ENV PROCESS_RATE_LIMIT=12
ENV INFO_RATE_LIMIT=45
ENV JSON_LIMIT=512kb
ENV FREE_CONVERT_LIMIT=3
ENV FREE_DURATION_LIMIT_SECONDS=600
ENV APP_NAME=Audio\ Studio
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

CMD ["node", "server/server.js"]
