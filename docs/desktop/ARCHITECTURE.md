# SahamLens Desktop Architecture

## Product boundary

SahamLens Desktop is a dedicated research workstation, not a web-page wrapper. It shares domain behavior with SahamLens web while owning a different shell and interaction model.

## Runtime topology

```text
Tauri window
  └─ local static assets from desktop-web/out
       ├─ desktop shell
       ├─ ticker tabs
       ├─ multi-panel workspace
       ├─ command system
       └─ shared research components/services
             │
             └─ narrow Tauri commands
                   └─ HTTPS → sahamlens.id/api/*
```

The installer contains no database, provider secret, or server business logic.

## Code ownership

### Shared with web

- API types and client semantics;
- research/domain services;
- financial calculations and methodology;
- chart primitives;
- provenance, freshness, and data-quality semantics;
- server authentication and account data;
- common visual tokens where appropriate.

### Web-owned

- responsive/mobile shell;
- SEO route presentation;
- marketing and public landing composition;
- server-rendered route behavior.

### Desktop-owned

- workstation shell;
- ticker tabs;
- panel layout and docking rules;
- saved workspace schema;
- command palette and shortcut registry;
- native adapters for credentials, HTTP, file dialogs, clipboard, deep links, window state, notifications, and updates.

## Current implementation baseline

- `desktop-web/` is the intended static-export target.
- `desktop-web/app/layout.tsx` currently mounts the shared web `AppShell`; this must be replaced by a desktop shell during M2.
- Most desktop routes currently re-export or render shared web page components. They prove capability availability but not final desktop UX.
- Dynamic technical detail routes are redirected to `/dashboard?symbol=...` by `native-navigation-bridge.tsx` because static export must not generate one page per IDX symbol.
- `desktop/src/` is a temporary Vite rollback UI. It must not receive new product features and can be removed only after an explicit rollback-readiness decision.

## State model

### Ticker context

- One active ticker per internal tab.
- Panels inside the tab consume the same ticker context.
- URL/query state is used where it improves recoverability and deep links.
- Switching tabs must invalidate or label prior ticker data; old data must never appear fresh under a new ticker.

### Workspace state

Persist only non-sensitive presentation state:

- panel types and positions;
- panel dimensions;
- tab ticker identifiers;
- selected workspace;
- window size/position after monitor validation;
- visual preferences.

Do not persist bearer tokens, API response bodies, LensAI conversations, portfolio details, or watchlist details in generic workspace storage.

Use a versioned schema with safe-default recovery for corrupt or incompatible state.

## Navigation model

- Internal static-safe destinations use desktop routing.
- Web dynamic detail URLs map to desktop ticker/workspace context.
- Account/legal/support destinations use a desktop dialog or an explicitly safe external HTTPS page.
- Unknown internal paths and unsafe URL schemes fail closed.
- Admin and development routes are not exposed in retail navigation.

## UI composition

The desktop shell contains:

1. context bar;
2. navigator;
3. ticker tab strip;
4. main multi-panel workspace;
5. inspector/LensAI area;
6. activity/data-status dock.

The minimum supported viewport is 1024 × 700. Desktop composition is not derived from the mobile layout.

## Data and trust contract

Desktop must preserve server semantics for source, as-of, freshness, coverage, missing, valid zero, official, proxy, estimate, derived value, restriction, suspension, UMA, and investability. Presentation may differ; meaning may not.

No desktop-only financial formula or scoring fork is allowed. A new calculation must live in the shared domain layer or be explicitly labelled as presentation-only derived data.

## Build paths

- Development static target: `npm run dev:desktop-web`.
- Static export: `npm run build:desktop-web`.
- Legacy Vite rollback check: `npm --prefix desktop run build:native`.
- Rust tests: `cargo test --manifest-path desktop/src-tauri/Cargo.toml`.
- Tauri packaging: executed through the desktop package/Tauri CLI on the target OS.

`npm run verify:prod` remains required for shared application safety, but it does not replace Rust, static-export, native integration, or installer tests.

## Platform strategy

- Closed beta: Windows 11.
- macOS/Linux: only after their build, signing, updater, and QA gates pass.
- Multi-window: P1 after single-window stability.

## Architecture guardrails

- Do not add features to the legacy Vite UI.
- Do not copy server logic into Rust or desktop components.
- Do not make direct network requests from arbitrary panels; use the approved shared client/native bridge path.
- Do not store secrets in renderer-accessible storage.
- Do not mark capability parity verified because a route exists; test the desktop user job.
