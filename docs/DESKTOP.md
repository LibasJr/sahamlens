# SahamLens Desktop

SahamLens Desktop is a native research workstation for Indonesian retail investors. It shares SahamLens data, methodology, account services, and API contracts, but it has a dedicated desktop shell and interaction model.

It is not a packaged copy of the website. The target experience uses ticker tabs, a resizable multi-panel workspace, saved layouts, keyboard commands, and narrowly scoped native integrations.

## Product scope

- Purpose: education and independent retail research
- Commercial model: no paid package at this stage
- Initial beta platform: Windows 11
- Later platforms: macOS and Linux after platform-specific build, signing, and QA gates pass
- No broker execution, automated trading, or promise of returns

## Window profile

- Title: `SahamLens Desktop — Riset Saham Indonesia`
- Default size: 1440 × 920
- Minimum size: 1024 × 700
- Resizable and focused on launch
- Backend and authentication remain on SahamLens over HTTPS

## Architecture

- `desktop-web/`: intended static-export UI target
- `desktop/src-tauri/`: native security and operating-system boundary
- `desktop/src/`: temporary legacy Vite rollback UI; no new product features
- Backend/database/API routes: remain on SahamLens infrastructure

The installer contains no database credentials, provider API keys, or server business logic.

## Required differentiators from the website

The MVP must provide:

- a dedicated desktop shell rather than the web `AppShell`;
- internal ticker tabs;
- at least two simultaneous resizable research panels;
- saved and restorable workspaces;
- a command palette and keyboard-first navigation;
- OS-backed credential storage;
- safe native file, clipboard, deep-link, and window-state integration;
- all retail web capabilities through desktop-appropriate panels, tabs, dialogs, or safe support links.

## Current baseline warnings

The existing implementation is not beta-ready:

- the desktop static target still mounts the web shell;
- the bearer token is stored in renderer `localStorage`;
- Tauri CSP is `null`;
- native capabilities are broader than required;
- the API bridge needs stricter route, method, body, header, and redirect policy;
- product metadata still contains the former “Pro” name.

See:

- `docs/PRD-SAHAMLENS-DESKTOP.md`
- `docs/desktop/ARCHITECTURE.md`
- `docs/desktop/FEATURE-PARITY.md`
- `docs/desktop/SECURITY-BOUNDARY.md`

## Development

```bash
npm run dev:desktop-web
```

## Verification

From a worktree outside the production checkout:

```bash
npm run build:desktop-web
npm --prefix desktop run build:native
cargo test --manifest-path desktop/src-tauri/Cargo.toml
npm run verify:prod
```

`npm run verify:prod` validates shared application safety but does not replace Rust, Tauri, native integration, installer, signing, or platform tests.
