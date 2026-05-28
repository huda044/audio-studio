FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
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

EXPOSE 7860

CMD ["node", "server/server.js"]
