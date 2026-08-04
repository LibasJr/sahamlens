# UI/UX V2 Total Redesign — Phase 1: Design System + App Shell — Design Spec

**Tanggal:** 2026-08-04
**Konteks:** Acuan `SahamLens_UI_UX_V2_Total_Redesign.txt` (mission doc user, 8 MIGRATION PHASE). User menegaskan ini **TOTAL redesign**, bukan lanjutan cosmetic-only kerja sebelumnya (Brand Architecture fase 1-3 + UIUX BUILD 001-002 = rename label/token/breakdown score, belum app-shell/visual-hierarchy overhaul). Phase 1 fokus: Design System tokens + App Shell (Top Market Bar baru, Sidebar regroup). Phase 2-8 (Homepage/LensRadar/LensScanner/Stock Detail/Ask LensAI/Analytical Tools/Monitoring/Mobile) dikerjakan sebagai spec terpisah setelah Phase 1 selesai+verified, sesuai instruksi mission "Implementasikan secara nyata, test, fix regression, lalu lanjut secara terkontrol."

Audit penuh (Explore agent, baca kode terkini 2026-08-04) sebelum keputusan:

- **App shell**: `components/AppShell.tsx` (38 baris) — tidak ada Top Market Bar/shared header di level shell. Tiap halaman bikin header sendiri: `components/Header.tsx` (khusus `/dashboard`), `app/technical/[symbol]/ClientHeader.tsx` (khusus council view), header inline per-halaman lainnya (`app/home/page.tsx:265-279`, `app/breakout-radar/page.tsx:129-156`), header marketing sendiri di `components/Dashboard.tsx:328-391` (root `/`, tanpa Sidebar sama sekali per `AppShell.tsx:12-22`).
- **Sidebar** (`components/Sidebar.tsx:54-93`): 4 grup existing (Beranda/Analisis/Sinyal AI/Portofolio Saya), 11 item. LensRadar sendirian di grup "Sinyal AI" — mission minta dia bareng LensMarket+LensScanner di grup DISCOVER.
- **Token inkonsistensi**: `app/globals.css:6` `--background: #0A0E27` vs `tailwind.config.js` `tv.bg: #0F141D` — dua warna beda dipakai bergantian sebagai "background dasar app".
- **Typography scale terdokumentasi tapi tidak ditegakkan** (`globals.css:54-61`, komentar "skala tipografi resmi"): eyebrow/label mikro seharusnya `font-sans 600 uppercase`, tapi `Header.tsx:84`, `app/dashboard/page.tsx:711,722,734,737` masih pakai `font-mono` untuk label ("LENSAI" module-bank badge, "LensScore" label, kategori badge, "BREAKDOWN SKOR", "Technical (0-40)") — `font-mono` per dokumentasi seharusnya HANYA untuk data tabular/kode.
- **Card primitive adoption tidak merata**: `components/Dashboard.tsx` (root `/`, 619 baris) masih raw `border border-tv-border bg-tv-card rounded-lg/xl` manual di 6 tempat (`Dashboard.tsx:400,422,427,501,554,604`) — bukan `<Card>` dari `components/ui/`. `app/home/page.tsx` sudah 100% pakai primitive.
- **Container/padding wrapper terduplikasi** — pola `max-w-[1600px] mx-auto w-full` (dengan variasi padding/space-y/grid) ditulis manual di 19 file berbeda (`app/calendar`, `app/breakout-radar`, `app/watchlist`, `app/backtest`, `app/technical/[symbol]`, `app/market-pulse`, `app/screener`, `app/macro`, `app/risk-calculator`, `components/TickerAnalysisShell`, `app/home`, `app/recommendations`, `app/fundamental`, `app/portfolio`, `app/news`, `app/dashboard`, `app/compare`, `components/Dashboard`).

## Keputusan produk (hasil brainstorming, AskUserQuestion)

1. **Top Market Bar — cuma di dalam app-shell** (bukan di landing publik `/`). Landing `/` (`components/Dashboard.tsx`) tetap pakai header marketing sendiri seperti sekarang — keputusan lama "root no-sidebar" (BUILD 003, [[sahamlens-ui-redesign-2026-07-31]]) dipertahankan, tidak diubah scope-nya di fase ini. Top Market Bar tampil di semua halaman yang render lewat `<Sidebar/>` (semua route kecuali `/` dan `BARE_AUTH_PAGES`).
2. **Sidebar — regroup penuh ikut mission** (DISCOVER → ANALYZE → INTELLIGENCE → MONITOR), bukan pertahankan 4 grup existing.
3. **Token background** — unifikasi ke `tv-bg` (`#0F141D`), hapus `--background: #0A0E27` yang menyimpang (dipakai cuma sebagai CSS var root, konsumen aktualnya perlu dicek saat implementasi — kalau ada Tailwind class yang reference `var(--background)` langsung, redirect ke `#0F141D`).
4. **Typography enforcement** — ganti semua `font-mono` yang dipakai untuk label/eyebrow (bukan data tabular) jadi `font-sans` sesuai skala terdokumentasi.
5. **`.ai-response` teal palette** — diselaraskan ke `tv-blue`/cyan (bukan dipertahankan sebagai bahasa visual ke-3), konsisten dengan brand rule "Blue/Cyan = AI/info".
6. **Card primitive migration** — `components/Dashboard.tsx` 6 raw card manual dimigrasi ke `<Card>` primitive di fase ini (app-shell foundation). Halaman lain yang masih raw (breakout-radar table, dashboard/page.tsx sections) TIDAK disentuh — masuk scope Phase 3/4 masing-masing.
7. **Shared `PageContainer`** — komponen baru `components/ui/PageContainer.tsx`, wrap `max-w-[1600px] mx-auto w-full` + terima `className` tambahan (space-y/grid/padding tetap fleksibel per halaman). 19 file di atas diganti pakai komponen ini, angka/behavior visual sama persis (DRY only, zero visual change).

## Scope — Perubahan File

### A. Top Market Bar (baru)

| # | File | Perubahan |
|---|---|---|
| 1 | `components/TopMarketBar.tsx` (baru) | Komponen baru: IHSG mini-stat + status pasar (buka/tutup) dari data yang sudah tersedia (`components/Dashboard.tsx` sudah fetch pola ini, pakai endpoint sama, JANGAN fetch baru/dummy), last-update timestamp, search (reuse `SymbolAutocomplete` dari `components/Header.tsx`), tombol shortcut "Ask LensAI" (dispatch `open-ai-chat` event, sudah ada di `AIChat.tsx:39-45`), notification bell (placeholder ikon dulu kalau belum ada sistem notifikasi terpusat — TIDAK mengarang data notifikasi), profile (reuse trigger `UserProfileModal` yang sudah ada di footer Sidebar, cukup 1 sumber kontrol, jangan duplikat 2 tempat). |
| 2 | `components/AppShell.tsx:29-37` | Tambah `<TopMarketBar />` di dalam `<main>`, di atas `{children}`, sticky top. Landing (`:15-21`) dan bare-auth (`:25-26`) branch TIDAK berubah. |
| 3 | `components/Header.tsx` | Search box dan module title/bank badge yang sekarang di sini **dipindah/dipertahankan** — module title/bank (konteks halaman spesifik, cth "LensTechnical") tetap tanggung jawab `Header.tsx` per-halaman karena itu bukan info pasar global; search pindah ke `TopMarketBar` supaya tidak dobel 2 search box saat halaman yang sudah punya `Header.tsx` juga dapat `TopMarketBar` dari shell — cek tiap konsumen `Header.tsx`/`ClientHeader.tsx` saat implementasi, hapus search box lokal yang jadi redundant. |

### B. Sidebar Regroup

`components/Sidebar.tsx:54-93` — `NAV_GROUPS` diubah dari 4 grup (Beranda/Analisis/Sinyal AI/Portofolio Saya) jadi 4 grup baru, 11 item existing dipertahankan utuh (nama/path/subtitle/icon/live tidak berubah, cuma pindah grup + label grup baru):

| Grup baru | Item (id existing) |
|---|---|
| **Discover** | `home` (Beranda — tetap masuk sini sebagai entry point, bukan grup sendiri), `market-pulse` (LensMarket), `breakout-radar` (LensRadar — **pindah dari grup "Sinyal AI"**), `screener` (LensScanner) |
| **Analyze** | `dashboard` (LensTechnical), `fundamental` (LensFundamental), `compare` (Compare Tool), `risk-calculator` (Risk Calculator), `backtest` (Backtest) |
| **Intelligence** | `council` (LensAI) |
| **Monitor** | `watchlist` (LensWatch), `portfolio` (Akun Demo), `calendar` (Corporate Calendar), `news` (Berita — **pindah dari grup "Beranda"**, karena bukan bagian discover-market-data melainkan konten pasif) |

Grup id/label diganti (`id: 'beranda'→'discover'`, dst), `ADMIN_NAV_GROUP` (`Sidebar.tsx:99-105`) tidak berubah.

### C. Design Tokens

| # | File:Line | Current | New |
|---|---|---|---|
| 8 | `app/globals.css:6` | `--background: #0A0E27;` | `--background: #0F141D;` (samakan `tv.bg`) |
| 9 | `Header.tsx:84` | `text-[10px] font-mono text-tv-blue uppercase` | `text-[10px] font-sans font-semibold text-tv-blue uppercase` |
| 10 | `app/dashboard/page.tsx:711` | `text-[10px] font-mono text-tv-muted uppercase` | `text-[10px] font-sans font-semibold text-tv-muted uppercase` |
| 11 | `app/dashboard/page.tsx:722` | `text-sm font-bold font-mono px-3 py-1 rounded-full border` | `text-sm font-bold font-sans px-3 py-1 rounded-full border` |
| 12 | `app/dashboard/page.tsx:734` | `text-[10px] font-mono text-tv-muted uppercase tracking-wider mb-2` | `text-[10px] font-sans font-semibold text-tv-muted uppercase tracking-wider mb-2` |
| 13 | `app/dashboard/page.tsx:737` | `text-xs text-tv-muted font-mono w-28` | `text-xs text-tv-muted font-sans w-28` |
| 14 | `app/globals.css:67-186` `.ai-response` | Palette teal (`#ccfbf1`/`#5eead4`/`#14b8a6`) | Ganti ke turunan `tv-blue` (`#3A86FF`) — tone lighter untuk teks-di-atas-bubble-gelap dipilih saat implementasi (kontras AA tetap wajib dicek), bukan reuse teal. |

**Di luar scope:** grep menyeluruh untuk `font-mono` lain di luar 5 lokasi ini (kalau ada) dicek saat implementasi — cuma diubah kalau memang label/eyebrow, BUKAN kalau memang data tabular/kode (yang harus tetap `font-mono` per dokumentasi).

### D. Card Primitive Migration — `components/Dashboard.tsx`

| # | Line | Current (raw) | New |
|---|---|---|---|
| 15 | `:400` | `<div className="... rounded-lg border border-tv-border bg-tv-card/50 px-5 py-4 sm:px-8 sm:py-6">` | `<Card>` dengan padding custom (atau `padding="lg"` kalau cocok) |
| 16 | `:427` | `<div className="relative overflow-hidden rounded-xl border border-tv-border bg-tv-card shadow-2">` (featured chart card) | `<Card variant="default">` + `overflow-hidden` tambahan via className |
| 17 | `:501` | `<div className="mt-4 rounded-lg border border-tv-border bg-tv-card p-4">` | `<Card padding="md">` |
| 18 | `:554` | item list row, bukan card container — **tidak diubah** (bukan candidate Card primitive, ini row item) | — |
| 19 | `:604` | bottom meta bar | `<Card padding="md">` atau dipertahankan raw kalau `Card` bikin shadow/border yang tidak cocok untuk meta bar tipis — putuskan saat implementasi berdasar hasil visual, prioritaskan konsistensi radius/border token di atas migrasi paksa ke komponen |

`:422` (badge "SahamLens" kecil di header) bukan card, tidak disentuh.

### E. Shared `PageContainer`

| # | File | Perubahan |
|---|---|---|
| 20 | `components/ui/PageContainer.tsx` (baru) | `export function PageContainer({ children, className }: { children: ReactNode; className?: string })` → `<div className={cn('max-w-[1600px] mx-auto w-full', className)}>{children}</div>`. Base TIDAK termasuk padding (biar tiap halaman kontrol `p-4 md:p-6` vs `p-6` sendiri lewat `className`, menghindari visual shift). |
| 21 | 19 file di §Audit atas | Ganti wrapper div manual → `<PageContainer className="...">` dengan className persis sama seperti sebelumnya (cuma `max-w-[1600px] mx-auto w-full` yang dicabut ke komponen, sisanya passthrough). Zero visual change, murni DRY. |

## Risiko

- **Top Market Bar search dobel dengan `Header.tsx`**: kalau tidak dicek satu-satu konsumen `Header.tsx`, halaman `/dashboard` bisa punya 2 search box (satu dari shell, satu dari `Header.tsx` lokal). Wajib diaudit saat implementasi sebelum dianggap selesai.
- **`--background` var**: perlu grep dulu apakah ada tempat yang benar-benar consume `var(--background)` (bukan cuma didefinisikan tapi tidak dipakai) — kalau tidak ada consumer, perubahan ini no-op aman; kalau ada, perlu screenshot before/after buat pastikan tidak ada flash-of-wrong-color.
- **Sidebar regroup**: murni re-arrange array, path/behavior 11 item tidak berubah — risiko rendah, tapi collapse-icon-rail mode (`Sidebar.tsx:224` dst) harus dicek tetap benar per-grup setelah re-order.
- **Card migration `Dashboard.tsx:427`**: featured chart card punya `overflow-hidden` + child grid kompleks (chart + radar list + ticker) — migrasi ke `<Card>` primitive berisiko ganggu internal layout kalau `Card` primitive menambah padding/wrapper yang tidak diantisipasi. Verifikasi visual manual wajib post-migration.

## Testing

- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Grep sapu bersih: `font-mono` cuma tersisa di lokasi data tabular/kode (bukan 5 lokasi di atas), `#0A0E27` hilang dari `globals.css`.
- Manual: buka tiap halaman yang render lewat Sidebar (minimal `/home`, `/dashboard`, `/breakout-radar`, `/watchlist`, `/screener`) — pastikan `TopMarketBar` muncul sekali, tidak dobel search box, Sidebar grup baru tampil benar (4 grup: Discover/Analyze/Intelligence/Monitor), collapse-to-icon-rail masih jalan. Buka `/` — pastikan TIDAK ada `TopMarketBar`/Sidebar (unchanged). Bandingkan `Dashboard.tsx` root `/` before/after migrasi Card — pastikan featured chart card layout tidak pecah.
- Responsive check minimal: 390px (mobile drawer + TopMarketBar collapse), 1440px (desktop full).
