#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env.oracle ]; then
  echo "Missing .env.oracle. Copy .env.oracle.example to .env.oracle and fill secrets first."
  exit 1
fi

mkdir -p data uploads

docker compose -f docker-compose.oracle.yml build --pull
docker compose -f docker-compose.oracle.yml up -d

echo "Deploy complete."
echo "Health:"
curl -fsS http://127.0.0.1:7860/health || true
echo
echo "YouTube runtime:"
curl -fsS http://127.0.0.1:7860/api/youtube-runtime-status || true
echo
