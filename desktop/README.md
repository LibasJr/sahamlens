# SahamLens Desktop

Tauri v2 + React + TypeScript research workspace. Desktop is a client of the existing SahamLens API; it does not bundle Next.js, Postgres, Redis, or server secrets.

## Development

```bash
cd desktop
npm ci
npm run tauri:dev
```

From the repository root, use `npm run desktop:dev` and `npm run desktop:build`.
`desktop/` is the canonical Tauri application; the root web app remains the SahamLens API and web client.

The desktop shell is intentionally separate from `app/`. New web capabilities should be exposed through existing `/api/*` contracts and composed into desktop panels. Pure TypeScript domain logic can be reused from `modules/` only after extracting it into a browser-safe shared package.

Public market research (market pulse, screener, chart, and summaries) must work without an account. Account-only endpoints require a purpose-built desktop authentication flow; never collect web credentials in a renderer request that cannot complete the server's same-origin protection.

## Feature map

| Web capability | Desktop destination |
| --- | --- |
| Watchlist and quotes | Watchlist rail + chart instrument |
| Technical analysis | Chart tools and analysis workspace |
| Fundamental analysis | Research drawer/panel |
| Screener | Market Screener table |
| Alerts and portfolio | Research panel/account workspace |
| LensScore and AI | Real-time AI Insights card |
