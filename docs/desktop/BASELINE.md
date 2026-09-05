# SahamLens Desktop M0 Baseline

**Date:** 2026-09-05  
**Branch:** `docs/desktop-pro-prd`  
**Baseline commit:** `4b946835`

## Environment preparation

The worktree initially had no installed Node dependencies. The first builds failed with `next: not found` and `tsc: not found`. Dependencies were installed from the committed lockfiles:

- root `npm ci`: 765 packages, 0 vulnerabilities reported;
- `desktop/npm ci`: 144 packages, 0 vulnerabilities reported.

No dependency manifest or lockfile was changed.

## Verified baseline

### Desktop static export

Command:

```bash
npm run build:desktop-web
```

Result: PASS.

- Next.js 16.3.3;
- production compilation succeeded;
- TypeScript succeeded;
- 46 static pages generated;
- dynamic market categories were generated through static params;
- technical detail is intentionally absent and currently maps through the desktop navigation bridge to dashboard ticker context.

### Legacy native UI rollback build

Command:

```bash
npm --prefix desktop run build:native
```

Result: PASS.

- TypeScript succeeded;
- Vite 6.4.3 built 1,863 modules;
- main JS bundle: 276.89 kB, 80.01 kB gzip.

This only proves the temporary Vite rollback UI builds. It does not prove the intended `desktop-web/` workstation UX.

### Rust unit tests

Command:

```bash
cargo test --manifest-path desktop/src-tauri/Cargo.toml
```

Result: PASS.

- library tests: 1 passed;
- binary tests: 0;
- doc tests: 0.

The only current Rust behavior test checks HTTPS/host/API-prefix URL validation. Route, method, body, redirect, credential, and capability hardening remain untested baseline gaps.

### Shared production verification

Command:

```bash
npm run verify:prod
```

Result: FAIL at the existing lint gate after earlier audits and typecheck ran.

- ESLint reported 147 problems: 16 errors and 131 warnings.
- The branch was synchronized to `origin/main` at `6650c9c` before this rerun.
- The documentation changes do not modify application source.
- The same lint gate remains red with 16 errors and 131 warnings; this is an existing repository blocker, not a Desktop documentation regression.

## Baseline conclusion

The static export, legacy UI build, and existing Rust test compile successfully on the Linux worktree. Shared `verify:prod` remains red at the existing lint gate on current `main`; implementation PRs must not claim the full production gate is green until that repository blocker is resolved. None of these checks prove Tauri packaging, Windows installer behavior, signing, updater, native credential storage, workstation UX, or release readiness.
