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

RUN cd client && npm run build

ENV NODE_ENV=production
ENV PORT=7860
ENV CLIENT_DIST=/app/client/dist
ENV CLIENT_ORIGIN=
ENV MAX_UPLOAD_MB=250
ENV INLINE_AUDIO_LIMIT_MB=8
ENV DATA_DIR=/data
ENV JWT_SECRET=audio-studio-change-this-secret
ENV PROCESS_RATE_LIMIT=12
ENV INFO_RATE_LIMIT=45
ENV JSON_LIMIT=512kb

EXPOSE 7860

CMD ["node", "server/server.js"]
