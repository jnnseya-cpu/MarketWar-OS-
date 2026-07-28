# MarketWar video render worker — FFmpeg + Node.
# Deploy to Cloud Run, Fly.io or Railway. It polls the app's job queue; no
# inbound port is required.
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.mjs ./

# Renders are CPU-bound; give the container at least 1 vCPU and 2GB.
ENV NODE_ENV=production
CMD ["node", "index.mjs"]
