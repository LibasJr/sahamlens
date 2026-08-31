# SahamLens Desktop

Tauri v2 + React + TypeScript trading terminal. Desktop is a client of the existing SahamLens API; it does not bundle Next.js, Postgres, Redis, or server secrets.

## Development

```bash
npm install
npm run tauri dev
```

The desktop shell is intentionally separate from `app/`. New web capabilities should be exposed through existing `/api/*` contracts and composed into desktop panels. Pure TypeScript domain logic can be reused from `modules/` only after extracting it into a browser-safe shared package.

## Feature map

| Web capability | Desktop destination |
| --- | --- |
| Watchlist and quotes | Watchlist rail + chart instrument |
| Technical analysis | Chart tools and analysis workspace |
| Fundamental analysis | Research drawer/panel |
| Screener | Market Screener table |
| Alerts and portfolio | Order panel/account workspace |
| LensScore and AI | Real-time AI Insights card |
