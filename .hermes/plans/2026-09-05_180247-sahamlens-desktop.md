# SahamLens Desktop Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Membangun SahamLens Desktop sebagai research workstation edukatif untuk investor ritel dengan seluruh capability web, UI/UX desktop khusus, multi-panel, tab emiten, saved workspace, keyboard-first workflow, dan integrasi native yang aman.

**Architecture:** Pertahankan satu backend, satu kontrak data, dan komponen domain/riset bersama. Pisahkan web shell dari desktop shell: `desktop-web/` memakai workspace, panel, tab, command system, dan adapter native khusus desktop, sedangkan `desktop/src-tauri/` menangani credential OS, API bridge, file dialog, clipboard, deep link, lifecycle window, signing, serta updater. UI Vite lama di `desktop/src/` hanya rollback sementara dan tidak menerima fitur baru.

**Tech Stack:** Next.js 16 static export, React 18, TypeScript, Vitest, Playwright, Tauri 2, Rust 2021, reqwest/rustls, Cargo tests, GitHub Actions.

---

## 1. Konteks dan Keputusan Final

- PRD final: `docs/PRD-SAHAMLENS-DESKTOP.md`.
- Nama produk: SahamLens Desktop. Tidak ada kata “Pro”.
- Tidak ada paket berbayar pada fase saat ini.
- Tujuan utama: edukasi dan riset mandiri investor ritel.
- Seluruh capability web harus dapat diakses dari desktop.
- Capability parity tidak berarti menyalin halaman web.
- MVP wajib memiliki shell desktop sendiri, multi-panel, tab emiten, saved workspace, command palette, secure credential storage, dan native integrations dasar.
- Windows 11 adalah target beta pertama; macOS/Linux menyusul setelah gate platform lulus.
- Multi-window adalah P1 setelah single-window stabil.

## 2. Gap Teknis Saat Ini

- `desktop-web/app/layout.tsx` masih memasang `AppShell` web.
- Banyak route desktop hanya meneruskan halaman/komponen web, belum menjadi panel workstation.
- `desktop-web/app/native-fetch-bridge.tsx` menyimpan token di `localStorage`.
- `desktop/src-tauri/src/lib.rs` belum membatasi route, method, body, dan redirect secara ketat.
- `desktop/src-tauri/tauri.conf.json` masih memakai `csp: null` dan nama lama.
- `desktop/src-tauri/capabilities/default.json` memakai window wildcard dan `shell:default`.
- Identitas package, title, tooltip, identifier, dan dokumentasi masih mengandung “Pro”.
- Belum ada feature parity matrix atau tests khusus workstation desktop.

## 3. Milestone

| Milestone | Hasil | Exit gate |
|---|---|---|
| M0 — Product/architecture baseline | Naming migration, feature parity matrix, ADR, test baseline | Semua capability web terpetakan; build baseline diketahui |
| M1 — Native security foundation | Credential vault, bridge policy, CSP, least privilege | Token tidak ada di renderer; security tests hijau |
| M2 — Desktop shell foundation | Shell khusus, command system, ticker context, tabs | Tidak memakai AppShell web; keyboard flow dasar lulus |
| M3 — Multi-panel workstation | Docking terbatas, resizable panels, saved workspace | Dua panel+ dan restore layout stabil |
| M4 — Full capability parity | Semua fitur web punya entry point desktop | Matrix tidak memiliki capability hilang tanpa keputusan |
| M5 — Education/trust quality | Explainability, provenance, freshness, restriction, risk-first | Semua data-quality fixtures dan edukasi utama lulus |
| M6 — Native integrations | Deep link, clipboard, file export, window state | Integrasi P0 aman dan teruji |
| M7 — Beta readiness | A11y, performance, security, packaging, signing | Closed beta Windows memenuhi go/no-go |
| M8 — P1 | Notifications, tray, updater, multi-window | Diprioritaskan dari hasil beta |

## 4. Urutan PR

1. PRD final + plan + feature parity baseline.
2. Rename runtime/product identifiers tanpa memutus upgrade path.
3. Native bridge hardening.
4. Secure credential storage.
5. CSP/capability lockdown.
6. Desktop shell + command system.
7. Ticker tabs + workspace state.
8. Multi-panel + saved layouts.
9. Capability parity batch per domain.
10. Education/data-quality consistency.
11. Native file/clipboard/deep-link/window state.
12. A11y/performance/observability gates.
13. Windows packaging/signing/release.

Setiap PR dibuat dari worktree, memakai TDD, menjalankan test target, `npm run verify:prod`, desktop static build, Cargo tests, dan tidak di-merge sebelum CI hijau.

## 5. Task Implementasi

### Task 1: Buat feature parity matrix

**Objective:** Memetakan seluruh capability web ke pengalaman desktop sebelum coding UI.

**Files:**
- Create: `docs/desktop/FEATURE-PARITY.md`
- Create: `docs/desktop/ARCHITECTURE.md`
- Create: `docs/desktop/SECURITY-BOUNDARY.md`
- Modify: `docs/DESKTOP.md`

**Steps:**
1. Inventaris `app/**/page.tsx`, navigasi, dan fitur yang dapat dipanggil tanpa route khusus.
2. Untuk setiap capability, catat entry point desktop, bentuk panel/tab/dialog/external, status, limitation, owner, dan acceptance test.
3. Bedakan riset, account, legal, public education, dan admin-only.
4. Jangan mengekspos fitur admin kepada pengguna ritel demi parity.
5. Tambahkan penjaga jumlah pada audit matrix agar scanner tidak lulus saat kosong.
6. Jalankan baseline `npm run build:desktop-web`, `npm --prefix desktop run build:native`, dan Cargo tests.
7. Commit: `docs(desktop): define capability parity and architecture`.

### Task 2: Migrasikan nama produk tanpa memutus upgrade

**Objective:** Menghapus kata “Pro” dari nama pengguna dan metadata sambil menjaga keputusan identifier aman.

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/package-lock.json`
- Modify: `desktop/src-tauri/Cargo.toml`
- Modify: `desktop/src-tauri/Cargo.lock`
- Modify: `desktop/src-tauri/tauri.conf.json`
- Modify: `desktop/src-tauri/src/lib.rs`
- Modify: `desktop/README.md`
- Modify: UI copy di `desktop/src/**` jika rollback tetap dipertahankan

**Steps:**
1. Tulis test/audit gagal untuk user-visible “SahamLens Pro” dan “paket Pro” di target desktop.
2. Putuskan melalui ADR apakah identifier `id.sahamlens.pro` dipertahankan sementara untuk upgrade compatibility atau dimigrasikan ke `id.sahamlens.desktop` sebelum distribusi publik.
3. Ubah product name, title, tooltip, package descriptions, dan visible copy menjadi SahamLens Desktop.
4. Jangan melakukan replace global terhadap istilah “professional” atau code yang tidak terkait produk.
5. Jalankan `npm ci` karena manifest/package lock berubah.
6. Jalankan Node build dan Cargo tests/build.
7. Commit: `refactor(desktop): rename product to SahamLens Desktop`.

### Task 3: Hardening API policy Rust

**Objective:** Membuat native bridge gagal tertutup.

**Files:**
- Create: `desktop/src-tauri/src/api_policy.rs`
- Modify: `desktop/src-tauri/src/lib.rs`
- Test: unit tests di `api_policy.rs`

**TDD:**
1. Test menerima hanya HTTPS host resmi dan route yang diizinkan.
2. Test menolak host/subdomain/port/userinfo/scheme lain dan encoded traversal.
3. Test method unknown gagal, bukan fallback GET.
4. Test body size, GET/HEAD body, header allowlist, dan redirects.
5. Implementasikan policy minimum.
6. Jalankan `cargo test --manifest-path desktop/src-tauri/Cargo.toml api_policy` lalu seluruh Cargo tests.
7. Commit: `security(desktop): enforce native API policy`.

### Task 4: Contract tests fetch/navigation bridge

**Objective:** Membuat renderer bridge dapat diuji tanpa Tauri GUI.

**Files:**
- Create: `desktop-web/app/native-fetch-policy.ts`
- Create: `desktop-web/app/native-navigation-policy.ts`
- Modify: kedua bridge React
- Create: tests di `desktop-web/app/__tests__/`

**TDD:**
1. Test bundled/API/external origins, login rewrite, logout/401, HEAD, request ID, malformed payload.
2. Test technical rewrite, external links, `_blank`, modifier click, javascript/file/data schemes.
3. Implementasikan fungsi policy murni lalu adapter React tipis.
4. Jalankan Vitest target, typecheck, lint, dan static export.
5. Commit: `test(desktop): cover native renderer bridges`.

### Task 5: Secure credential storage

**Objective:** Menghapus bearer token dari localStorage dan renderer.

**Files:**
- Create: `desktop/src-tauri/src/credentials.rs`
- Modify: Rust manifest, lib, capability config
- Modify: `desktop-web/app/native-fetch-bridge.tsx`
- Modify/create: Rust dan TypeScript tests
- Create: ADR secure storage

**TDD:**
1. Pilih Tauri 2/keychain adapter berdasarkan audit dependency nyata.
2. Test set/get/delete dan redaction.
3. Ubah login agar Rust menyimpan token dan renderer menerima profil non-sensitif.
4. Ubah native request agar token diinjeksi Rust.
5. Hapus field token dari command arguments.
6. Pada logout/401, hapus credential.
7. Hapus legacy localStorage token; bila migrasi tidak aman, minta login ulang.
8. Test token tidak muncul di local/session storage, DOM, logs, atau invoke payload.
9. Jalankan npm ci bila manifest berubah, lalu test/build lengkap.
10. Commit: `security(desktop): store credentials in OS vault`.

### Task 6: CSP dan least privilege

**Objective:** Membatasi dampak XSS dan native access.

**Files:**
- Modify: `desktop/src-tauri/tauri.conf.json`
- Modify: `desktop/src-tauri/capabilities/default.json`
- Modify: Rust manifest/lib
- Create: `scripts/audit-desktop-security.mjs`
- Create: `__tests__/desktop-security-config.test.ts`
- Modify: `package.json`

**TDD:**
1. Audit gagal bila CSP null, window wildcard, shell default, atau plugin tanpa pemakai.
2. Aktifkan CSP berdasarkan kebutuhan asset nyata.
3. Batasi capability ke `main` dan command khusus.
4. Hapus plugin shell jika tidak dipakai.
5. Batasi notification sampai P1.
6. Jalankan audit, tests, Cargo, dan static export.
7. Commit: `security(desktop): apply CSP and least privilege`.

### Task 7: Bangun desktop shell khusus

**Objective:** Menggantikan AppShell web dengan shell workstation desktop.

**Files:**
- Create: `components/desktop/DesktopShell.tsx`
- Create: `components/desktop/DesktopNavigator.tsx`
- Create: `components/desktop/DesktopContextBar.tsx`
- Create: `components/desktop/DesktopActivityDock.tsx`
- Create: `components/desktop/__tests__/DesktopShell.test.tsx`
- Modify: `desktop-web/app/layout.tsx`
- Modify: `desktop-web/app/page.tsx`

**TDD:**
1. Test layout memiliki navigator, tab strip, workspace, inspector, activity dock, dan status.
2. Test shell tidak memakai mobile navigation atau marketing composition.
3. Implementasikan semantic regions dan keyboard focus order.
4. Jangan duplikasi data fetching di shell.
5. Verifikasi 1024×700 dan 1440×920.
6. Commit: `feat(desktop): introduce dedicated workstation shell`.

### Task 8: Command system dan ticker context

**Objective:** Memberi satu sumber konteks dan keyboard workflow.

**Files:**
- Create: `shared/desktop/commands.ts`
- Create: `shared/desktop/workspace-context.ts`
- Create: tests terkait
- Create/modify: desktop command palette
- Modify: desktop shell

**TDD:**
1. Test ticker normalization `.JK`, lowercase, invalid symbol.
2. Test `Ctrl/Cmd+K`, `Ctrl/Cmd+J`, Escape order, input conflicts, dan focus restore.
3. Test command dapat membuka ticker, fitur, dan workspace.
4. Gunakan context/URL yang jelas; jangan membuat state ticker paralel.
5. Commit: `feat(desktop): add command system and shared ticker context`.

### Task 9: Tab emiten internal

**Objective:** Memungkinkan riset beberapa emiten tanpa tab browser.

**Files:**
- Create: `components/desktop/TickerTabs.tsx`
- Create: `shared/desktop/ticker-tabs.ts`
- Create: tests
- Modify: shell/workspace context

**TDD:**
1. Test open, activate, close, reorder, restore, duplicate prevention, dan max tab.
2. Test tab berubah tanpa memperlihatkan data ticker lama sebagai fresh.
3. Simpan hanya state non-sensitif.
4. Tambahkan empty/default tab behavior.
5. Commit: `feat(desktop): add internal ticker tabs`.

### Task 10: Multi-panel layout

**Objective:** Memberikan pembeda utama dari shortcut browser.

**Files:**
- Create: `components/desktop/workspace/DesktopWorkspace.tsx`
- Create: `components/desktop/workspace/DesktopPanel.tsx`
- Create: `shared/desktop/layout-schema.ts`
- Create: tests

**TDD:**
1. Test minimal dua panel, resize bounds, close/open, panel type, dan reset.
2. Pilih library layout hanya setelah mengecek manifest dan spike aksesibilitas/size; utamakan implementasi sederhana bila cukup.
3. Gunakan schema versioned agar layout lama dapat dimigrasi.
4. Panel menerima ticker context dan tidak memiliki fetching policy sendiri bila service bersama tersedia.
5. Test keyboard resize/focus dan fallback layout.
6. Commit: `feat(desktop): add resizable multi-panel workspace`.

### Task 11: Saved workspaces

**Objective:** Memulihkan alur riset, bukan homepage web.

**Files:**
- Create: `shared/desktop/workspace-storage.ts`
- Create: `components/desktop/WorkspaceSwitcher.tsx`
- Create: tests
- Modify: desktop home/shell

**TDD:**
1. Test save, rename, load, delete, default templates, schema migration, corrupt state fallback.
2. Batasi jumlah/ukuran workspace.
3. Jangan simpan token, raw API data, atau LensAI conversation.
4. Buat empat default workspace sesuai PRD.
5. Desktop home membuka workspace terakhir atau safe default.
6. Commit: `feat(desktop): persist safe research workspaces`.

### Task 12: Implementasikan capability parity per domain

**Objective:** Menyediakan semua kemampuan web melalui bentuk desktop yang tepat.

**Files:**
- Modify: `docs/desktop/FEATURE-PARITY.md`
- Create: adapter/panel di `components/desktop/panels/`
- Reuse: components/services bersama yang sudah ada
- Create: tests per panel

**Batch berurutan:**
1. Market/Home/Watchlist.
2. Technical/Pattern.
3. Fundamental/Moat/Dividend/Earnings.
4. Ownership/Compare.
5. Screener/LensRadar.
6. Valuation/DCF/Risk.
7. Backtest/Recommendations.
8. LensAI/Multi-agent.
9. News/Calendar/Macro.
10. Account/status/transparency/legal support surfaces.

Untuk setiap batch:
1. Tulis acceptance test dari matrix.
2. Reuse domain component atau service setelah ditelusuri.
3. Bungkus sebagai panel/tab/dialog, bukan iframe halaman web.
4. Verifikasi ticker context, loading/error/data-quality, keyboard, dan 1024×700.
5. Tandai matrix “verified” hanya setelah test dan manual check nyata.
6. Commit per domain agar review terkontrol.

### Task 13: Explainability dan educational UX

**Objective:** Menjadikan desktop alat pendidikan, bukan sinyal transaksi.

**Files:**
- Reuse/modify: provenance, methodology, glossary components yang ada
- Create: `components/desktop/EvidenceInspector.tsx`
- Create: `components/desktop/MetricExplainer.tsx`
- Create: tests
- Modify: panel utama

**TDD:**
1. Test metric menampilkan definisi, source, as-of, freshness, dan limitation.
2. Test estimasi/derived/missing tidak disajikan sebagai fakta resmi.
3. Test LensScore tidak disebut probabilitas.
4. Test backtest menampilkan sample, period, dan limitations.
5. Audit CTA agar tidak ada Buy/Sell atau janji keuntungan.
6. Test restriction/suspension/UMA terlihat sebelum decision-support.
7. Commit: `feat(desktop): add evidence-first educational UX`.

### Task 14: Native file, clipboard, deep link, dan window state

**Objective:** Menambah manfaat native P0 dengan permission sempit.

**Files:**
- Modify: desktop package/Rust manifests dan capabilities
- Create: Rust modules/adapters per capability
- Create: TypeScript native adapters
- Create: tests
- Modify: `tauri.conf.json`

**TDD:**
1. File export hanya ke path hasil dialog pengguna dan nama tersanitasi.
2. Clipboard hanya dari tindakan eksplisit.
3. Deep link hanya menerima action/ticker yang tervalidasi.
4. Window state tidak memulihkan posisi di luar monitor yang tersedia.
5. Export menyertakan ticker, as-of, source, dan disclaimer bila material.
6. Audit permissions setelah tiap plugin.
7. Commit per integration bila diff besar.

### Task 15: Data-quality state parity

**Objective:** Mempertahankan semantik SahamLens di seluruh panel.

**Files:**
- Inspect/reuse: `shared/research/**`
- Create/modify: fixtures/tests desktop
- Modify: panel yang gagal audit

**TDD:**
1. Fixture fresh, delayed, stale, missing, partial, inconsistent, proxy, official, unavailable, restricted/suspended.
2. Test valid zero tidak menjadi missing.
3. Test stale tidak disebut real-time.
4. Test action berbasis bukti kritis dinonaktifkan saat bukti tidak cukup.
5. Jalankan `npm run audit:data-quality` dan desktop panel tests.
6. Commit: `fix(desktop): preserve data quality across panels`.

### Task 16: Observability dan privacy-safe diagnostics

**Objective:** Membantu diagnosis tanpa mengumpulkan strategi atau data sensitif.

**Files:**
- Create: `shared/desktop/diagnostics.ts`
- Create: tests redaction
- Modify: fetch bridge/status panel
- Create: `docs/desktop/PRIVACY-TELEMETRY.md`

**TDD:**
1. Test redaction token, cookie, email, prompt, response, portfolio, watchlist.
2. Envelope hanya memuat version, OS family, route class, status, latency bucket, timestamp, request ID.
3. Tambahkan copy diagnosis tersanitasi.
4. Jangan mengaktifkan raw telemetry.
5. Commit: `feat(desktop): add privacy-safe diagnostics`.

### Task 17: Accessibility dan performance gates

**Objective:** Mengotomasi persyaratan workstation.

**Files:**
- Create: `playwright.desktop.config.ts`
- Create: `e2e/desktop/*.spec.ts`
- Create: `scripts/audit-desktop-bundle.mjs`
- Modify: `package.json`

**Steps:**
1. E2E launch → cari ticker → buka tab → susun dua panel → simpan → restore → buka tiga fitur.
2. Test keyboard-only, focus order, accessible names, zoom 200%, reduced motion, 1024×700, no overflow.
3. Tetapkan budget dari baseline nyata.
4. Soak test empat jam untuk tab/panel/polling lifecycle.
5. Tambahkan `test:desktop` tanpa membuat verify umum bergantung GUI browser yang tidak tersedia.
6. Commit: `test(desktop): enforce workstation quality gates`.

### Task 18: Windows packaging dan closed beta

**Objective:** Menghasilkan installer Windows yang aman dan dapat diverifikasi.

**Files:**
- Create/modify: `.github/workflows/desktop-ci.yml`
- Create/modify: `.github/workflows/desktop-release.yml`
- Create: `docs/desktop/RELEASE.md`
- Create: `docs/desktop/ROLLBACK.md`
- Create: `docs/desktop/BETA-CHECKLIST.md`

**Steps:**
1. CI menjalankan npm ci, verify, desktop export, Rust fmt/clippy/test, dan Tauri build.
2. Artifact name memuat product/version/OS/arch/SHA.
3. Signing secret hanya di GitHub environment.
4. Signed installer; checksum dan build provenance.
5. VM bersih: install, launch, account, logout, relaunch, export, uninstall.
6. Security tests mencakup SSRF, XSS-to-native, token leakage, navigation, file, deep link, dan tampered installer/update.
7. Staged beta dan rollback rehearsal.
8. Catat go/no-go dengan workflow URL, artifact hash, dan hasil nyata.
9. Commit: `ci(desktop): ship signed Windows beta`.

## 6. P1 Setelah Single-window Stabil

- native notification opt-in;
- tray yang dapat dimatikan;
- signed auto-update;
- multi-window dan pop-out panel;
- multi-monitor restore;
- advanced workspace templates;
- background activity yang transparan dan dapat dimatikan.

P1 hanya dimulai setelah data beta menunjukkan manfaat dan M7 stabil.

## 7. Verification Commands

Jalankan dari worktree, bukan checkout produksi:

- `npm run verify:prod`
- `npm run build:desktop-web`
- `npm --prefix desktop run build:native`
- `cargo fmt --manifest-path desktop/src-tauri/Cargo.toml --check`
- `cargo clippy --manifest-path desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
- `cargo test --manifest-path desktop/src-tauri/Cargo.toml`
- `npm run test:desktop`
- Tauri release build pada Windows runner

Jika `package.json`, `desktop/package.json`, atau Rust manifest berubah, perbarui/install dependency dan lockfile melalui package manager yang benar sebelum build.

## 8. Definition of Done

- Nama pengguna adalah SahamLens Desktop; tidak ada positioning paket berbayar.
- Desktop tidak memakai AppShell web sebagai produk final.
- Semua capability web ada di matrix dan dapat diakses dari desktop.
- Multi-panel, tabs, saved workspaces, dan command palette bekerja.
- UI desktop berbeda nyata dari web pada layout dan interaction model.
- Token tidak pernah berada di renderer storage atau invoke payload.
- CSP dan least privilege aktif.
- API bridge gagal tertutup.
- Explainability dan risk-first education tersedia.
- Data quality/restriction semantics utuh.
- Native P0 integrations aman.
- Quality gates dan Windows signed installer lulus.
- Tidak ada temuan critical/high.
- Go/no-go beta didukung bukti nyata.
