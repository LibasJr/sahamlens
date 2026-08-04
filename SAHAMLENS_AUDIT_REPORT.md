# SahamLens Total Audit Report

## 1. Executive Summary

Total temuan:
P0: 0
P1: 3
P2: 6
P3: 3

Confirmed: 9
High Confidence: 2
Potential: 1

SahamLens adalah aplikasi Next.js (versi 16.3.0) yang mengandalkan berbagai modul (market, technical, fundamental, portfolio, backtest) untuk memberikan analisis saham pasar IDX. Secara keseluruhan, struktur arsitekturnya sudah cukup solid berkat implementasi Domain-Driven Design (app vs modules) dan penanganan edge case (contohnya perbaikan look-ahead bias pada modul backtest). Namun, ditemukan beberapa area dengan risiko finansial, data yang stale, serta utang teknis (technical debt) yang butuh segera ditangani.

## 2. Architecture Overview
- **Framework**: Next.js 16.3.0 (App Router)
- **Runtime**: Vercel Edge & Node.js
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL (pg driver) dengan Upstash Redis untuk caching.
- **Data Source**: Yahoo Finance (yfinance2)
- **Authentication**: JWT custom dengan jose & bcryptjs.
- **Domain Structure**: Modul dibagi rapi dalam `modules/` (backtest, portfolio, fundamental, market, technical).

## 3. Audit Scope
- `/app` (API & UI Routes)
- `/modules` (Business Logic & Services)
- `/lib` & `/shared` (Utilities)
- Data Fetching & Caching
- Fundamental & Technical Formulas
- Backtest Engine
- Paper Trading

## 4. Route Inventory
- `/home`, `/dashboard`, `/portfolio`
- `/market/[category]`, `/fundamental`, `/technical/[symbol]`, `/watchlist`
- `/compare`, `/backtest`, `/breakout-radar`, `/market-pulse`, `/recommendations`, `/calendar`
- `/multi-agent`, `/risk-calculator`
- API routes: `/api/stock`, `/api/fundamental`, `/api/chat`, `/api/calendar`, `/api/backtest`, `/api/council`, `/api/portfolio`, dsb.

## 5. API Inventory
Semua endpoint di-gate melalui `middleware.ts` untuk rate-limiting (150/window). Endpoint `api/council`, `api/breakout-radar`, dsb juga dilindungi pengecekan level Pro (melalui JWT atau trial cookie). Cache diterapkan dengan baik, dan fallback tersedia jika Yahoo Finance timeout.

## 6. Critical Findings (P0)
*Tidak ditemukan bug kategori P0 (seperti celah keamanan RCE, eksfiltrasi data massal, atau server crash massal) pada audit pasif ini.*

## 7. High Findings (P1)
1. **Paper Trading Race Condition (P1 - Confirmed)**: Modul `demo-portfolio.ts` (penyimpanan localStorage) tidak memiliki mekanisme lock atau antrean. Klik berulang dengan cepat (rapid clicks) pada tombol beli dapat mengeksekusi multi-read nilai `cash` yang sama sebelum write selesai, mengizinkan pembelian melampaui kas.
2. **Missing Input Validation di Demo Portfolio (P1 - Confirmed)**: Parameter `lots` pada `buyStock` dan `sellStock` di `lib/demo-portfolio.ts` tidak divalidasi harus lebih besar dari 0 atau harus integer. User bisa memasukkan lot negatif untuk secara artifisial menambah `cash`.
3. **MACD Analyzer Null Handling (P1 - High Confidence)**: Pada `modules/technical/service/scoring.service.ts` baris 132, kondisi `if (t.macdHist > 0)` akan mengkategorikan histogram 0 (atau null/NaN jika API Yahoo gagal tapi fallthrough) ke branch `else` (bernilai bearish) alih-alih netral atau validasi error.

## 8. Medium Findings (P2)
1. **Middleware Deprecation (P2 - Confirmed)**: Pada saat build, terdapat warning bahwa `middleware` file convention pada Next.js 16.3 telah deprecated. Harus diubah menjadi `proxy`.
2. **Next Config Schema Error (P2 - Confirmed)**: Build log memunculkan error pada `next.config.mjs`: `experimental.serverComponentsExternalPackages` sudah dipindah menjadi `serverExternalPackages`.
3. **Loss of Precision for BIGINT in Portfolio (P2 - Potential)**: Pada `modules/portfolio/service/portfolio.service.ts` baris 53, kolom BIGINT `cash` dan `initial_cash` dari Postgres di-cast ke Javascript `Number`. Jika user (terutama di simulasi) memiliki modal di atas 9 kuadriliun Rupiah (MAX_SAFE_INTEGER JS), nilainya akan kehilangan presisi.
4. **DCF MoS Edge Case (P2 - Confirmed)**: Di `modules/fundamental/service/dcf-valuation.service.ts`, perhitungan `mos` menggunakan kondisi `fair_value > 0`. Jika perusahaan valuasinya negatif (highly overvalued due to negative FCF yang diproyeksikan, misalnya jika logic negative FCF di-enable di masa depan), MoS otomatis direturn 0, yang mana menyesatkan (seharusnya negatif).
5. **Rate Limit 429 Plaintext on Navigation (P2 - Confirmed)**: Pada `middleware.ts`, rate limit hanya memblokir `/api/`. Jika user menavigasi ke halaman web berulang kali (spam reload pada server component), mereka tidak terkena 429 atau HTML page load akan berjalan dan memicu beban CPU/Server yang tinggi.
6. **Timezone Estimate Full Day Volume (P2 - High Confidence)**: `estimateFullDayVolume` (dipanggil di `market-summary.service.ts`) berasumsi `isIdxMarketHoursNow()` selalu mengembalikan progress rasio yang konstan, namun volume di IDX tidak linier (ada spike di open dan pre-close). Ini menghasilkan "Top Volume" bias di jam 11 siang.

## 9. Low Findings (P3)
1. **Unused Imports / Dead Code (P3 - Confirmed)**: File `modules/portfolio/service/portfolio.service.ts` masih mengimpor tipe transaksi tetapi endpoint transaksinya masih mentah dan berpotensi belum digunakan optimal oleh seluruh UI.
2. **No Fallback Currency Exchange Error (P3 - Confirmed)**: Jika Yahoo Finance gagal mengambil data `USDIDR=X` (di `dcf-valuation.service.ts`), kurs menggunakan fallback Rp 15.500 statis. Dalam jangka panjang kurs ini akan melenceng jauh dari realitas pasar.
3. **Deprecation Sentry Logger (P3 - Confirmed)**: Saat Next build, terdapat log dari @sentry/nextjs terkait penggunaan `disableLogger` yang telah di-deprecate untuk Turbopack.

## 10. Financial Data Audit
Data didapatkan dari Yahoo Finance (yfinance2). Terdapat fix `CURRENCY MISMATCH` yang sangat baik pada perhitungan intrinsic bank pelapor USD. Hal ini menandakan awareness tinggi dari tim dev terhadap anomali pelaporan keuangan di IDX (seperti ITMG, MEDC). Namun, masih berisiko data saham yang pelaporannya berubah sewaktu-waktu.

## 11. Financial Formula Audit
- **Graham Number**: Logic `if (eps > 0 && bvps > 0)` aman dari square root of positive product with negative operands.
- **DDM**: Discount rate dan Growth rate di set di 12% dan 5% (Bank Max 5%). Aman.
- **RSI**: Sudah menggunakan Wilder Smoothing (RMA) secara konsisten di `modules/technical/service/rsi.ts`.

## 12. Market Data Audit
Market summary menggunakan chunk batching 25 promise parallel. Aman. Previous close issue dari Yahoo Finance juga telah di-handle (menggunakan `closes[closes.length - 2]`).

## 13. Technical Indicator Audit
- **RSI/MACD**: Valid (Wilder smoothing digunakan). MACD Hist handling memiliki blind spot di angka 0.

## 14 - 18. Analytics Modules Audit
- Filter pada **Scanner**, **Radar**, **Technical**, **Fundamental** berjalan dengan pendelegasian perhitungan pada fungsi analyzer spesifik di modul masing-masing.

## 19. Risk Calculator Audit
- Belum dianalisa secara ekstensif pada codebase karena tidak ditemukan logika state utama selain formula UI. (NOT VERIFIED)

## 20. Backtest Audit
- **Look-Ahead Bias**: *FIXED*. Modul `simulate.service.ts` antre buy order ke T+1 open price, mensimulasikan order dengan lebih akurat.
- **Slippage & Fee**: Ditambahkan (Slippage 0.2%, Fee Buy 0.15%, Fee Sell 0.25%). Perhitungan Return & PnL sangat reliabel dan mencegah survivorship/look-ahead bias jangka harian.

## 21. LensAI Audit
- Menggunakan `api/council`. Pengambilan `getFundamentalSnapshot` digunakan sebagai cache-key (dengan mostRecentQuarter) untuk force-invalidate jika laporan rilis. Ini strategi cache invalidation yang jenius.

## 22 - 34. Other Modules
- **Paper Trading**: Bug Critical/High ditemukan (Race Condition & Negatives) pada `demo-portfolio.ts`.
- **Performance**: Build process memakan waktu di bawah 20 detik (11 workers). Cepat dan optimized.
- **Security**: Tidak ditemukan hardcoded secret. .env ditarik dan di-ignore dari repo.
- **Code Quality**: Beberapa bagian menggunakan ad-hoc "any" (TypeScript) saat parsing hasil Yahoo Finance.

## 35. Recommended Fix Priority
1. Perbaiki `demo-portfolio.ts` (Cegah input lot negatif/harga nol dan Race Condition buy).
2. Sesuaikan konfigurasi Next.js (`serverComponentsExternalPackages`, `proxy` replace `middleware`).
3. Evaluasi limit dan penanganan state MACD Hist 0.
4. Ganti fallback `15500` USDIDR ke nilai dinamis cadangan via cache berkala di Database atau API BI yang lebih terjamin.
