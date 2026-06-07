# Dockerfile for deploying on Koyeb (or any Docker-based host)
# Uses a full Node 20 image so native modules build reliably,
# and installs system Chromium so PDF generation (Puppeteer) works.
FROM node:20-bookworm

# Install Chromium + fonts (incl. Korean) for Puppeteer/PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-cjk \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Use the system Chromium and skip Puppeteer's own download
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Skip Playwright's browser download too (we use system Chromium)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Install ALL dependencies (dev deps are needed for the build step)
COPY package*.json ./
RUN npm ci

# Copy the rest of the source and build client + server
COPY . .
RUN npm run build

# Koyeb provides the PORT env var; the server reads process.env.PORT
EXPOSE 8000

# "npm start" runs: NODE_ENV=production node dist/index.cjs
CMD ["npm", "start"]
