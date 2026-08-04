# SAHAMLENS DATA & ALGORITHM AUDIT REPORT

> **STATUS: SELURUH TEMUAN SUDAH DIPERBAIKI (2026-08-05).**
> Laporan di bawah dipertahankan apa adanya sebagai catatan kondisi SEBELUM perbaikan.
> Ringkasan perbaikan + status per temuan ada di bagian
> [STATUS PERBAIKAN](#status-perbaikan-2026-08-05) di akhir dokumen.
> Verifikasi: `tsc --noEmit` bersih, `vitest run` 217/217 lulus (30 file, +16 test regresi
> baru untuk temuan C-7/H-1/H-2/H-14/M-6), `next build` sukses.

**Tanggal:** 2026-08-05
**Cakupan:** audit total logika, algoritma, rumus finansial, indikator teknikal, sumber data, cache, AI, dan integritas nilai yang ditampilkan ke pengguna.
**Sifat:** READ-ONLY. Nol file source diubah selama audit ini.
**Metode:** pembacaan source code end-to-end (`app/`, `lib/`, `modules/`, `shared/`, `components/`) + verifikasi live ke Yahoo Finance untuk 6 ticker (BBCA, BBRI, ADRO, ITMG, TLKM, GOTO) dan chart API mentah, untuk menguji satuan field dan klaim yang tertulis di komentar kode.

> Komentar developer TIDAK diperlakukan sebagai bukti. Setiap klaim ditelusuri ke kode yang benar-benar dieksekusi dan/atau ke data sesungguhnya.

Audit ini adalah lapis ketiga setelah `AUDIT-DATA-INTEGRITY-2026-08-03.md` (integritas data) dan audit dummy-data 2026-08-01. Sebagian besar temuan dua audit itu benar-benar diperbaiki — bukan sekadar dikomentari. Temuan di bawah adalah **yang belum tertutup, yang lahir dari perbaikan itu sendiri, atau yang tidak pernah masuk cakupan sebelumnya**.

---

## Executive Summary

| Dimensi | Skor | Alasan singkat |
|---|---|---|
| Data Integrity | **78**/100 | Sumber nyata semua (Yahoo/RSS/Postgres). Tapi masih ada klaim hardcoded yang tampil ke user tiap request. |
| Algorithm Accuracy | **62**/100 | Double-counting flow 30 poin, MA200 palsu untuk saham histori pendek, missing-data menghasilkan skor. |
| Financial Formula Accuracy | **58**/100 | Rasio dari Yahoo benar dan satuannya terverifikasi. Fair value/valuasi memakai konstanta karangan (PER 15, r=12%, g=5%, PBV=(ROE/12)x1.4). |
| Technical Indicator Accuracy | **80**/100 | RSI Wilder benar dan tunggal, AdjClose konsisten, guard histori ada. Minus: fallback 50/0, EMA seed, MA200 short-history. |
| Data Freshness | **65**/100 | Backend menghitung freshness dengan benar, UI halaman utama tidak merendernya sama sekali. Stale 24 jam bisa tampil sebagai data hari ini. |
| AI Data Reliability | **70**/100 | Prompt disiplin, confidence palsu sudah dihapus. Tapi output LLM tidak divalidasi, context chat 100% dari client. |
| **Production Readiness** | **60**/100 | Fondasi jauh lebih bersih dari audit sebelumnya, tapi 8 temuan P0 masih menghasilkan klaim salah ke investor. |

---

## CRITICAL FINDINGS (P0)

### C-1 — "Bandar Flow: AKUMULASI" hardcoded, tampil untuk SEMUA saham

- **File:** `components/TradingViewChart.tsx:283`
- **Function:** render header chart
- **Current logic:** `Bandar Flow: {technical.broker_flow_status || 'AKUMULASI'}`
- **Rantai data:** `app/dashboard/page.tsx:379` -> `const tech = data?.technical || {}` -> `app/api/stock/[ticker]/route.ts:456` mengembalikan `technical: {}` (objek KOSONG, permanen).
- **Why it is wrong:** `broker_flow_status` tidak pernah ada di payload. Fallback selalu aktif, sehingga halaman analisa utama (LensTechnical) menampilkan "Bandar Flow: AKUMULASI" untuk saham apa pun, kondisi apa pun, termasuk saham yang sedang distribusi berat.
- **Data source:** TIDAK ADA. String literal.
- **Impact:** klaim akumulasi bandar palsu di halaman paling sering dibuka.
- **Severity:** CRITICAL

### C-2 — "Bandar Flow" diturunkan dari volume ratio, arah harga diabaikan

- **File:** `components/Dashboard.tsx:490`, `components/StockChartPanel.tsx:78`
- **Current logic:** `broker_flow_status: ind?.volRatio != null ? (ind.volRatio > 1 ? 'AKUMULASI' : 'DISTRIBUSI') : 'NETRAL'`
- **Why it is wrong:** volume di atas rata-rata bukan akumulasi. Saham yang anjlok dengan volume 3x rata-rata dilabeli "AKUMULASI". Tidak ada komponen arah/posisi close sama sekali, padahal `analyzeBandarmology()` (Chaikin Money Flow) sudah tersedia di codebase yang sama.
- **Data source:** volume ratio nyata, tapi interpretasinya tidak didukung data.
- **Impact:** label bandar yang menyesatkan di dua komponen chart.
- **Severity:** CRITICAL

### C-3 — Angka "Hist. Accuracy" di-clamp ke rentang 45-95%

- **File:** `app/dashboard/page.tsx:491-503`
- **Ditampilkan di:** `components/AlgoFilters.tsx:99-100`, `app/fundamental/page.tsx:442-443`
- **Current logic:** `Math.min(95, Math.max(45, val)) + '%'`
- **Why it is wrong:** akurasi backtest riil 20% ditampilkan sebagai "45%", 100% menjadi "95%". Ini bukan fallback untuk data hilang — ini pemalsuan hasil hitungan yang sebenarnya ADA.
- **Tambahan:** backtest client-side di `app/dashboard/page.tsx:404-419` menghitung RSI dengan **rata-rata aritmatik sederhana**, persis bug H-01 yang sudah diperbaiki di `modules/technical/service/rsi.ts` (Wilder smoothing) tapi tidak pernah sampai ke sini.
- **Impact:** statistik performa indikator yang dimanipulasi agar terlihat kredibel.
- **Severity:** CRITICAL

### C-4 — Council: RSI/EMA/MACD hilang menjadi angka 0, dikirim ke AI sebagai "DATA REAL"

- **File:** `app/api/council/route.ts:85-89`
- **Current logic:** `rsi: (rsiData as any)?.raw?.rsi ?? 0`, `ema: ?? 0`, `macdLine/macdSignal/macdHist: ?? 0`
- **Why it is wrong:** `modules/ai/service/council.service.ts` sudah diperbaiki (temuan H-11) supaya field hilang menjadi `'N/A'`, tapi guard-nya `typeof data?.rsi === 'number'` — dan **0 adalah number**. Fix-nya dimatikan oleh pemanggilnya sendiri. AI menerima "RSI 0.00" lalu menyimpulkan oversold ekstrem. Nilai 0 yang sama juga masuk `calculateScore()`: `rsi < 40` -> +2 poin, alasan "RSI 0.0 OVERSOLD".
- **Impact:** halusinasi terinduksi data palsu + skor komposit salah.
- **Severity:** CRITICAL

### C-5 — Sinyal SELL dihasilkan dari data nol, dikembalikan HTTP 200

- **File:** `app/api/council/route.ts:186` -> `modules/ai/service/local-council.service.ts:26,30`
- **Current logic:** fetch Yahoo gagal -> `runLocalCouncil(symbol, { price: 0, fundamentalSnapshot })` -> `price(0) > ma200(0)` = false -> `trendSignal = 'SELL'`, reason "Harga < MA200". `const rsi = data?.rsi || 50` -> agent Mean Reversion melaporkan "RSI 50.00".
- **Why it is wrong:** kegagalan total pengambilan data dikembalikan sebagai analisa lengkap 10 agent dengan sinyal SELL dan status 200. Pengguna tidak punya cara membedakannya dari analisa asli.
- **Severity:** CRITICAL

### C-6 — Output LLM tidak divalidasi sebelum di-cache dan ditampilkan

- **File:** `modules/ai/service/council.service.ts:129-133`
- **Current logic:** `const json = JSON.parse(jsonStr); await setCouncilCache(...); return json;`
- **Why it is wrong:** prompt melarang mengarang angka, tapi tidak ada satu pun pengecekan bahwa harga/level/ATR yang muncul di `reason` tiap agent benar-benar berasal dari blok `DATA REAL`. Model gratis (llama/deepseek `:free` via OpenRouter) paling rawan. Hasil halusinasi lalu di-cache 6 jam dan disajikan ke semua pengguna untuk simbol itu.
- **Severity:** CRITICAL (kategori "AI menciptakan financial data")

### C-7 — Data hilang menjadi RSI 50, menghasilkan +8 poin "zona BUY ideal"

- **File:** `app/api/stock/[ticker]/route.ts:390`, `modules/recommendation/service/recommendation.service.ts:238`, `modules/market/service/screener.service.ts:196`
- **Current logic:** `rsiVal = typeof rsiResult?.raw?.rsi === 'number' ? rsiResult.raw.rsi : 50` -> `modules/technical/service/scoring.service.ts:104` `rsi >= 50 && rsi <= 70` -> **+8 dari 15 poin**, alasan "RSI 50.0 zona BUY ideal".
- **Why it is wrong:** ketiadaan data diberi hadiah skor. Pola identik dengan temuan H-04 yang sudah diperbaiki di `scoreAsing()` (dulu 5 poin gratis, sekarang 0), tapi tidak diterapkan ke RSI.
- **Severity:** CRITICAL

### C-8 — Data basi hingga 24 jam ditampilkan sebagai data terkini

- **File:** `app/api/stock/[ticker]/route.ts:147-167` (TTL `STALE_FALLBACK` = 24 jam, `shared/cache/ttl-policy.ts`)
- **Why it is wrong:** backend SUDAH benar — menandai `_meta.source: 'stale-cache'`, `staleReason`, `ageSeconds`. Tapi konsumennya, `app/dashboard/page.tsx`, **tidak pernah membaca `_meta`** (diverifikasi: nol referensi di seluruh file). Harga, skor komposit, dan kategori BUY/SELL berumur sampai 24 jam dirender identik dengan data segar.
- **Severity:** CRITICAL

---

## HIGH (P1)

| # | File:Line | Masalah |
|---|---|---|
| H-1 | `modules/technical/service/scoring.service.ts:246,277` | **Double-count 30/100 poin.** `scoreAsing` menerima `foreignFlowStatus` yang berasal dari `analyzeAccumulationSignal()`, yang syarat pertamanya `cmf20 > 15` (`foreign-flow-proxy.ts:133`). `scoreBandar` menyekor `cmf20` secara langsung. Perbaikan H-07 mengklaim "dimensi berbeda"; nyatanya satu kuantitas dinilai dua kali. |
| H-2 | `app/api/stock/[ticker]/route.ts:379-382`, `modules/recommendation/service/recommendation.service.ts:233`, `app/api/council/route.ts:49` | **MA200 fabrikasi.** `sum200 / Math.min(200, len)` — saham dengan 60 bar menghasilkan rata-rata 60 hari yang dilabeli MA200, lalu dipakai untuk klaim "Uptrend sempurna P > MA20 > MA50 > MA200". Hanya `screener.service.ts` yang menjaga dengan `MIN_HISTORY_BARS = 200`. |
| H-3 | `modules/fundamental/service/dcf-valuation.service.ts:132-191` | **Fair Value dari konstanta karangan.** `pbvWajar=(roe/12)*1.4` (bank) / `*0.85` (non-bank); DDM r=12%, g=5% untuk SEMUA emiten; `PER Fair = eps x 15` (14.5 bank); DCF = Gordon satu tahap `fcf*1.05/(0.12-0.05)` = kelipatan 15x FCF tetap. Nol referensi metodologi. **Diverifikasi live:** TLKM menghasilkan fair value sekitar Rp 5.300 vs harga Rp 2.790 -> MOS +47% "UNDERVALUED"; angka ini yang menjadi `valuation_agent` berbobot **20%** di `/multi-agent`. |
| H-4 | `calculateIntrinsicValue` vs `calculateDcfModel` (file yang sama) | Dua nilai wajar berbeda untuk saham yang sama: r=12% perpetuity (dipakai `/fundamental`) vs WACC 11.9% + proyeksi 5 tahun + terminal growth 3.5% (dipakai `/dcf`). Pengguna melihat dua "harga wajar" tanpa penjelasan kenapa berbeda. |
| H-5 | `modules/fundamental/service/dcf-valuation.service.ts:276-278` | `SBN_10Y_YIELD_PCT = 6.7` hardcoded dan dikirim ke UI sebagai field `sbn_10y_yield`, sehingga terlihat seperti data makro live. `modules/macro/` hanya menyinkronkan USD/IDR; yield SBN tidak pernah di-fetch dari sumber mana pun. `EQUITY_RISK_PREMIUM_PCT = 5.2` sama. |
| H-6 | `app/api/stock/[ticker]/route.ts:207`, `modules/recommendation/service/recommendation.service.ts:211`, `modules/market/service/screener.service.ts:177`, `app/api/fundamental/[ticker]/route.ts:66` | Kurs fallback `15500` hardcoded di 4 tempat. Kalau fetch FX gagal, PBV emiten pelapor USD dihitung dengan kurs karangan. `dcf-valuation.service.ts` sudah benar (cache 7 hari dulu, statis paling akhir) — pola itu tidak disebar ke call-site lain. |
| H-7 | `shared/market/trading-session.ts:66` -> `modules/market/service/market-summary.service.ts:109-111` | **Volume ekstrapolasi disajikan sebagai volume nyata.** `estimateFullDayVolume()` membagi volume parsial dengan fraksi sesi yang sudah berjalan. Hasilnya mengisi field `volume` dan `value = volume x price` yang menjadi ranking **Top Volume & Top Value** di landing page publik. Angka yang dilihat pengguna bukan volume tertransaksi, dan tidak ada label estimasi di mana pun. |
| H-8 | `modules/market/service/screener.service.ts:383` | `sectorAvgPer` fallback `return 15` -> dirender sebagai kolom "PER vs Sektor" di `app/screener/page.tsx`. PER sektor karangan tampil sebagai data. |
| H-9 | `modules/recommendation/service/recommendation.service.ts:135` | `sentimentScore = 50 + changePct*3 + (bullish-bearish)*2.5` -> label "Sangat Positif"/"Sangat Negatif". Konstanta 3 dan 2.5 tanpa dasar apa pun. |
| H-10 | `modules/ai/service/orchestrator.service.ts:295-299` | Semua agent tidak tersedia -> `finalScore = 50` -> `decisionFromScore(50)` = **HOLD**. Keputusan investasi dihasilkan dari nol data. |
| H-11 | `modules/portfolio/validator/trade.validator.ts:5`, `modules/portfolio/service/trade.service.ts:23,63` | Harga transaksi 100% berasal dari client dan tidak pernah divalidasi terhadap harga pasar. Pengguna bisa POST `price: 1` sehingga P/L, nilai portofolio, dan Portfolio Health menjadi angka rekayasa. |
| H-12 | `app/api/chat/route.ts:79`, `app/api/intrinsic-explain/route.ts:47` | `context` (4000 char), `fairValue`, `harga`, `mos` dikirim client tanpa verifikasi server. AI mengeluarkan simpulan **BELI/JUAL/TAHAN** di atas angka yang bisa dipalsukan dari browser. |
| H-13 | `app/api/fundamental/[ticker]/route.ts:168-184` | 13 field fundamental memakai `|| 0`. Data tidak tersedia menjadi angka 0 (PER 0, ROE 0%, DER 0) — melanggar aturan "0 bukan NULL", dan berbeda dari jalur lain di aplikasi ini yang sudah benar memakai `null`. |
| H-14 | `modules/technical/service/scoring.service.ts:171-242` | **Bobot tidak dinormalisasi saat komponen null.** Diverifikasi live: BBCA/BBRI tidak punya `debtToEquity`, GOTO tidak punya `trailingPE`. Komponen yang hilang menyumbang 0 poin tanpa renormalisasi, sehingga bank dan emiten rugi kehilangan skor fundamental bukan karena buruk, melainkan karena Yahoo tidak menyediakan field-nya. `screener.service.ts:scoreStock()` SUDAH melakukan renormalisasi (temuan H-04); `calculateScore()` tidak. |

---

## MEDIUM (P2)

| # | Lokasi | Masalah |
|---|---|---|
| M-1 | `app/api/council/route.ts:217-222`, `:41` | Council memanggil `calculateScore()` **tanpa `cmf20`** sehingga jatuh ke heuristik lama yang didokumentasikan duplikatif; plus memakai `Close` mentah bukan `AdjClose`. Skor komposit saham yang sama berbeda antara Council dan Detail Saham. |
| M-2 | `modules/ai/service/orchestrator.service.ts:103` | `bandar_agent` masih memakai aturan lama "3 hari netValue positif", sementara semua modul lain sudah pindah ke konfirmasi 4-lapis. |
| M-3 | `modules/market/service/market-pulse.service.ts:74,106` | `meta.marketCap` **tidak ada** di Yahoo chart API (diverifikasi: key tidak ada di response). Akibatnya `marketCap` selalu 0, sehingga ukuran dan urutan tile heatmap sektor (`app/market-pulse/page.tsx:47,182`) tidak bermakna. |
| M-4 | `app/market-pulse/page.tsx:365-412` | "Market Breadth ... SANGAT BULLISH" dihitung dari 54 saham besar, bukan dari pasar. Label "N Saham Terpantau" memitigasi sebagian; kesimpulan bullish/bearish tidak. |
| M-5 | `modules/market/service/market-summary.service.ts:221-225` | `topRsiOversold` diranking dari RSI terendah tanpa ambang. Kartu berjudul "RSI Oversold" bisa berisi saham dengan RSI 60. |
| M-6 | `modules/news/service/news.service.ts:216-227,269-279` | Pencocokan berita per-emiten memakai kata nama perusahaan >3 huruf, sehingga kata "bank" cocok dengan judul apa pun tentang Bank Indonesia -> sentimen salah untuk BBCA/BBRI/BMRI/BBNI. |
| M-7 | `app/api/stock/[ticker]/route.ts:444-446` | `change_pct` dan `volume` memakai `|| 0`; array `quote.close` mentah bisa berujung null, sehingga 0% ditampilkan sebagai "flat" padahal datanya hilang. |
| M-8 | `components/RiskRewardCalculator.tsx:19-21` | Masih mem-parse string `value` via regex (anti-pola M-03), dan mencari label `'Trend Analysis'` yang tidak pernah ada (label sesungguhnya `'MA Trend IDX (20,50,200)'`), sehingga peringatan MA20 adalah kode mati permanen. |
| M-9 | `modules/notification/service/alert-evaluation.service.ts:26` | `getPrice()` mengembalikan `0` kalau field hilang -> alert `PRICE_BELOW` false-trigger. Alert juga mengonsumsi `/api/stock` yang bisa mengembalikan cache basi 24 jam tanpa cek freshness. RSI alert masih regex-parse string. |
| M-10 | `modules/recommendation/service/ai-pick.service.ts:103`, `app/breakout-radar/page.tsx:44` | `finalScore` = base (maks 100) + bonus (maks 40) = bisa 140, dirender di kolom "Skor" tanpa skala. Bobot bonus 15/10/10/5 dijelaskan sebagai "kelangkaan sinyal" tapi tidak dikalibrasi terhadap data. |
| M-11 | `modules/market/service/screener.service.ts:338-342` | Normalisasi arbitrer: `roe*3`, `100-der*40`, `div*15`, `50+growth*5`, `volRatio*50`. Menentukan ranking Top 10 yang direkomendasikan. |
| M-12 | `modules/backtest/*` | Survivorship bias (universe = emiten yang masih listing hari ini) dan memakai Close/Open mentah tanpa penyesuaian dividen. Return understated, kegagalan terhapus dari sampel. Look-ahead bias dan fee sendiri sudah benar. |
| M-13 | `app/api/screener`, `app/api/recommendations`, `app/api/market-summary` | `_meta` umur cache dihitung (`describeCacheAge`) tapi **tidak satu pun halaman merendernya**. Data 29 menit tampil sama dengan data baru. |
| M-14 | `shared/cache/ttl-policy.ts` (`AI_COUNCIL`) | Cache key Council = tanggal + kuartal laporan. Pergerakan harga intraday tidak menginvalidasi. Narasi AI berisi level harga bisa berumur 6 jam tanpa timestamp di UI. |
| M-15 | `modules/technical/service/analyzers/volume-analyzer.ts:6` | Loop mulai `length-21`; pada histori tepat 20 bar `history[-1]` undefined -> NaN -> diam-diam NEUTRAL. |
| M-16 | `modules/technical/service/consensus.service.ts` | `median_skor` = median confidence termasuk analyzer N/A (0) dan NEUTRAL (50). Dipublikasikan sebagai angka, maknanya tidak terdefinisi. |

---

## LOW (P3)

- `lib/trendingTickers.ts:17` — `Math.random()` memilih "trending ticker". Saat ini **tidak dipanggil di mana pun** (dead code), tapi kalau dipakai lagi menjadi klaim "trending" yang acak.
- `lib/aiProviders.ts:14-19` — model `gemini-3.5-flash`, `gemini-3.6-flash`, `gemini-3.1-flash-lite` kemungkinan besar tidak eksis, sehingga ada percobaan gagal + latency di tiap panggilan.
- EMA di-seed `prices[0]`, bukan SMA periode pertama (`ema-analyzer.ts:37`, `macd-analyzer.ts:46`). Bias kecil, hilang pada 200 bar.
- ATR memakai `Close` mentah untuk `prevClose` sementara analyzer lain memakai `AdjClose` (`volatility-analyzer.ts:12`).
- `estimateFullDayVolume` mengabaikan jeda siang dan jam tutup Jumat (sudah didokumentasikan sebagai aproksimasi).
- `data/portfolios.json` (142 byte) tersisa di repo, tidak dibaca kode mana pun.

---

## HASIL VERIFIKASI LIVE (cross-check 6 ticker)

Probe langsung ke Yahoo Finance, membandingkan asumsi kode dengan data sesungguhnya:

| Klaim di kode | Hasil verifikasi | Status |
|---|---|---|
| `dividendYield` fraksi -> x100 | BBCA 0.0565 -> 5.65% | BENAR |
| `payoutRatio` fraksi -> x100 | BBCA 0.7542 -> 75.4% | BENAR |
| `returnOnEquity` fraksi -> x100 | BBCA 0.21818 -> 21.8% | BENAR (fix C-05 valid) |
| `debtToEquity` x100 -> /100 | TLKM 59.982 -> 0.60x | BENAR |
| `regularMarketChangePercent` fraksi -> x100 | BBCA 0.031746 -> 3.17% (harga 6500, prev 6300) | BENAR |
| "EPS Yahoo emiten USD SUDAH IDR" | ADRO harga 2520 / eps 309.74 = 8.13 = `trailingPE` 8.136 | BENAR (fix C-06 valid) |
| `priceToBook` rusak untuk pelapor USD | ADRO 14.823x, ITMG 14.433x (bookValue 0.17 & 1.72 USD) | Bug nyata; koreksi FX di kode benar |
| `meta.marketCap` di chart API | **Field tidak ada** | M-3 dikonfirmasi |
| Kompas100.JK "mungkin null" | Live 831.812 (tersedia) | Aman |
| `adjclose` tersedia | Ada, 247 bar untuk range=1y | Aman |
| Bank tanpa DER | BBCA/BBRI `debtToEquity` undefined -> `scoreKesehatan` hanya dari Current Ratio | H-14 |
| Emiten rugi | GOTO `trailingPE` undefined -> `per = null` -> `scoreValuasi` hanya dari PBV | H-14 |

---

## DATA LINEAGE (fitur utama)

```
HARGA & SKOR (Detail Saham)
Yahoo chart v8 (range 20y, 1d) --> parse OHLC + AdjClose (stock route:226-239)
  |-- analyzerHistory (200 bar terakhir)
  |     |-- 10 analyzer (RSI Wilder / MACD / EMA / SMA / Trend / ATR / Momentum / S&R / Volume / MarketFlow)
  |     |-- volumeAdjustedHistory (estimateFullDayVolume, HANYA saat jam bursa)
  |     `-- foreign-flow-proxy (CMF/MFM) --> foreignFlowStatus + cmf20
  |-- quoteSummary (PER/PBV/ROE/DER/CR/RevGrowth) + koreksi FX USD->IDR
  `-- calculateScore() --> total_score --> getKategori() --> STRONG BUY/BUY/HOLD/SELL
        `-- Redis TTL 3 menit (+ stale-fallback 24 jam) --> /api/stock --> app/dashboard
                                                              ^
                                             _meta.freshness DIABAIKAN UI (C-8)

BANDAR / FOREIGN FLOW
Yahoo OHLCV --> Chaikin MFM --> netValueBillion / CMF20 / CLV
  |-- /api/flow --> BandarFlowPro           (OK: disclaimer eksplisit)
  |-- screener kolom "Bandarmology"          (OK: catatan kaki jujur)
  `-- chart header "Bandar Flow"             (RUSAK: hardcoded, C-1 / C-2)

FAIR VALUE
quoteSummary (eps/bvps/roe/dps/fcf/shares) --> koreksi FX
  --> Graham sqrt(22.5*EPS*BVPS) | PBV=(ROE/12)*k | DDM=DPS*1.05/(0.12-0.05) | PER=EPS*15 | DCF=FCF*1.05/0.07
  --> rata-rata berbobot router sektor --> fair_value --> MOS
  --> valuation_agent (bobot 20%) di /multi-agent + kartu IntrinsicValue

BERITA / SENTIMEN
10 RSS --> dedup --> filter kata kunci pasar --> batch LLM (cascade Gemini/Groq/OpenRouter)
  --> fallback heuristik kata kunci (ditandai `sentimentSource`)   (OK)
```

---

## AI AUDIT

| Fitur | Model | Input Data | Sumber Input | Risiko Halusinasi | Status |
|---|---|---|---|---|---|
| Council 10 agent | Gemini/Groq/OpenRouter (urutan acak) | price, MA50/200, EMA, RSI, S/R, ATR, volRatio, foreignFlow, skor, EPS, kuartal | dihitung server dari Yahoo | **TINGGI** — output tidak divalidasi (C-6), input bisa berisi 0 palsu (C-4) | GAGAL |
| Master summary `/multi-agent` | idem | JSON `agent_breakdown` | server | Sedang — hanya merangkum | PERLU PERBAIKAN |
| Chat LensAI | idem | `context` string 4000 char | **CLIENT** | **TINGGI** — simpulan BELI/JUAL di atas data tak terverifikasi (H-12) | GAGAL |
| AI Briefing | idem | indices, topPick, counts | **CLIENT** | Sedang | PERLU PERBAIKAN |
| Intrinsic Explain | idem | fairValue, harga, mos, methods | **CLIENT** | Sedang | PERLU PERBAIKAN |
| Sentimen berita | idem | judul RSS saja | RSS nyata | Rendah, fallback ditandai | OK |
| News Agent (orchestrator) | — | — | — | — | OK (jujur "belum aktif", bobot 0%) |

---

## CLASSIFICATION

**VERIFIED REAL DATA** — OHLCV Yahoo; PER/PBV/ROE/DER/CR/RevGrowth/DivYield/Payout (satuan terverifikasi live); 52W high/low; kalender dividen & earnings; judul dan tanggal RSS; portofolio/watchlist/transaksi Postgres; kurs USD/IDR (`modules/macro`).

**REAL DATA BUT CALCULATED** — RSI Wilder, MACD, EMA, SMA, ATR, Support/Resistance 20D, Market Flow Index, CMF20/CLV/MFM, beta historis, `total_score`, konsensus vote, backtest simulate, `consistency_years` dividen.

**ESTIMATED (wajib berlabel)** — LensFlow/Bandarmology (sudah berlabel di BandarFlowPro & Screener; TIDAK berlabel di chart header); `estimateFullDayVolume` (tidak berlabel di mana pun); fair value dan MOS; TP1/TP2/CL1/CL2 berbasis ATR; `safety_score` dividen; moat rating; breadth 54 saham.

**DUMMY / HARDCODED** — `'AKUMULASI'` (`TradingViewChart.tsx:283`); clamp akurasi 45-95% (`dashboard/page.tsx:491`); `sectorAvgPer` 15; kurs 15500 (4 tempat); `SBN_10Y_YIELD_PCT` 6.7 dan ERP 5.2 yang diekspos sebagai data.

**INVALID CALCULATION** — double-count flow 30 poin (H-1); MA200 short-history (H-2); `|| 0` fundamental (H-13); RSI 50 fallback berskor (C-7); bobot tidak dinormalisasi untuk bank/emiten rugi (H-14).

**UNKNOWN SOURCE** — tidak ada. Semua angka dapat ditelusuri; masalahnya metodologi dan pelabelan, bukan asal-usul.

**STALE DATA RISK** — payload stale 24 jam tanpa penanda di UI (C-8); cache screener/rekomendasi 15-30 menit tanpa label (M-13); Council 6 jam (M-14). `BREAKOUT_RADAR` TTL 3 hari sudah ditandai `stale` dan dirender UI (aman).

---

## YANG SUDAH BENAR (jangan diutak-atik saat perbaikan)

Diverifikasi dari kode dan/atau data, bukan diterima dari komentar:

- RSI Wilder tunggal dipakai 5 pemanggil; tidak ada lagi implementasi paralel.
- `AdjClose` konsisten di analyzer tren; `Close`/`High`/`Low` tetap mentah untuk S/R dan candlestick — pilihan yang benar.
- `/api/live` gagal secara jujur (503 + `price: null`); mock 10000 benar-benar hilang.
- Halaman `/macro`, `/pattern`, `/moat`, `/earnings` benar-benar dikosongkan dengan penjelasan, bukan diisi angka karangan.
- Market Pulse tidak lagi menurunkan Kompas100 dari IHSG; mengembalikan `null`, bukan 0.
- Backtest: look-ahead bias diperbaiki (eksekusi di OPEN D+1), fee dan slippage nyata, tie-break simbol bukan urutan array konstanta.
- `/api/risk-analysis`: beta regresi nyata, dipasangkan per TANGGAL, `biRateAvailable: false` jujur.
- `scoreStock` screener: komponen null dikeluarkan dan bobot dinormalisasi ulang (pola yang seharusnya juga dipakai `calculateScore`).
- Koreksi mata uang USD/IDR: terverifikasi benar secara empiris.
- `confidence` AI karangan sudah dihapus total, bukan diganti formula palsu.
- Kalender korporasi hanya Dividen & Earnings dari sumber nyata, dengan penanda "estimasi" dari Yahoo.

---

# FINAL VERDICT

## NO — belum aman untuk production.

Aplikasi ini **secara struktural jauh lebih jujur** dibanding kondisi audit sebelumnya: sumber data nyata, indikator baku, dan banyak fitur berani menampilkan "data tidak tersedia". Tetapi 8 temuan P0 masih menghasilkan **klaim finansial salah yang tidak dapat dibedakan pengguna dari data asli**, dan tiga di antaranya berada di halaman yang paling sering dibuka:

1. Setiap pengguna, untuk setiap saham, melihat "Bandar Flow: AKUMULASI" yang tidak pernah dihitung.
2. Angka "akurasi" dipaksa masuk rentang 45-95% agar terlihat kredibel.
3. Harga dan rekomendasi berumur hingga 24 jam disajikan tanpa penanda apa pun.

Prinsip yang ditulis repo ini sendiri — *lebih baik menampilkan "DATA TIDAK TERSEDIA" daripada data palsu* — dilanggar pada titik-titik tersebut.

## MUST FIX BEFORE PRODUCTION

### P0 — Critical (blocking)

1. **C-1** Hapus fallback `'AKUMULASI'`; render "N/A" kalau field tidak ada.
2. **C-2** Sambungkan header chart ke `analyzeBandarmology()`, atau hapus barisnya.
3. **C-3** Hapus clamp 45-95%; tampilkan akurasi apa adanya beserta jumlah sampel, atau sembunyikan sepenuhnya.
4. **C-4** `?? 0` menjadi `?? null` di council route; ubah guard `typeof === 'number'` menjadi cek null eksplisit.
5. **C-5** Data teknikal null menjadi HTTP 503 / kartu "data tidak tersedia", bukan 10 agent bersinyal SELL.
6. **C-6** Validasi output LLM: tolak atau tandai respons yang memuat angka di luar blok `DATA REAL` sebelum di-cache.
7. **C-7** Hapus fallback RSI 50 menjadi `null`; `scoreRsiMacd` memberi 0 poin dengan alasan "DATA TIDAK LENGKAP" (samakan dengan `scoreMATrend`/`scoreVolume`).
8. **C-8** Render `_meta.freshness`/`staleReason` di `app/dashboard` dan semua konsumen `/api/stock`.

### P1 — High

9. **H-1** Pisahkan benar-benar dimensi Asing vs Bandar, atau gabungkan menjadi satu komponen maksimal 15 poin.
10. **H-2** Terapkan guard `MIN_HISTORY_BARS` di semua pemanggil `calculateScore` (pola screener), bukan `Math.min`.
11. **H-13 + H-14** `|| 0` menjadi `null`, dan normalisasi bobot `calculateScore` saat komponen null (bank / emiten rugi).
12. **H-3 / H-4 / H-5** Dokumentasikan dan satukan metodologi valuasi; beri label "ESTIMASI MODEL, asumsi r/g tetap" di UI; jangan mengekspos konstanta 6.7 sebagai `sbn_10y_yield`.
13. **H-6** Satu helper FX (`getUsdIdrRate()` yang sudah ada) untuk 4 call-site; hapus `|| 15500`.
14. **H-7** Beri label eksplisit "estimasi volume sesi penuh" di Top Volume/Top Value, atau gunakan volume mentah untuk ranking.
15. **H-8** `sectorAvgPer` tanpa data menjadi `null` + kolom "N/A".
16. **H-11 / H-12** Validasi harga transaksi terhadap harga pasar di server; hitung `mos`/`context` di server, bukan menerima dari client.
17. **H-10** Semua agent unavailable menjadi status "tidak dapat dinilai", bukan HOLD 50.

### P2 — Medium

M-1 sampai M-16: konsistensi lintas halaman, label freshness, mislabeling kartu, false-trigger alert, survivorship bias backtest.

### P3 — Low

L-1 sampai L-6: dead code random, nama model AI yang tidak eksis, seed EMA, ATR AdjClose, file sisa.

---

*Audit selesai. Nol perubahan kode dilakukan. Menunggu keputusan lingkup perbaikan.*


---

# STATUS PERBAIKAN (2026-08-05)

Seluruh temuan P0-P3 dikerjakan dalam satu putaran setelah laporan di atas disetujui.
Verifikasi akhir: `tsc --noEmit` bersih, `vitest run` **217/217 lulus** (30 file test),
`next build` sukses.

## Prinsip yang dipakai di semua perbaikan

1. **Data tidak tersedia = `null`, bukan angka pengganti.** Tidak ada lagi `|| 0`,
   `?? 50`, atau konstanta cadangan pada jalur data finansial.
2. **Komponen tanpa data dikeluarkan dari skor, bobotnya dinormalisasi ulang** - ketiadaan
   data tidak menaikkan maupun menurunkan penilaian.
3. **Satu kuantitas dinilai satu kali.**
4. **Estimasi/model dilabeli sebagai estimasi/model di UI**, bukan disajikan sebagai
   pengukuran.
5. **Angka yang ditampilkan tidak pernah dimanipulasi agar terlihat masuk akal.**

## P0 - Critical (8/8 selesai)

| # | Perbaikan | File utama |
|---|---|---|
| C-1 | Fallback `'AKUMULASI'` dihapus; field diganti nama `money_flow_status`, tanpa data render "N/A". Header chart di `/dashboard` diisi dari analyzer yang benar-benar dihitung (EMA cross & Bandarmology CMF lewat `raw`) | `components/TradingViewChart.tsx`, `app/dashboard/page.tsx`, `app/api/stock/[ticker]/route.ts` |
| C-2 | "Bandar Flow" dari `volRatio > 1` diganti Chaikin Money Flow 20 hari dari OHLCV nyata (`moneyFlowLabel()`), null kalau candle < 20 | `lib/miniCouncil.ts`, `components/Dashboard.tsx`, `components/StockChartPanel.tsx` |
| C-3 | Clamp 45-95% dihapus; hit-rate ditampilkan apa adanya + jumlah sampel (`62% (n=41)`); RSI di backtest client diganti Wilder; label jadi "Hit-rate historis" | `app/dashboard/page.tsx`, `app/fundamental/page.tsx`, `components/AlgoFilters.tsx` |
| C-4 | `?? 0` untuk RSI/EMA/MACD di Council diganti `?? null` - fix H-11 lama tidak lagi dimatikan oleh pemanggilnya | `app/api/council/route.ts` |
| C-5 | Data teknikal gagal diambil sekarang HTTP 503 + `MARKET_DATA_UNAVAILABLE`, bukan 10 agen bersinyal SELL dari harga 0; `runLocalCouncil` seluruhnya nullable | `app/api/council/route.ts`, `modules/ai/service/local-council.service.ts` |
| C-6 | Output LLM diperiksa: angka berskala harga yang tidak ada di blok DATA REAL (toleransi 1,5% + turunan wajar S/R & ATR) membuat respons DITOLAK dan jatuh ke fallback lokal, tidak di-cache | `modules/ai/service/council.service.ts` |
| C-7 | Fallback `rsi: 50` & `macd: 0` dihapus di 4 pemanggil `calculateScore` | `app/api/stock/[ticker]`, `recommendation.service.ts`, `screener.service.ts`, `ai-pick-scan.service.ts` |
| C-8 | `_meta` dirender: label kesegaran di header + banner peringatan saat `stale-cache`/`STALE` | `app/dashboard/page.tsx` |

## P1 - High (14/14 selesai)

- **H-1** Kelompok arus dana ditulis ulang: `scoreAsing`+`scoreBandar` (yang menyekor
  CMF20 dua kali) diganti `scoreFlowTekanan` (besaran CMF20, maks 20) +
  `scoreFlowPersistensi` (panjang streak terkonfirmasi, maks 10). `volRatio` tidak lagi
  menyumbang poin di kelompok ini karena sudah dinilai penuh di komponen Volume.
- **H-2** `Math.min(200, len)` dihapus di 4 tempat - MA200 `null` kalau bar < 200.
- **H-3/H-4/H-5** Konstanta valuasi dikumpulkan ke `VALUATION_ASSUMPTIONS` dan diekspos ke
  UI lewat field `assumptions`; label kartu diperbaiki dari "Estimasi Harga Wajar (Median)"
  (dua klaim keliru sekaligus) menjadi "Estimasi Nilai Wajar (Model)" beserta asumsi yang
  dipakai; SBN 10Y/ERP ditandai `is_assumption: true` + tanggal penetapan, dan ringkasan
  DCF menyebutnya asumsi, bukan pembacaan pasar.
- **H-6** Helper tunggal `shared/market/usd-idr-rate.ts` (live -> cache 7 hari -> `null`).
  Semua `|| 15500` di 5 tempat hilang; tanpa kurs, metode yang bergantung padanya DILEWATI.
- **H-7** Volume mentah & volume ekstrapolasi dipisah: `volume` (ditampilkan) apa adanya,
  `volumeEstimatedFullDay` hanya untuk rasio, `partial: true` diteruskan ke UI.
- **H-8** `sectorAvgPer` fallback 15 dihapus - `null`, kolom "N/A", komponen PER
  dikeluarkan dari skor.
- **H-9** `sentimentScore` (rumus `50 + changePct*3 + (bull-bear)*2.5`) diganti
  `technicalBiasPct` = persentase analyzer yang bervote bullish; kolom UI jadi
  "Bias Teknikal".
- **H-10** Orchestrator tanpa satu pun agen berdata mengembalikan `final_score: null` +
  decision "DATA TIDAK TERSEDIA"; UI menampilkan "N/A", bukan 0.
- **H-11** Harga transaksi portofolio diverifikasi ke harga pasar
  (`price-guard.service.ts`, toleransi 35%); gagal ambil harga pasar = transaksi tetap
  lolos (tidak menghukum pengguna saat penyedia data bermasalah).
- **H-12** `/api/intrinsic-explain` sekarang HANYA menerima simbol dan menghitung ulang
  valuasi di server; `/api/chat` menambahkan blok "Data Terverifikasi Server" yang
  dinyatakan otoritatif di atas context dari browser.
- **H-13** 13 field fundamental `|| 0` -> `?? null`, UI memakai formatter `N/A`.
- **H-14** Renormalisasi bobot di `calculateScore` - bank tanpa DER & emiten rugi tanpa PER
  tidak lagi kehilangan skor karena field yang tidak disediakan sumber data; `coverage_pct`
  dilaporkan, dan di bawah 55% kategori menjadi `DATA TIDAK CUKUP`.

## P2 - Medium (16/16 selesai)

M-1 input Flow Council disamakan + AdjClose - M-2 `bandar_agent` pakai konfirmasi 4-lapis -
M-3 `marketCap` (selalu 0, field tidak ada di Yahoo chart API) dihapus dari heatmap, tile
seragam + label "rata-rata N saham wakil" - M-4 judul "Market Breadth (sampel)" -
M-5 judul "RSI Oversold" jadi "RSI (14) Terendah" + flag `isOversold` per saham -
M-6 pencocokan berita per-emiten pakai kata utuh + daftar kata generik (kata "bank" tidak
lagi mencocokkan berita BI ke BBCA/BBRI/BMRI), 5 test regresi - M-7 `change_pct`/`volume`
`|| 0` jadi `null` - M-8 label analyzer `'Trend Analysis'` yang tidak pernah ada diperbaiki
+ `raw.ma20/50/200` ditambahkan; badge MA Status tidak lagi menyimpulkan UPTREND dari MA 0 -
M-9 `getPrice` jadi `null` (alert PRICE_BELOW tidak lagi false-trigger saat harga tidak
diketahui) + alert diblokir untuk payload cache darurat - M-10 kolom "Skor" jadi
"Skor (0-140)" - M-11 catatan kalibrasi normalisasi screener - M-12 `BACKTEST_LIMITATIONS`
(survivorship bias, tanpa dividen, asumsi fee) ditampilkan bersama hasil backtest -
M-13 umur cache dirender di Screener & Rekomendasi - M-14 TTL Council 6 jam jadi 90 menit +
stempel `_computedAt` - M-15 guard volume-analyzer 20 jadi 21 bar (NaN diam-diam) -
M-16 `median_skor` hanya dari analyzer yang memberi arah.

## P3 - Low (6/6 selesai)

L-1 `pickTrendingTicker()` (Math.random berlabel "trending") diganti `defaultTicker()` -
L-2 3 nama model Gemini yang tidak eksis dihapus - L-3 EMA di-seed SMA (definisi baku),
berlaku untuk EMA & MACD - L-4 ATR memakai AdjClose konsisten - L-5 aproksimasi jam sesi
tetap didokumentasikan (tidak diubah, butuh kalender bursa resmi) - L-6
`data/portfolios.json` dihapus beserta kode di `sahamLensGuard` yang menulis portofolio
contoh ke disk.

## Koreksi terhadap laporan audit

- **L-1 salah diklasifikasikan sebagai dead code.** `pickTrendingTicker()` ternyata dipakai
  `components/Sidebar.tsx` sebagai tujuan default menu LensAI. Perbaikannya menyesuaikan:
  fungsi diganti `defaultTicker()` yang deterministik, bukan sekadar dihapus.

## Test regresi baru

- `modules/technical/service/__tests__/scoring.service.test.ts` - 11 test (C-7, H-1, H-2, H-14)
- `modules/news/service/__tests__/news-match.test.ts` - 5 test (M-6)

## Yang TIDAK diubah (dan alasannya)

- **Nilai asumsi valuasi** (discount rate 12%, pertumbuhan perpetuitas 5%, PER wajar 15x,
  SBN 10Y 6,7%, ERP 5,2%). Mengganti angka-angka ini dengan angka lain tanpa sumber data
  hanya memindahkan tebakan. Yang diperbaiki adalah **pelabelannya**: sekarang dinyatakan
  sebagai asumsi model beserta tanggal peninjauan, dan tabel sensitivitas menunjukkan
  seberapa besar hasilnya bergeser bila asumsinya berubah.
- **Universe backtest & survivorship bias.** Tidak bisa dihilangkan tanpa data emiten
  delisting historis. Dinyatakan eksplisit di UI.
- **Foreign Flow tetap proxy CMF**, bukan data broker - IDX tidak menyediakan feed itu
  gratis. Sudah dilabeli jujur di seluruh permukaan.
