# SahamLens Android — Redesign Navigasi & Layar Analisis

**Tanggal:** 2026-08-01
**Status:** Disetujui, menunggu implementation plan

## Latar Belakang

`sahamlens-android` (modul Kotlin/Compose, 4 commit git: `e9c94f8`..`2e5d855`) sudah punya
implementasi cukup lengkap: Login, Home, Watchlist (cache-first + sync worker), Portfolio (paper
trading), Market, Stock Detail (bottom sheet + candlestick chart), AI Copilot, dan 4 tools
(Compare, Screener, Risk Calculator, Market Pulse) — semua tersambung ke backend Next.js yang sama
dengan web app (`app/api/*`).

Referensi visual baru (`contoh.webp`, mockup generik "Jual Beli Saham App") memicu evaluasi ulang.
Setelah dibahas, scope-nya bukan sekadar restyle visual, tapi menyelaraskan **struktur navigasi**
Android dengan pola yang sudah ada di web (`components/Sidebar.tsx`): grup menu, Technical Analyzer
& Fundamental Analyzer sebagai halaman mandiri (bukan accordion di dalam Stock Detail), dan
penegasan bahwa app ini **fokus analisis** — Buy/Sell hanya relevan di konteks Akun Demo (paper
trading), bukan fitur utama.

## Tujuan

1. Ganti Bottom Navigation (6 tab flat) dengan Navigation Drawer yang dikelompokkan seperti Sidebar
   web (Beranda / Analisis / Sinyal AI / Portofolio Saya).
2. Jadikan Technical Analyzer dan Fundamental Analyzer halaman mandiri (mirror `/dashboard` dan
   `/fundamental` di web), lepas dari accordion `StockDetailScreen`.
3. Tambah layar Search terpusat (search bar + Trending) sebagai titik masuk bersama untuk
   Home/Watchlist dan alur Drawer → Analisis.
4. Jadikan tema Terang/Gelap pilihan eksplisit user (bukan cuma ikut OS), dengan token warna yang
   sudah ada di `Color.kt`.
5. Pisahkan konteks Stock Detail: mode Analisis (tanpa Buy/Sell) vs mode Akun Demo (dengan
   Buy/Sell) — app ini bukan aplikasi trading riil.
6. Restyle Home & Watchlist dengan avatar berwarna per ticker, buang Portfolio Summary Card dari
   Home (bukan fokus produk).
7. Rename AI Copilot → **AI Council**, dipindah ke grup **Analisis** (bukan "Sinyal AI"), menyamakan struktur dengan `Sidebar.tsx` web persis.
8. Tambah layar **AI Pick** (baru, mirror `/breakout-radar` web) sebagai isi grup **Sinyal AI** — grup ini di web bukan berisi Council AI, tapi "Breakout, Rekomendasi & Lainnya".

## Non-Tujuan

- Tidak menambah endpoint backend baru — semua data sudah tersedia lewat API yang sudah dipakai
  Android sekarang (`api/stock/{ticker}`, `api/fundamental/{ticker}`, `api/dcf/{ticker}`,
  `api/v1/portfolio`, dll).
- Tidak mengubah alur autentikasi/login yang sudah ada.
- Tidak menambah modul Gradle baru untuk fitur ini (kecuali DataStore preference tema, opsional
  bisa numpang di `:core:database` yang sudah ada Room).
- Tidak mengubah desain tools yang sudah ada (Compare, Screener, Risk Calculator, Market Pulse) —
  cuma lokasi aksesnya pindah dari "Profil → Alat & Analisis" ke grup Drawer "Analisis".

## Arsitektur Navigasi

Drawer kiri (`ModalNavigationDrawer` M3) menggantikan Bottom Nav. Struktur grup identik dengan
`NAV_GROUPS` di `components/Sidebar.tsx`:

```
Beranda
  - Home                    route: home
  - Market Pulse            route: market_pulse (sudah ada, pindah lokasi akses)
Analisis
  - Technical Analyzer      route: technical_analyzer/{ticker}   [BARU]
  - Fundamental Analyzer    route: fundamental_analyzer/{ticker} [BARU]
  - AI Council              route: ai_council (rename dari ai_copilot, pindah dari "Sinyal AI".
                             Catatan: di web "Council AI" cuma link ke /technical/{ticker}, BUKAN
                             fitur chat. Di Android, AI Council TETAP layar chat/analisis yang
                             sudah ada sekarang - cuma nama & lokasi grup yang disamakan, bukan
                             perilakunya.)
  - Compare Tool            route: compare (sudah ada)
  - Stock Screener          route: screener (sudah ada)
  - Risk Calculator         route: risk_calculator (sudah ada)
Sinyal AI
  - AI Pick                 route: ai_pick [BARU, mirror /breakout-radar web]
Portofolio Saya
  - Watchlist                route: watchlist (sudah ada, restyle)
  - Akun Demo                route: portfolio (sudah ada, rename label saja)
```

Grouping ini persis `NAV_GROUPS` di `components/Sidebar.tsx` (Analisis berisi 6 item termasuk
Council AI, Sinyal AI cuma AI Pick) — bukan interpretasi bebas.

Profil tetap dapat diakses (footer drawer atau ikon terpisah di top bar), tidak masuk grup.

Rute bersarang (dijangkau lewat kartu, bukan Drawer): `stock_detail/{ticker}?mode={analysis|demo}`,
`search?returnTo={route}`, `design_system_showcase`.

**File yang diubah:** `SahamDestination.kt` (drawer items + grouping, ganti enum flat jadi grouped
data class), `SahamScaffold.kt` (`Scaffold` + `NavigationDrawer` ganti `Scaffold` + `BottomBar`),
`SahamNavHost.kt` (rute baru + query param `mode`).

## Layar

### Home
Tetap 6 bagian **kecuali Portfolio Summary Card dihapus** (app fokus analisis, bukan portofolio
riil): Greeting, AI Opportunity banner (tap → AI Council), IHSG strip, Top AI Picks carousel,
Watchlist ringkas (avatar berwarna, maks 3 baris), News placeholder ("segera hadir", tidak berubah).

### Search (baru)
Search bar di atas + default state list Trending. Dipanggil dari: tombol "+" di
Home/Watchlist, dan dari Drawer → Analisis → Technical/Fundamental Analyzer saat belum ada ticker
aktif (parameter `returnTo` menentukan tujuan setelah user memilih ticker).

### Watchlist
Struktur & data tidak berubah (cache-first + `WatchlistSyncWorker` tetap). Restyle: avatar bulat
warna per ticker (hash kode ticker → 1 dari 8 warna tetap di token desain, deterministik).

### Stock Detail — dua mode
- **Mode Analisis** (default, dari Home/Watchlist/Search): hero tanpa Buy/Sell, cuma harga +
  badge konsensus.
- **Mode Akun Demo** (dari tab "Akun Demo"): hero dengan Buy/Sell seperti sekarang, tetap pakai
  `PortfolioRepository` yang sudah ada.
- Sheet content: section **Technical & Fundamental dikeluarkan**, diganti 2 kartu link ("Lihat
  Technical Analyzer →", "Lihat Fundamental Analyzer →"). Section lain (AI Summary, Chart, DCF,
  Bandar Flow, News, Discussion) tetap accordion seperti sekarang.
- Chart: `CandlestickChart` yang sudah ada dipertahankan penuh, ditambah segmented control periode
  di atasnya (1D/1W/1M/YTD/1Y/3Y/5Y) — menggantikan toggle "Grafik Harga Beli/Jual" di mockup
  (tidak relevan untuk data IDX riil).

### Technical Analyzer (baru)
Mirror `/dashboard` web ("10 Pure Math Filters"). Data: `api/stock/{ticker}` (field technical yang
sama yang sekarang mengisi accordion lama) — dipindah ke ViewModel/screen sendiri, ditampilkan
lebih lega. Diakses dari kartu Stock Detail (ticker sudah pasti) atau Drawer → Search → ticker.

### AI Pick (baru)
Mirror `/breakout-radar` web ("Breakout, Rekomendasi & Lainnya"). Data: reuse `api/recommendations`
dan `api/daily-picks` — endpoint yang sama yang sekarang mengisi "Top AI Picks carousel" di Home,
ditampilkan full-page dan lebih lengkap (bukan cuma carousel 3-4 item). Home tetap menampilkan
carousel ringkas seperti sekarang; AI Pick jadi versi lengkapnya, diakses dari Drawer grup "Sinyal AI".

### Fundamental Analyzer (baru)
Mirror `/fundamental` web. Data: `api/fundamental/{ticker}` (endpoint dedicated yang sudah ada).
Termasuk tabel Revenue/Operating Profit per tahun (2021/2022/2023 dst., dari mockup) — levelnya
memang fundamental, bukan technical. Diakses sama seperti Technical Analyzer.

## Theming

Token warna Light*/Dark* **sudah lengkap** di `Color.kt`, `SahamLensTheme(darkTheme: Boolean)` di
`Theme.kt` sudah menerima parameter eksplisit — tidak perlu restrukturisasi token.

- Tambah `ThemePreference` (DataStore Preferences, enum `LIGHT/DARK/SYSTEM`, default `SYSTEM`),
  disambungkan di `MainActivity.kt`/`SahamLensRoot.kt` ke parameter `darkTheme` yang sudah ada.
- Toggle 3-opsi (Terang/Gelap/Ikuti Sistem) di `ProfileScreen.kt`.
- Baru: palet warna avatar ticker (8 warna tetap di `Color.kt`), dipilih via
  `ticker.hashCode() % 8` — deterministik, bukan random per render.

## Data Flow (konfirmasi: nol endpoint backend baru)

| Screen | Sumber data |
|---|---|
| Search/Trending | Endpoint trending sepadan `lib/trendingTickers` web — verifikasi saat implementasi, kandidat: `api/recommendations` atau `api/daily-picks` |
| AI Pick | `api/recommendations` + `api/daily-picks` (sudah dipakai Top AI Picks carousel di Home) |
| Technical Analyzer | `api/stock/{ticker}` (field technical, sudah dipakai) |
| Fundamental Analyzer | `api/fundamental/{ticker}` (sudah ada) |
| Stock Detail (kedua mode) | `api/stock/{ticker}` + `api/dcf/{ticker}` (sudah ada) |
| Akun Demo Buy/Sell | `api/v1/portfolio` (sudah ada) |

## Error Handling & Testing

Pola yang sudah ada di app dipertahankan dan direplikasi ke layar baru:
- 401 → `StockDetailErrorState`-style (login required), dipakai juga di Technical/Fundamental
  Analyzer.
- 402 (Pro-only) → pola "Fitur Pro" yang sudah ada di `StockDetailScreen`.
- Loading → `ShimmerBox`/`ShimmerLineRow` yang sudah dipakai di seluruh app.
- Tidak ada data nyata (mis. Search/Trending kalau endpoint belum pasti) → pesan jujur seperti
  pola "Segera hadir" yang sudah dipakai untuk News/Discussion, bukan data palsu/dummy.

## Ringkasan File

**Baru:**
`SearchScreen.kt`+`SearchViewModel.kt`, `TechnicalAnalyzerScreen.kt`+`TechnicalAnalyzerViewModel.kt`,
`FundamentalAnalyzerScreen.kt`+`FundamentalAnalyzerViewModel.kt`, `AiPickScreen.kt`+
`AiPickViewModel.kt`, `ThemePreference.kt` (DataStore), helper warna avatar ticker.

**Diubah:**
`SahamDestination.kt`, `SahamScaffold.kt`, `SahamNavHost.kt`, `HomeScreen.kt`+`HomeViewModel.kt`
(buang Portfolio Card, restyle Watchlist), `WatchlistScreen.kt` (avatar), `StockDetailScreen.kt`+
`StockDetailViewModel.kt` (mode param, buang 2 accordion, tambah 2 kartu link, tambah toggle
periode chart), `ProfileScreen.kt` (toggle tema), `AiCopilotScreen.kt`/`AiCopilotViewModel.kt` →
rename `AiCouncilScreen.kt`/`AiCouncilViewModel.kt`, `Theme.kt`/`MainActivity.kt` (baca
`ThemePreference`), `Color.kt` (tambah palet avatar).

**Tidak disentuh:** `LoginScreen.kt`, `PortfolioRepository`/`PortfolioScreen.kt` (logic, cuma label
"Akun Demo"), `CompareScreen.kt`, `ScreenerScreen.kt`, `RiskCalculatorScreen.kt`,
`MarketPulseScreen.kt`, `core/database/*`, `core/network/*` (kecuali reuse endpoint yang sudah ada).
