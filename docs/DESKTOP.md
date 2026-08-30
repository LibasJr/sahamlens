# SahamLens Desktop

SahamLens Desktop is a Tauri client for `https://sahamlens.id`.

## Window profile

- Title: `SahamLens — Analisis Saham Indonesia`
- Default size: 1440 × 900
- Minimum size: 1024 × 700
- Resizable and focused on launch
- Backend and authentication remain on SahamLens over HTTPS

## Security boundary

The desktop client contains no database credentials or provider API keys. Tauri prototype freezing is enabled and asset CSP modification is not allowed. External navigation remains handled by the hosted SahamLens application; no native command is exposed to the webview.
