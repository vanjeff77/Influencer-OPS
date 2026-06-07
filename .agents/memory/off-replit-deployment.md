---
name: Off-Replit deployment
description: What breaks and what to configure when hosting this app outside Replit (Koyeb/Render/Fly/etc.)
---

# Hosting this app off Replit

The app itself is portable: server binds `process.env.PORT || 5000` on `0.0.0.0`,
session store is connect-pg-simple (DB-backed), Replit vite plugins (cartographer,
dev-banner) are guarded behind `REPL_ID !== undefined`. `npm run build` + `npm start`
work anywhere. A root `Dockerfile` exists for Koyeb/Docker hosts.

## Two real things that break off Replit

1. **Replit-managed integrations** — Gmail, OneDrive, Google Sheets, OpenAI AI all
   depend on `REPLIT_CONNECTORS_HOSTNAME` / Replit identity (server/gmail.ts,
   onedrive.ts, google-sheets.ts, ai/llm-provider.ts). They DO NOT work off Replit and
   must be re-implemented with the user's own API keys/OAuth. This is the biggest rework.
   **Why:** these features silently use Replit infra, not user-provided secrets.

2. **PDF generation (Puppeteer)** — needs system Chromium + libs, absent on most
   default Node images. `server/routes.ts` findChromiumPath() prefers
   `PUPPETEER_EXECUTABLE_PATH` then `/usr/bin/chromium`, and **gracefully disables PDF**
   (does not crash) if Chromium is missing. The Dockerfile installs Debian `chromium`
   and sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.

## Other migration must-dos
- External Postgres (Neon/Supabase) — Replit DB isn't externally reachable. Set DATABASE_URL, run `npm run db:push` once.
- Google OAuth callback uses dynamic `${protocol}://${host}/api/email/gmail/callback` — register the NEW prod domain's redirect URIs in Google Cloud Console or login breaks.
- Env vars to set: DATABASE_URL, SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, RAPIDAPI_KEY (+ own keys for the integrations above).
- Free/tiny instances (e.g. Koyeb nano 512MB) may OOM during Chromium PDF generation.
