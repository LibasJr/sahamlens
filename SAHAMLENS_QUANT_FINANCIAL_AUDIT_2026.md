# SAHAMLENS — AUDIT KUANTITATIF & VALIDASI HISTORIS 2026

> **STATUS PELAKSANAAN — diperbarui 12 Agustus 2026**
>
> **Fase 1 roadmap (bagian 22) SUDAH DIKERJAKAN.** C-1, C-2, dan C-3 sudah ditutup dan
> diverifikasi: `node docs/audit-2026-08-11/verify-findings.mjs --network` melaporkan
> **3/3 PASS**, `npx tsc --noEmit` bersih, dan `npx vitest run` lulus **763 test di 95
> file** (naik dari 742/92 — 21 test baru khusus mencegah ketiga temuan itu kembali).
>
> Yang berubah, ringkas:
> - `modules/technical/service/atr.ts` — satu implementasi Wilder untuk seluruh aplikasi;
>   tiga salinan lama dihapus. Jendela struktur dipotong **di dalam** `buildLongTradingSetup()`
>   sehingga produksi dan lab tidak bisa berbeda lagi.
> - `fundamental_history` bertambah `yahoo_sector` / `yahoo_industry` / `payout_ratio`;
>   backfill kini memakai konteks sektor point-in-time, bukan null.
> - `barAtForwardTradingOffset()` menggantikan pemilihan bar entry dua arah; sinyal tanpa
>   bar maju dibuang dan **dihitung** (`skippedNoForwardEntryRows`).
> - `SCORE_VERSION` → `lens-score-v1.4.0`, `SIGNAL_VERSION` → `v1.3.0`,
>   `DATA_SNAPSHOT_VERSION` → `v1.2.0`; kedua tanggal freeze OOS **dibekukan ulang ke
>   2026-08-12**; `parameterFingerprint` kini ikut mem-hash metode ATR & panjang jendela.
>
> **Konsekuensi operasional yang disengaja:** karena `SCORE_VERSION` naik, seluruh baris
> `lens_radar_history` lama ditolak `partitionByScoreVersion()`. Calibration Lab, Bucket
> Backtest, dan halaman Transparency akan menampilkan **nol sampel** sampai
> `npm run backfill:lens-history` dijalankan ulang. Itu perilaku yang benar — angka lama
> dihitung dengan model yang berbeda.
>
> **Status model TIDAK berubah: masih `NOT VALIDATED`.** Fase 1 memperbaiki *apa* yang
> diukur; ia tidak menghasilkan bukti baru. Hitungan sampel forward-OOS dimulai dari nol
> pada 2026-08-12. Temuan C-4, C-5, dan seluruh HIGH/MEDIUM/LOW di bawah **belum
> dikerjakan** — lihat Fase 2-4 di bagian 22.
>
> Bagian di bawah ini dipertahankan apa adanya sebagai catatan temuan aslinya, termasuk
> angka bukti pra-perbaikan.

---

**Tanggal audit:** 11 Agustus 2026
**Ruang lingkup:** seluruh scoring engine, fundamental/technical analysis, valuation, broker flow, risk, decision engine, serta **Backtest, Fundamental/Technical Backfill, Calibration Lab, TP/CL Lab, historical scoring, signal maturity, dan model validation status**.
**Basis kode:** `c:\Users\TyaTyoKya\Documents\GitHub\sl\sahamlens` — 534 file TS/TSX/MJS, ~72.000 baris.
**Posisi auditor:** independen. Tidak ada asumsi bahwa kode yang terlihat rapi berarti benar.

**Status verifikasi:** `npx vitest run` → **92 file test, 742 test, semua lulus** (durasi 9,25 detik). Kelulusan test itu **bukan** bukti kebenaran finansial — lihat temuan M-10 tentang apa yang tidak diuji.

**Bukti yang bisa dijalankan ulang:** temuan C-1, C-2, dan C-3 dapat diverifikasi sendiri lewat
`node docs/audit-2026-08-11/verify-findings.mjs --network`. Skrip itu memanggil kode produksi apa adanya dan tidak mengubah apa pun.

---

## 1. EXECUTIVE SUMMARY

SahamLens jauh di atas rata-rata aplikasi saham ritel dalam hal kejujuran data. Yang sudah benar dan layak dipertahankan:

* Tidak ditemukan satu pun skor yang berasal dari `Math.random`, data mock, atau angka karangan. Tiga kemunculan `Math.random` semuanya untuk ID/rotasi UI, bukan angka finansial.
* Pola "data tidak ada → beri 50" sudah dibongkar secara sistematis di `calculateScore()`: komponen tanpa data dikeluarkan dari pembilang **dan** menurunkan `coverage_pct`, dengan pemisahan tegas antara `NA()` (data hilang) dan `NOT_APPLICABLE()` (pertanyaan tidak berlaku, mis. DER bank).
* RSI sudah memakai Wilder smoothing yang benar. **Diverifikasi empiris terhadap implementasi independen** pada 5 emiten IDX (244 bar, data Yahoo langsung): selisih ~1e-14, yaitu presisi floating-point. Ini PASS sungguhan, bukan asumsi.
* Infrastruktur point-in-time fundamental (`fundamental_history`, `asOf()`, `period_end` vs `observed_date`, append-only, idempoten) dirancang benar dan diuji.
* Biaya transaksi, slippage, gerbang likuiditas ADV, dekorelasi sampel, block bootstrap, permutation test, dan protokol forward-OOS yang dibekukan per tanggal — semuanya ada dan tidak dipoles.
* Sistem **menyatakan dirinya sendiri** `PRODUCT_VALIDATION_STATUS = 'RESEARCH_ONLY'` dan membekukan threshold recommender. Ini kejujuran yang jarang ditemui.

Namun audit ini menemukan **satu kelas masalah yang membatalkan sebagian besar nilai dari seluruh lapisan validasi**:

> **Model yang divalidasi bukan model yang dikirim ke pengguna.**

Ada tiga divergensi terpisah dan independen antara jalur produksi dan jalur historis/validasi, dua di antaranya sudah dibuktikan secara numerik dalam audit ini:

1. **ATR produksi ≠ ATR TP/CL Lab.** Produksi memakai rata-rata aritmatik 14 True Range; Lab memakai Wilder. Selisih terukur **−4,8% s/d −13,3%** pada emiten nyata. Karena TP dan CL diturunkan dari ATR, seluruh win rate / SL hit rate / expectancy / MAE / MFE di TP/CL Lab milik strategi dengan stop dan target yang **tidak pernah dikirim ke pengguna**.
2. **Skor historis ≠ skor produksi.** Backfill mengirim konteks sektor kosong; produksi mengirim sektor Yahoo asli. Diuji atas 110.592 kombinasi fundamental: selisih LensScore hingga **10 poin**, dan **8,4% kombinasi berpindah bucket** (80-100 / 70-79 / 60-69 / <60). Bucket adalah unit analisis seluruh Calibration Lab.
3. **Ada look-ahead residual di pemilihan bar entry.** `barAtTradingOffset(..., offset=1, tolerance=2)` dapat memilih bar **tanggal sinyal itu sendiri** — bahkan bar H-1 — sebagai bar entry ketika bar H+1 tidak ada di histori ticker. Dibuktikan runnable di bagian 12.

Ditambah satu masalah penamaan yang berdampak langsung ke kepercayaan pengguna:

4. **Calibration Lab tidak melakukan kalibrasi.** Tidak ada reliability diagram, Brier Score, Expected Calibration Error, log loss, isotonic/Platt scaling — nol kemunculan di seluruh basis kode. Yang ada adalah pengukuran **discrimination** (spread bucket, t-test, IC, monotonisitas). Keduanya konsep berbeda, dan doc §30 secara eksplisit meminta pembedaan ini.

5. **Dua model nilai wajar yang saling bertentangan hidup berdampingan.** `fair-multiples.service.ts` menyatakan rumus `(roe/12)*0.85`, `PER wajar = 15`, dan `r = 12%` sebagai **salah** dan menggantinya dengan Gordon + cost of equity per emiten — tetapi `dcf-valuation.service.ts` **masih memakai rumus yang dinyatakan salah itu**, dan itulah yang menghasilkan angka "Harga Wajar" yang dilihat pengguna.

**Kesimpulan status model ada di bagian 23.**

---

## 2. ARSITEKTUR SCORING SAAT INI

```text
Yahoo Chart API (OHLCV + adjclose)
        │
        ├─ normalizeYahooOhlcRows()  shared/market/price-basis.ts:180
        │     raw OHLC + adjusted OHLC (faktor = adjClose/close per bar)
        │
        ├─ ANALYZER TEKNIKAL  modules/technical/service/analyzers/*
        │     RSI(Wilder) · EMA(seed SMA) · MACD · SMA · MA Trend · Volume
        │     Volatility(ATR) · Market Flow(A/D) · Support & Resistance(swing fractal)
        │
        ├─ FLOW PROXY  modules/market/service/foreign-flow-proxy.ts
        │     CMF20 · MFM · CLV · analyzeAccumulationSignal (konfirmasi 4 lapis)
        │
        └─ FUNDAMENTAL
              live      : Yahoo quoteSummary  (app/api/stock/[ticker]/route.ts)
              historis  : fundamental_history.asOf(observed_date <= t)
                          │
                          ▼
              calculateScore()   modules/technical/service/scoring.service.ts:767
              ├ Technical  40 : ma_trend 15 · rsi 8 · macd 7 · volume 10
              ├ Fundamental 30 : valuasi 10 · profitabilitas 10 · kesehatan 10
              └ Flow        30 : tekanan 20 · persistensi 10
                          │
              combine() renormalisasi atas bobot yang PUNYA data
                          │
              total_score (0-100) + coverage_pct
                          │
              getKategori(): coverage < 55 → 'DATA TIDAK CUKUP'
                             > 75 STRONG BUY · >= 60 BUY · >= 45 HOLD · else SELL
                          │
              evaluateMinimalEligibility()  modules/eligibility/
                          │
              buildLongTradingSetup()  → entry / stop / TP1 / TP2 / RR
                          │
              LensAI (penjelas, bukan sumber angka)
```

Bobot 40/30/30 berada di satu sumber tunggal (`shared/constants/lens-score-weights.ts`) dengan test yang menjaga totalnya 100, dan panel admin sengaja tidak punya tombol untuk mengubahnya saat runtime. Ini benar.

**Verifikasi matematis `combine()`** (`scoring.service.ts:745`):
`score = (raw/rawMax) × availableMax` dengan `availableMax = (rawMax/declaredTotal) × groupMax`
→ `score = raw/declaredTotal × groupMax`. Konsisten, tidak ada pembilang/penyebut yang menyusut bersamaan. **PASS.**

---

## 3. DATA LINEAGE

| Metrik | Sumber | Field mentah | Transformasi | Konsumen |
|---|---|---|---|---|
| Harga (return) | Yahoo chart | `indicators.adjclose[0]` | basis `TOTAL_RETURN_ADJUSTED` | RSI, EMA, MACD, SMA, MA Trend, backtest bucket |
| Harga (trading) | Yahoo chart | `quote.close/open/high/low` | basis `RAW` | ATR, TP/CL, level UI, TP/CL Lab |
| Volume | Yahoo chart | `quote.volume` | estimasi hari penuh saat jam bursa | scoreVolume, CMF, ADV20 |
| PER/PBV | Yahoo `summaryDetail`/`defaultKeyStatistics` | `trailingPE`, `priceToBook` | koreksi USD-reporter | scoreValuasi |
| ROE | Yahoo `financialData.returnOnEquity` | fraksi → ×100 | scoreProfitabilitas, fairPbv/fairPer |
| DER | Yahoo `financialData.debtToEquity` | ÷100 → rasio | scoreKesehatan |
| Fundamental historis | `fundamental_history` | `observed_date`, `period_end` | `asOf(t)` | orchestrator historis, chat, `/api/fundamental` |
| Broker summary | Index Alpha API | `buy_value`, `sell_value`, `buy_avg` | CSV → `broker_summary` | halaman Bandar (**tidak** masuk LensScore) |
| Makro (SBN, ERP) | — | — | **konstanta statis** | cost of equity, DCF |

**Titik putus lineage yang ditemukan:** kolom `market_cap` di `lens_radar_history` selalu `null` (`scripts/backfill-lens-history.mjs:463`), tetapi dibaca dan dipakai sebagai tiebreak di `buildTop5EquityCurve()` (`transparency.service.ts:308`). Tiebreak itu inert.

---

## 4. AUDIT FUNDAMENTAL

**Benar:**
* Konversi satuan Yahoo sudah benar dan konsisten di seluruh call-site: ROE fraksi→persen, DER ÷100, revenueGrowth fraksi→persen. Bug lama (ROE 21,8% terbaca 0,22%) sudah ditutup dan didokumentasikan di `app/api/stock/[ticker]/route.ts:201-213`.
* Koreksi mismatch mata uang (emiten pelapor USD seperti ADRO/ITMG/MEDC) memakai kurs nyata; kalau kurs tidak tersedia, metode yang bergantung padanya **dilewati**, bukan dihitung dengan kurs tebakan. `dcf-valuation.service.ts:126-135`.
* `sharesOutstanding` hilang → `fcf_per_share = null` dan DCF dilewati, bukan `|| 1` yang dulu meledakkan fair value. `dcf-valuation.service.ts:113`.
* Emiten rugi (PER ≤ 0) diberi 1/5 dengan alasan eksplisit bahwa kerugiannya sudah dihukum penuh di komponen profitabilitas — menghindari hitung ganda. `scoring.service.ts:500-506`.
* Bank: DER & Current Ratio dinyatakan `NOT_APPLICABLE` dengan `declaredMax: 0`, sehingga bobotnya direnormalisasi dan `coverage_pct` **tidak** ikut turun. Ini penanganan yang benar secara metodologis.

**Tidak lengkap (bukan salah, tapi klaim cakupan perlu diturunkan):**
Doc §3 meminta audit atas 38 metrik fundamental. Yang benar-benar dihitung dan menggerakkan skor hanya **6**: PER, PBV, ROE, DER, Current Ratio, Revenue Growth. Metrik berikut **tidak ada di engine**: ROIC, Debt/EBITDA, Net Debt/EBITDA, Interest Coverage, Quick Ratio (ada analyzer tapi tidak masuk `calculateScore`), FCF Margin, Asset Turnover, Inventory Turnover, Working Capital, PEG, EV/EBITDA, EV/EBIT, P/S, P/FCF, earnings yield sebagai komponen skor, FCF yield.
Doc §11 (khusus bank) meminta NIM, NPL gross/net, CASA, CAR, LDR, Cost of Credit, Cost to Income, Loan/Deposit Growth, Coverage Ratio, PPOP. **Tidak satu pun ada.** Bank saat ini dinilai dengan PER/PBV/ROE/Revenue Growth saja, ditambah pernyataan bahwa DER/CR tidak berlaku. Itu perbaikan besar dari sebelumnya, tetapi bukan analisis bank.
Doc §12 (siklikal): ada `isPeakCycleSignature()` (PER < 8 **dan** ROE > 25 → valuasi dibatasi 40%). Ini penjaga yang benar arahnya, tetapi normalized earnings, realized price, cash cost, dan siklus komoditas **tidak ada**.

**Percampuran periode (quarterly/YTD/TTM/annual):** Yahoo `trailingPE`, `returnOnEquity`, `revenueGrowth` semuanya TTM. Tidak ada pencampuran di dalam engine karena engine tidak pernah menggabungkan laporan kuartalan sendiri — ia hanya mengonsumsi agregat Yahoo. **PASS secara teknis, tetapi artinya SahamLens tidak punya kontrol atas definisi periodenya sendiri**; kalau Yahoo mengganti basis, engine tidak akan tahu.

---

## 5. AUDIT TEKNIKAL

| Indikator | Implementasi | Verdict |
|---|---|---|
| RSI 14 | Wilder RMA, satu implementasi dipakai semua pemanggil (`modules/technical/service/rsi.ts`) | **PASS — diverifikasi numerik** |
| EMA | seed SMA periode pertama (bukan `prices[0]`) | PASS |
| MACD 12/26/9 | EMA of EMA dengan seed SMA | PASS |
| SMA 5/10/20, MA 20/50/200 | rata-rata sederhana atas AdjClose | PASS |
| **ATR 14** | **rata-rata aritmatik 14 TR terakhir — BUKAN Wilder** | **FAIL — lihat C-1** |
| Support/Resistance | swing fractal 5 bar (Bill Williams) + clustering by touches + bersyarat struktur HH/HL vs LH/LL | PASS metodologi |
| Market Flow (A/D) | volume hari naik vs turun 14 hari atas AdjClose | PASS |
| CMF20 / MFM / CLV | definisi Chaikin baku | PASS |
| ADX, Bollinger, Stochastic, ROC, OBV, VWAP | **tidak ada di engine skor** (Bollinger/ATR/CMF ada di `lib/chart-indicators.ts` khusus render chart) | NOT IMPLEMENTED |

**Warm-up period ditangani benar dan fail-closed:**
`ma200: null` kalau < 200 bar (`backfill-lens-history.mjs:430`), RSI butuh ≥ 15 bar, MACD ≥ 35, EMA ≥ 50, MA Trend ≥ 200, Volume ≥ 21 (guard `< 21` sudah memperbaiki off-by-one yang dulu membuat `history[-1]` → NaN diam-diam), Support/Resistance ≥ 40. Missing `AdjClose` menghasilkan `N/A (MISSING_ADJUSTED_PRICE)`, bukan fallback diam-diam ke `Close`. Ini persis yang diminta doc §C.

**Pemisahan basis harga sudah tegas dan benar:** indikator return-based (RSI/EMA/MACD/SMA/MA/Market Flow) wajib `AdjClose`; ATR sengaja memakai satu basis RAW penuh (High/Low raw vs prevClose raw) supaya true range tidak palsu di sekitar aksi korporasi. `scoreMATrend()` bahkan menolak menilai kalau basis harga MA dan basis harga current berbeda (`PRICE_BASIS_MISMATCH`). Ini kualitas yang tinggi.

---

## 6. AUDIT VALUASI

Ada **dua** mesin nilai wajar yang berjalan bersamaan dan saling bertentangan:

**Mesin A — `modules/fundamental/service/fair-multiples.service.ts`** (dipakai `scoreValuasi` di dalam LensScore):
```text
r    = SBN10Y(6,7%) + beta × ERP(5,2%)     beta di-clamp 0,4–2,0
g    = ROE × retention, dibatasi 5%
PBV* = (ROE − g) / (r − g)
PER* = payout_implied × (1 + g) / (r − g),  payout_implied = 1 − g/ROE
```
Ini benar secara teori (Gordon / residual income), internally consistent (identitas PBV = PER × ROE terpenuhi), dan menangani kasus tepi dengan benar (`g ≥ ROE → g = 0`, spread minimum 2%).

**Mesin B — `modules/fundamental/service/dcf-valuation.service.ts`** (dipakai `/api/intrinsic`, komponen `IntrinsicValue`, dan `valuation_agent` di `/multi-agent`):
```text
pbvWajar = (roe / 12) × 0,85         non-bank
pbvWajar = (roe / 12) × 1,4          bank, cap 3,2
perWajar = 15                        semua emiten non-bank, 14,5 untuk bank
r        = 12%   untuk SEMUA emiten
DDM      = dps × 1,05 / (0,12 − 0,05)
"DCF"    = fcf/share × 1,05 / (0,12 − 0,05)
```
File Mesin A membuka dirinya dengan mengutip **persis empat rumus ini** sebagai contoh "konstanta yang tidak berasal dari mana pun", lalu menyebut selisihnya "besar dan sistematis, bukan pembulatan" (contohnya sendiri: 1,42x vs 2,14x, selisih 50%). Mesin B tidak pernah ikut diperbaiki.

**`calculateDcfModel()`** (halaman `/dcf`) jauh lebih baik: proyeksi FCF 5 tahun, growth = ROE × retention di-clamp 2–12%, terminal value, PV, dikurangi net debt per saham, tabel sensitivitas WACC × terminal growth yang dihitung ulang per sel. Namun WACC-nya adalah cost of equity build-up statis yang sama untuk semua emiten (6,7 + 5,2 = 11,9%), tanpa beta dan tanpa struktur modal — dan ini **sudah dilabeli jujur** di keluaran (`wacc_pct` dengan catatan "discount rate proxy, bukan WACC aktual", `is_assumption: true`, `set_on`).

Komponen DCF penuh yang diminta doc §5 — Revenue Forecast, EBIT Margin, Tax, NOPAT, D&A, CAPEX, ΔNWC, FCFF — **tidak ada**. Yang ada adalah proyeksi FCF agregat Yahoo. Ini harus dinyatakan; "DCF" saat ini berarti "proyeksi FCF Yahoo dengan satu tingkat pertumbuhan".

---

## 7. AUDIT BROKER FLOW / BANDAR

**Yang benar dan jujur:** setiap alasan yang dihasilkan komponen Flow memakai istilah "arus dana"/"tekanan beli", **bukan** "asing net buy". Komentar kode berulang kali menegaskan ini proxy harga+volume, bukan data broker. Doc §8 secara eksplisit meminta broker flow diperlakukan sebagai *market microstructure evidence*, bukan kepastian arah — dan kode mematuhinya.

**Pembedaan VALUE vs VOLUME vs FREQUENCY:**
* `computeDailyNetFlow` = MFM × volume × close → **VALUE** (rupiah). Benar untuk mengukur besaran uang.
* `chaikinMoneyFlow20` = Σ(MFM × volume) / Σ volume → **VOLUME-normalized**, bisa dibandingkan antar saham beda harga. Benar dan alasannya didokumentasikan.
* **FREQUENCY tidak dipakai sama sekali** di engine skor. API Index Alpha mengembalikan `buy_freq`/`sell_freq`, tetapi `indexAlphaBatchToCsv()` (`index-alpha-broker-summary.service.ts:65`) hanya memetakan `buy_value`, `sell_value`, `buy_avg`, `sell_avg`. Frekuensi dibuang. Untuk BEI ini kehilangan informasi nyata: rasio value/frequency membedakan akumulasi institusi (few, large) dari ritel (many, small).

**Temuan struktural:** data broker summary **asli** memang di-ingest, tetapi **tidak pernah masuk LensScore**. Komponen Flow — 30 dari 100 bobot — seluruhnya proxy CMF dari harga+volume. Selain itu `INDEXALPHA_DAILY_TICKER_LIMIT` default **5 ticker/hari**, sehingga cakupan data broker asli akan selalu tertinggal jauh di belakang universe 109 emiten.

---

## 8. AUDIT RISK MANAGEMENT

`buildLongTradingSetup()` (`modules/recommendation/service/trading-setup.ts:94`) — **secara metodologis ini bagian terbaik dari aplikasi:**

```text
support terkonfirmasi = swing low dengan >= 2 sentuhan
stop  = confirmedSupport ? min(price − 0,75·ATR, support − 0,25·ATR)
                         : price − 1,5·ATR
risk  = price − stop
tolak setup kalau resistance pertama < price + 1,5 × risk    (RR minimum)
TP1   = min(resistance pertama, price + 2 × risk)
TP2   = resistance berikutnya di atas TP1, atau price + 3 × risk
pembulatan ke fraksi harga IDX: stop ke BAWAH, TP ke ATAS, entry ke terdekat
RR dihitung ULANG setelah pembulatan; kalau < 1,5 setup ditolak
```

Tidak ada `TP = entry + 10%` di mana pun. Stop berbasis volatilitas **dan** struktur, target dibatasi resistance nyata, RR divalidasi dua kali (sebelum dan sesudah pembulatan tick). Fraksi harga IDX (`IDX_TICK_BANDS`) benar sesuai aturan bursa. Doc §32 terpenuhi secara desain.

Yang **tidak ada**: position sizing, max drawdown level portofolio, downside risk (semi-deviation), expected return, skenario downside. `worstTradeDrawdownPct` dan `drawdownPercentile95Pct` adalah statistik per-trade, dan alasan mengapa drawdown equity curve tidak dihitung didokumentasikan dengan benar (sinyal tumpang tindih → volatility drag palsu). Itu keputusan yang bisa dipertanggungjawabkan, tapi artinya **SahamLens tidak punya angka risiko level portofolio sama sekali.**

---

## 9. AUDIT DECISION ENGINE

Ambang keputusan dipusatkan di `decision-thresholds.ts` dengan penjelasan mengapa dua set ambang **sengaja** berbeda (dua skor komposit berbeda, bukan dua cutoff dari kuantitas yang sama). Konsensus vote disatukan di `calculateConsensus()` dengan bobot per **dimensi**, bukan per analyzer — sehingga menambah analyzer tren tidak diam-diam memperbesar suara tren. Ini benar dan diuji.

Gerbang kelayakan (`evaluateMinimalEligibility`) memisahkan blocking (histori pendek, tidak diperdagangkan, data basi, coverage rendah) dari non-blocking (likuiditas rendah), tidak melakukan auto-HOLD, dan fail-closed saat ADV tidak terukur. Benar.

**Masalah:** gerbang ini **tidak pernah diterapkan pada populasi backtest**. Lihat H-1.

---

## 10. AUDIT KEBENARAN MATEMATIS

Diperiksa: pembagian nol, NaN, Infinity, penyebut negatif, pembulatan terlalu dini, truncation, unit mismatch, percentile terbalik, anualisasi, off-by-one.

* Pembagian nol dijaga di seluruh jalur kritis (`volAvg20 <= 0`, `rawMax === 0`, `grossLoss === 0`, `range <= 0`, `spread >= MIN_SPREAD`, `den > 0` di Pearson).
* `drawdownPercentile95Pct` mengambil persentil dari **besaran** penurunan, bukan nilai bertanda — komentar di `history-return-utils.ts:41` menjelaskan bahwa mengurutkan nilai bertanda akan mengembalikan trade yang nyaris tidak turun. Ini kesalahan klasik yang **dihindari dengan sadar**. PASS.
* Welch t-test: statistik, derajat kebebasan Welch–Satterthwaite, dan CDF Student-t lewat regularized incomplete beta (Lanczos + continued fraction) — implementasi standar dan benar.
* Permutation p-value memakai `(k+1)/(n+1)`, bukan `k/n`. Benar (menghindari p = 0).
* PRNG deterministik (mulberry32) diseed dari hash dataset, dengan `datasetHash` diekspos untuk audit. Reproducible. PASS.
* Rounding dilakukan di akhir (`roundPct`), bukan di tengah rantai.

**Satu inkonsistensi penamaan:** `tpcl-validation.service.ts:255` `p95MaePct: round(percentile(maes, 0.05))`. Karena semua `maePct ≤ 0`, mengambil persentil ke-5 dari nilai bertanda memang menghasilkan drawdown terdalam pada ekor 5% — hasilnya **benar**, tetapi konvensinya berlawanan dengan `drawdownPercentile95Pct` yang bekerja atas besaran. Dua konvensi untuk satu konsep di satu basis kode adalah utang yang akan digigit nanti.

---

## 11. DETEKSI DUMMY / HARDCODED / FALLBACK

Pencarian agresif atas seluruh basis kode (kecuali test) untuk `Math.random`, `?? 50`, `|| 50`, `score = <angka>`, `confidence = <angka>`, `dummy|mock|fake|placeholder|simulated`, `?? 0.5`.

| Pola | Temuan | Verdict |
|---|---|---|
| `Math.random` | 3 — semua ID/rotasi UI | BERSIH |
| data mock/dummy/fake | 0 di jalur produksi | BERSIH |
| `score = 50` fallback | 6 di `orchestrator.service.ts` | **AMAN** — semuanya `weight_pct: 0` + `available: false`, dan `weightedEntries` memfilter keduanya. Total bobot 0 → `final_score: null` + `'DATA TIDAK TERSEDIA'`, bukan HOLD palsu |
| `?? 50` | **4 di `market-regime.service.ts:209-212`** | **FABRIKASI — lihat M-1** |
| `confidence = 50/60` | 61, seluruhnya di analyzer fundamental sederhana | ARBITRARY tapi tidak menggerakkan LensScore (analyzer ini hanya dipakai `/multi-agent` dan tampilan) |

**Kesimpulan bagian ini: klaim "tidak ada fabricated intelligence" pada jalur LensScore utama TERBUKTI**, dengan satu pengecualian nyata di market regime.

---

## 12. AUDIT POINT-IN-TIME

### Yang sudah benar

**Fundamental PIT** (`fundamental-history.repository.ts`): pemisahan `period_end` / `observed_date`, `asOf()` yang secara SQL hanya mengembalikan `observed_date <= requestedDate` dan mengembalikan `null` (bukan baris terdekat) kalau tidak ada, append-only `ON CONFLICT DO NOTHING`, validasi `period_end <= observed_date` yang **melempar** kalau dilanggar, dan penolakan `observed_date` di masa depan pada importer admin. Diuji. **PASS.**

**Backfill teknikal** (`backfill-lens-history.mjs:369`): `historyToDate = yahooRows.filter(row => row.Date <= bar.date)` — setiap indikator dihitung hanya dari bar sampai tanggal itu. `sma(adjustedCloses, 200)` mengembalikan `null` kalau kurang dari 200 bar. Tidak ada indikator hari ini yang ditulis ke tanggal lampau. **PASS.**

**Swing point** (`swing-levels.ts:55`): `WING` bar terakhir tidak pernah menghasilkan swing, karena swing baru terkonfirmasi setelah `WING` bar berikutnya terbentuk. Ini penolakan look-ahead yang eksplisit dan benar. **PASS.**

**Simulator backtest** (`simulate.service.ts:147`): sinyal hari D dieksekusi di **open hari D+1**, exit sebelum entry supaya kas terpakai benar, posisi yang halt tetap di antrean. **PASS.**

**Protokol forward-OOS**: `LENS_RADAR_OOS_FREEZE_DATE = '2026-08-07'` dengan aturan `signalDate > freezeDate` dan `historyBackfillAllowed: false`. Tidak ada jalan untuk melabeli ulang histori lama sebagai OOS. **PASS — dan ini standar yang tinggi.**

### FINDING C-3 — look-ahead residual di pemilihan bar entry

```text
FINDING: bar entry dapat jatuh pada tanggal sinyal, bahkan sebelum tanggal sinyal
Lokasi file : modules/lens-radar/service/history-return-utils.ts:58
Function    : barAtTradingOffset()
Pemanggil   : bucket-backtest.service.ts:386, calibration.service.ts:359
```

**Implementasi saat ini**
```ts
export function barAtTradingOffset(byDate, calendar, fromIndex, offset, tolerance = 2) {
  const target = fromIndex + offset;
  const probes = [0];
  for (let i = 1; i <= tolerance; i++) probes.push(-i, i);
  for (const probe of probes) { ... byDate.get(calendar[target + probe]) ... }
}
```

**Masalah.** Dipanggil dengan `offset = 1` dan `tolerance` default 2, urutan probe menjadi
`signalIdx+1 → signalIdx → signalIdx+2 → signalIdx−1 → signalIdx+3`.
Probe kedua adalah **tanggal sinyal itu sendiri**, dan `byDate` per-ticker **selalu** memuat bar tanggal sinyal (sinyalnya berasal dari bar itu). Jadi setiap kali ticker tidak punya baris di tanggal bursa berikutnya — suspensi, hari scan yang terlewat, ticker yang masuk universe belakangan, atau baris yang dibuang gerbang likuiditas — entry jatuh ke bar tanggal sinyal, dan `entryOpen` menjadi **open hari sinyal**, yaitu harga sebelum close yang melahirkan sinyal itu diketahui.

**Bukti runnable** (dijalankan terhadap `barAtTradingOffset` produksi, bukan tiruan):
```text
histori lengkap        -> entry = 2026-01-08   (benar, H+1)
H+1 & H+2 hilang       -> entry = 2026-01-07   <<< LOOK-AHEAD: entry <= tanggal sinyal
hanya bar H-1 tersedia -> entry = 2026-01-06   <<< entry SEBELUM tanggal sinyal
```

**Mengapa salah secara finansial.** Return dihitung dari `entryOpen` ke close T+20. Kalau `entryOpen` adalah open hari sinyal, sinyal dibeli sebelum informasi yang menghasilkannya ada. Untuk sinyal momentum/volume — dan LensScore memberi 10 poin penuh ke volume yang mengonfirmasi kenaikan hari itu — bias ini **searah positif**: hari dengan close kuat cenderung punya open yang lebih rendah dari close, sehingga entry menjadi lebih murah dari yang bisa dicapai siapa pun.

**Risiko terhadap pengguna.** Angka avg return T+20 per bucket, win rate, spread 80-100 vs <60, dan seluruh p-value yang ditampilkan di halaman Transparency menjadi terlalu optimistis untuk sebagian sampel yang tidak diketahui besarnya (tidak ada penghitung).

**Perbaikan yang direkomendasikan.**
```ts
// Entry HARUS strictly setelah tanggal sinyal. Toleransi hanya boleh MAJU.
export function barAtForwardTradingOffset(byDate, calendar, fromIndex, offset, forwardTolerance = 2) {
  for (let probe = 0; probe <= forwardTolerance; probe++) {
    const idx = fromIndex + offset + probe;
    if (idx <= fromIndex) continue;               // penjaga eksplisit: tidak pernah <= sinyal
    if (idx >= calendar.length) return null;
    const bar = byDate.get(calendar[idx]);
    if (bar) return bar;
  }
  return null;
}
```
Tambahkan penghitung `entrySkippedNoForwardBar` dan tampilkan di Calibration Lab. Untuk bar **exit** (offset 5/20) toleransi dua arah masih sah, tetapi horizon efektifnya (18–22 hari bursa) harus dilaporkan, bukan disebut "T+20".

**Prioritas: CRITICAL.**

### Sisa masalah PIT

* **`hasCorporateActionGap(series, ...)`** (`bucket-backtest.service.ts:397`) memeriksa gap atas `series` yang **sudah difilter** likuiditas/gocap/versi. Tanggal yang terbuang membuat dua baris berurutan berjarak beberapa hari, sehingga pergerakan wajar multi-hari bisa melewati ambang 40% dan trade dibuang sebagai "aksi korporasi". Arahnya konservatif (membuang trade), tetapi ia **menyeleksi sampel berdasarkan likuiditas**, bukan berdasarkan aksi korporasi.
* **`buildTradingCalendar()`** membangun kalender dari tanggal yang ada di `lens_radar_history`, bukan dari kalender bursa IDX. Kalau satu hari bursa gagal di-scan untuk seluruh universe, hari itu hilang dari kalender dan seluruh offset T+5/T+20 bergeser satu hari untuk semua ticker. Ada `shared/calendar/idx-trading-calendar.ts` di repo — tidak dipakai di sini.

---

## 13. AUDIT KUALITAS DATA & COVERAGE

Pemisahan `SCORE` / `CONFIDENCE` / `DATA COVERAGE` yang diminta doc §14 **sudah ada dan benar**:
`coverage_pct` dihitung dari `availableMax/declaredMax` per sub-faktor, `declaredMax` konstan sehingga hilangnya sub-faktor terlihat, ambang 55% menghasilkan `'DATA TIDAK CUKUP'`, dan `MIN_COVERAGE_FOR_RECOMMENDATION` di-reexport dari `MIN_COVERAGE_PCT` supaya dua lapisan tidak bisa berbeda pendapat.

**Tetapi lapisan validasi mengabaikannya sepenuhnya — lihat H-1.**

---

## 14. ISU SPESIFIK BEI

| Aspek | Status |
|---|---|
| Fraksi harga (tick) IDX | **PASS** — `IDX_TICK_BANDS` benar, TP dibulatkan ke atas, stop ke bawah |
| Saham gocap (< Rp 50) | **PASS** — difilter, dan hanya diuji atas harga RAW (harga adjusted bisa sah di bawah 50 setelah split) |
| Lantai likuiditas ADV | **PASS** — Rp 1 miliar/hari, konstanta yang sama dipakai gerbang produk dan backtest |
| Kalender libur BEI | **FAIL** — `MAX_STALE_CALENDAR_DAYS = 5` hari **kalender** sebagai fallback; `shared/calendar/idx-trading-calendar.ts` ada tapi tidak dipakai di engine validasi |
| Suspensi | **PARTIAL** — dideteksi lewat proxy volume nol (≥ 3 hari berturut atau ≥ 8 dalam 20), tidak ada feed suspensi resmi. Dinyatakan jujur sebagai "KEMUNGKINAN suspensi" |
| ARA/ARB | **NOT IMPLEMENTED** — ambang 40% di `detectCorporateAction` sengaja tidak menebak, tapi auto-reject ARA/ARB berulang tidak dibedakan dari aksi korporasi |
| Sektor IDX-IC | **PARTIAL** — pemetaan taksonomi Yahoo → 12 kelompok perlakuan, dan file itu menyatakan sendiri bahwa ini bukan IDX-IC |
| Emiten pelapor USD | **PASS** |
| Papan pencatatan | **PASS** — filter `Papan === 'Utama'` dibuang setelah ditemukan bahwa kolom itu berulang siklis menurut abjad (BBCA terlabel 'Akselerasi') |

---

## 15. TEMUAN KRITIS

### C-1 — ATR produksi berbeda formula dari ATR TP/CL Lab

```text
FINDING: TP/CL Lab memvalidasi setup yang tidak pernah dikirim ke pengguna
Lokasi:
  produksi  modules/technical/service/analyzers/volatility-analyzer.ts:6-17
  produksi  modules/recommendation/service/breakout.service.ts:147-155  (salinan kedua)
  konsumen  modules/recommendation/service/ai-pick-scan.service.ts:95-106
  lab       modules/recommendation/service/tpcl-validation.service.ts:263-277
```

**Implementasi saat ini**

Produksi (`volatility-analyzer.ts`) — rata-rata aritmatik sederhana:
```ts
let trSum = 0;
for (let i = history.length - 14; i < history.length; i++) {
  const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  trSum += tr;
}
const atr = trSum / 14;
```

TP/CL Lab (`tpcl-validation.service.ts`) — Wilder:
```ts
let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
for (let i = period; i < trs.length; i++) atr = ((atr * (period - 1)) + trs[i]!) / period;
```

**Masalah.** ATR menurut definisi J. Welles Wilder (1978) adalah rata-rata **tersmoothing** (RMA), bukan rata-rata 14 nilai terakhir. Ini **persis kesalahan yang sama** yang sudah ditemukan dan diperbaiki untuk RSI (temuan H-01 audit 2026-08-03, didokumentasikan panjang di `modules/technical/service/rsi.ts`) — koreksinya tidak pernah diterapkan ke ATR.

**Bukti empiris** — kedua formula dijalankan atas data Yahoo yang sama (244 bar, 11 Agustus 2026). Reproduksi: `node docs/audit-2026-08-11/verify-findings.mjs --network`.

| Ticker | ATR14 produksi (rata-rata sederhana) | ATR14 Wilder (TP/CL Lab) | Selisih | Kontrol: selisih RSI |
|---|---|---|---|---|
| BBCA.JK | 146,43 | 163,85 | **−10,63%** | −7,11e-15 |
| BBRI.JK | 63,57 | 73,72 | **−13,77%** | 0,00e+0 |
| TLKM.JK | 85,71 | 90,50 | **−5,29%** | −7,11e-15 |
| ASII.JK | 142,14 | 155,48 | **−8,58%** | −7,11e-15 |
| ADRO.JK | 60,71 | 61,16 | −0,73% | 1,42e-14 |

Kolom terakhir adalah kontrol metode: RSI produksi diuji terhadap implementasi independen pada data yang sama dan berbeda ~1e-14, yaitu presisi floating-point. Jadi alat ukurnya valid — **ATR yang menyimpang, bukan pengujiannya.**

**Mengapa salah secara finansial.** ATR masuk langsung ke `buildLongTradingSetup`:
`stop = price − 1,5·ATR` (jalur fallback) dan `TP1 = entry + 2 × risk`. Untuk BBRI, risiko per saham menjadi 95,4 (produksi) vs 110,6 (lab) — **13,8% lebih sempit**, dan TP1 ikut 13,8% lebih dekat. SL hit rate, TP1 hit rate, waktu ke TP, expectancy, dan distribusi MAE/MFE dari setup yang stopnya 13% lebih sempit **bukan angka yang sama** dengan yang dilaporkan Lab.

**Divergensi kedua di fungsi yang sama.** Produksi memanggil `buildLongTradingSetup` dengan **seluruh histori 2 tahun** (`ai-pick-scan.service.ts:98`), sedangkan Lab memotong ke `STRUCTURE_LOOKBACK = 60` bar (`tpcl-validation.service.ts:346-349`). Support/resistance struktural yang ditemukan berbeda → level stop dan TP1 berbeda lagi, di luar efek ATR.

**Risiko terhadap pengguna.** Halaman TP/CL Validation Lab menampilkan `robustnessStatus`, win rate, profit factor, dan expectancy sebagai bukti kualitas TP/CL yang mereka lihat di AI Pick. Angka-angka itu milik strategi lain.

**Perbaikan yang direkomendasikan.**
1. Buat `modules/technical/service/atr.ts` berisi **satu** `calculateWilderAtr(bars, period = 14)` — persis pola yang sudah dipakai `rsi.ts`.
2. Ganti ketiga implementasi (`volatility-analyzer.ts`, `breakout.service.ts`, `tpcl-validation.service.ts:wilderAtrAt`) untuk memanggilnya.
3. Samakan jendela struktur: produksi harus memotong histori ke `STRUCTURE_LOOKBACK` bar sebelum memanggil `buildLongTradingSetup`, atau Lab harus memakai jendela penuh. Jendelanya jadikan parameter eksplisit dari `TradingSetupParameters`, bukan konstanta lokal di dua file.
4. Tambahkan golden test: satu deret OHLC tetap, `expect(calculateWilderAtr(bars)).toBeCloseTo(<nilai referensi>, 4)`.
5. **Bekukan ulang** `TPCL_OOS_FREEZE_DATE` setelah perbaikan. Setup berubah = parameter produksi berubah = forward-OOS lama tidak berlaku. `parameterFingerprint` saat ini hanya mem-hash 6 parameter numerik, **tidak** mem-hash formula ATR maupun panjang lookback — jadi perubahan ini tidak akan terdeteksi olehnya. Fingerprint harus diperluas.

**Prioritas: CRITICAL.**

---

### C-2 — Skor historis dihitung dengan model yang berbeda dari skor produksi

```text
FINDING: konteks sektor dikosongkan di backfill, diisi di produksi
Lokasi:
  backfill  scripts/backfill-lens-history.mjs:446
  produksi  app/api/stock/[ticker]/route.ts:482-489
Function  : buildHistoricalLensRows() vs handler GET /api/stock/[ticker]
```

**Implementasi saat ini**
```js
// backfill-lens-history.mjs:446
sector: { yahooSector: null, yahooIndustry: null, payoutRatio: null, beta: null },
```
```ts
// app/api/stock/[ticker]/route.ts:482
sector: {
  yahooSector:   quoteSummary?.assetProfile?.sector   ?? null,
  yahooIndustry: quoteSummary?.assetProfile?.industry ?? null,
  payoutRatio:   quoteSummary?.summaryDetail?.payoutRatio ?? null,
  beta: null,
},
```

**Masalah.** `resolveSectorProfile(null, null)` mengembalikan profil `UNCLASSIFIED`. Konsekuensinya di seluruh histori:
* **Bank & multifinance** mendapat `derApplicable: true` dan `currentRatioApplicable: true` — jadi DER 6x mereka dinilai "berisiko tinggi" (0/5) di histori, padahal di produksi dinyatakan `NOT_APPLICABLE` dan bobotnya direnormalisasi. Universe 109 emiten memuat lebih dari 20 lembaga keuangan (BBCA, BMRI, BBRI, BBNI, BRIS, BDMN, BBTN, ARTO, BJTM, BNGA, BJBR, BTPS, BFIN, CFIN, CASA, BINA, BBYB, APIC, …).
* **Penjaga puncak siklus** (`isPeakCycleSignature`) memeriksa `profile.cyclical`, yang `false` untuk `UNCLASSIFIED`. Jadi **tidak pernah aktif di seluruh histori** — emiten batu bara/nikel ber-PER 4x dan ROE 35% mendapat nilai valuasi penuh di backtest, dan nilai yang dibatasi di produksi.
* `defaultBeta` selalu 1,0 (bukan 1,1 keuangan / 1,2 energi / 0,8 konsumen primer) → `costOfEquity` berbeda → `fairPer` dan `fairPbv` berbeda.
* `payoutRatio` selalu `null` → `sustainableGrowth` memakai asumsi retensi 60% di histori, retensi nyata di produksi.
* Batas DER per sektor (properti 0,8/1,8/3,0 vs default 0,5/1,2/2,2) tidak pernah dipakai di histori.

**Bukti empiris.** `calculateScore()` produksi dijalankan atas **110.592 kombinasi** fundamental (6 sektor × PER × PBV × ROE × DER × CR × growth × RSI × CMF), masing-masing dua kali — sekali dengan `sector` kosong (jalur backfill) dan sekali dengan `sector` terisi (jalur produksi):

```text
selisih LensScore maksimum backfill vs live : 10 poin
kombinasi yang PINDAH BUCKET                : 9.235 (8,4%)
contoh di sekitar ambang 80                 : Financial Services,
    PER 4 / PBV 0,6 / ROE 5 / DER 0,3 / growth −5  ->  backfill 80, live 73
```

Contoh terarah lainnya:

| Kasus | Backfill | Live | Δ | coverage bf | coverage live |
|---|---|---|---|---|---|
| Bank, DER 6,0x, ROE 20% | 81 | 84 | +3 | 95% | 100% |
| Batu bara puncak siklus (PER 4x, ROE 35%) | 93 | 87 | **−6** | 100% | 100% |
| Konsumen primer (PER 28x, ROE 30%) | 82 | 84 | +2 | 100% | 100% |

**Mengapa salah secara metodologis.** Batas bucket (80 / 70 / 60) dan ambang sinyal TP/CL Lab (`SIGNAL_SCORE_THRESHOLD = 80`) berada persis di daerah tempat pergeseran ini terjadi. 8,4% keanggotaan bucket yang berbeda berarti populasi trade yang diuji Calibration Lab, Bucket Backtest, TP/CL Lab, dan Transparency **bukan** populasi yang akan dihasilkan produksi. Kalibrasi model A yang digunakan untuk membenarkan model B bukan validasi.

**Risiko terhadap pengguna.** Halaman Transparency publik menampilkan avg return dan win rate per bucket LensScore. Pengguna membacanya sebagai "kalau saya beli saham skor 80+, historisnya begini" — padahal saham berskor 80+ menurut aplikasi hari ini tidak sama dengan saham berskor 80+ di tabel itu.

**Perbaikan yang direkomendasikan.**
1. Arsipkan `assetProfile.sector` / `industry` / `summaryDetail.payoutRatio` per ticker ke tabel PIT sendiri (sektor jarang berubah; satu baris per ticker per perubahan sudah cukup dan itu memang data point-in-time yang sah).
2. `buildHistoricalLensRows()` mengisi `sector` dari arsip itu.
3. Tambahkan **invariant test yang gagal kalau divergen**: bangun payload identik, jalankan lewat jalur backfill dan jalur produksi, `expect(bf.total_score).toBe(live.total_score)`. Ini kelas bug yang hanya bisa dicegah oleh test yang membandingkan dua jalur, bukan test per fungsi.
4. Sampai (1)-(3) selesai, naikkan `SCORE_VERSION` dan **buang** histori lama dari populasi validasi — jangan campur.

**Prioritas: CRITICAL.**

---

### C-3 — Look-ahead di pemilihan bar entry

Sudah diuraikan penuh di bagian 12 dengan bukti runnable. **Prioritas: CRITICAL.**

---

### C-4 — Calibration Lab tidak melakukan kalibrasi

```text
FINDING: modul bernama "Calibration Lab" hanya mengukur discrimination
Lokasi   : modules/lens-radar/service/calibration.service.ts (864 baris)
           app/admin/calibration/CalibrationClient.tsx (841 baris)
```

**Yang ADA:** rata-rata return T+20 per bucket, Welch one-tailed t-test 80-100 vs <60, block bootstrap CI 95% atas spread, within-week label permutation test, Spearman rank IC (total + bulanan + ICIR), monotonisitas bucket, simulasi ambang 60–90, dekorelasi per ticker per 20 hari bursa, `datasetHash` deterministik.

**Yang TIDAK ADA** (pencarian `brier|expected calibration|reliabilit|logLoss|calibrationCurve|isotonic|platt` di seluruh basis kode → **nol hasil**):
* calibration curve / reliability diagram
* calibration bins dengan observed vs predicted
* Brier Score
* Log loss
* Expected Calibration Error
* pemetaan skor → probabilitas terkalibrasi (isotonic / Platt)
* confidence interval per bucket (CI hanya ada untuk *spread*, bukan untuk tingkat keberhasilan per bucket)

**Masalah.** Doc §30 secara eksplisit meminta pembedaan DISCRIMINATION vs CALIBRATION, dengan contoh: "AUC tinggi tidak berarti probability 80% benar-benar mempunyai success rate 80%". SahamLens saat ini mengukur **hanya sisi kiri**. Nama modulnya menjanjikan sisi kanan.

**Yang meredakan (kredit yang layak diberikan):** karena tidak ada kalibrasi, sistem juga **tidak pernah** mengklaim probabilitas. `resolveValidationStatus()` mengembalikan `NOT_ENOUGH_DATA` / `EXPLORATORY` / `OUT_OF_SAMPLE_PENDING`, `suppressUnvalidatedSignificance()` memaksa `significant: false` selama `PRODUCT_VALIDATION_STATUS === 'RESEARCH_ONLY'`, dan tidak ditemukan satu pun tempat yang menerjemahkan LensScore 76 menjadi "76% probabilitas untung". **Doc §36 terpenuhi** — bukan karena ada kalibrasi, melainkan karena klaim probabilitas tidak pernah dibuat.

**Perbaikan yang direkomendasikan.**
```text
1. Ganti nama modul menjadi "Discrimination Lab" ATAU tambahkan lapisan kalibrasi nyata.
2. Untuk kalibrasi nyata, definisikan outcome biner lebih dulu — dan definisikan
   sekali, tertulis, sebelum melihat data. Contoh: y = 1 jika return T+20 bersih > 0.
3. Bin skor (mis. 10 bin lebar 5 poin dari 55 ke 100). Per bin catat:
   n, predicted (rata-rata skor/100 setelah dipetakan), observed (rata-rata y),
   Wilson score interval 95%.
4. ECE = Σ (n_bin/N) × |observed_bin − predicted_bin|
   Brier = (1/N) Σ (p_i − y_i)²,  bandingkan dengan Brier base rate sebagai referensi.
5. Reliability diagram: observed vs predicted + garis diagonal + pita CI.
6. Isotonic regression HANYA di train fold, dievaluasi di OOS fold. Jangan pernah
   di-fit pada seluruh data lalu dilaporkan sebagai bukti.
7. Semua di atas WAJIB fail-closed di bawah 30 sampel efektif per bin —
   MIN_EFFECTIVE_T_TEST_SAMPLES yang sudah ada bisa dipakai ulang.
```

**Prioritas: CRITICAL** (untuk klaim produk; teknis bisa dianggap HIGH karena sistem tidak sedang berbohong — ia hanya menamai sesuatu dengan nama yang salah).

---

### C-5 — Dua model nilai wajar yang saling bertentangan

```text
FINDING: rumus yang dinyatakan SALAH oleh satu file masih menghasilkan angka yang dilihat pengguna
Lokasi   : modules/fundamental/service/dcf-valuation.service.ts:21-43, 168-232
Kontras  : modules/fundamental/service/fair-multiples.service.ts:1-31 (mengutip rumus itu sebagai contoh kesalahan)
Konsumen : /api/intrinsic → components/IntrinsicValue.tsx, valuation_agent di orchestrator
```

**Masalah.** Untuk satu emiten yang sama, pengguna dapat melihat:
* komponen "Valuasi" di LensScore yang dihitung dengan `PBV* = (ROE−g)/(r−g)` dan `r` per emiten, dan
* kartu "Harga Wajar" yang dihitung dengan `pbvWajar = (ROE/12) × 0,85` dan `r = 12%` untuk semua emiten,

tanpa cara apa pun untuk tahu bahwa keduanya berasal dari model berbeda, dan bahwa yang kedua sudah dinyatakan salah di dalam basis kode ini sendiri. Untuk ROE 20%, g 5%, r 12%: 1,42x vs 2,14x — selisih 50% pada angka yang langsung menentukan label UNDERVALUED/OVERVALUED.

Tambahan: `SECTOR_RULES` (`dcf-valuation.service.ts:45-58`) memberi bobot pbv/ddm/per/dcf/graham per sektor (mis. bank 0,45/0,30/0,25/0/0) **tanpa satu baris pun justifikasi**. Ini kategori ARBITRARY menurut doc §21.

**Perbaikan yang direkomendasikan.** Hapus `calculateIntrinsicValue()` dan alihkan `/api/intrinsic` serta `valuation_agent` ke `impliedMultiples()` dari `fair-multiples.service.ts`, dengan tetap menampilkan `betaSource`, `fairPerBasis`, dan `costOfEquityPct` ke UI. Pertahankan `calculateDcfModel()` (halaman `/dcf`) — model itu jauh lebih baik dan sudah dilabeli sebagai model dengan asumsi. Kalau `calculateIntrinsicValue()` harus dipertahankan sementara, beri label `DEPRECATED_MODEL_V1` di keluarannya dan tampilkan di UI.

**Prioritas: CRITICAL.**

---

## 16. TEMUAN HIGH

**H-1 — Populasi backtest tidak memakai gerbang coverage yang dipakai produksi.**
`bucket-backtest.service.ts:509` dan `calibration.service.ts:436` menyeleksi `SELECT ... FROM lens_radar_history` **tanpa** `coverage_pct`. Produksi menolak memberi rekomendasi di bawah `MIN_COVERAGE_PCT = 55` (`getKategori` → `'DATA TIDAK CUKUP'`, dan `evaluateMinimalEligibility` → `INSUFFICIENT_DATA`, blocking). Backtest memasukkan semua. Karena `fundamental_history` baru terisi sejak cron harian mulai berjalan, sebagian besar tanggal historis lama tidak punya fundamental sama sekali — skornya praktis technical+flow yang direnormalisasi ke 0-100, lalu dibucket bersama skor yang punya fundamental lengkap. **Perbaikan:** tambahkan `coverage_pct` ke SELECT dan `AND coverage_pct >= 55` ke filter normalisasi, laporkan `skippedLowCoverageRows` di UI seperti `skippedIlliquidRows`. Selain itu terapkan `evaluateMinimalEligibility` (MIN_BARS 200, zero-volume, stale) ke populasi backtest.

**H-2 — Universe backtest mengandung look-ahead selection bias.**
`modules/backtest/constants/backtest-universe.ts` — 109 emiten dipilih oleh `scripts/backtest-universe-refresh.mjs` yang dijalankan **2026-08-03** dengan tiga filter: harga rata-rata 3 bulan ≥ Rp 200, nilai transaksi 3 bulan ≥ Rp 1 M/hari, **volatilitas 12 bulan ≤ 120%/tahun**. Daftar itu lalu dipakai untuk backfill histori 1–2 tahun ke belakang. Emiten yang likuid pada 2025 tetapi tidak lagi hari ini tidak pernah masuk; emiten yang volatilitas 12 bulannya melewati batas dibuang **berdasarkan data yang mencakup periode uji itu sendiri**. Komentar file itu bahkan mendokumentasikan bahwa cap volatilitas dipasang setelah melihat bahwa satu saham (BUVA +910%) mendominasi hasil — itu definisi data snooping, meskipun arah koreksinya membuat hasil lebih rendah. `BACKTEST_LIMITATIONS` menyatakan survivorship bias di halaman simulator, tetapi **Calibration Lab dan halaman Transparency publik tidak menyatakannya sama sekali**. **Perbaikan:** bangun universe *point-in-time* (keanggotaan per tanggal, dievaluasi dengan data sampai tanggal itu saja) atau, minimal, tampilkan disclaimer bias yang sama di Transparency dan Calibration Lab.

**H-3 — Weight optimizer mengevaluasi rumus yang bukan LensScore.**
`lens-score-optimizer.service.ts:130-140` merekonstruksi skor sebagai `(t/40 + f/30 + fl/30)` berbobot, sedangkan `calculateScore()` menormalkan atas `availableMaxTotal` (bobot yang **punya data**). Kedua rumus identik hanya saat coverage 100%. Untuk baris dengan fundamental hilang — mayoritas histori lama, lihat H-1 — rekonstruksi optimizer meremehkan kualitas komponen yang datanya lengkap. Proposal bobot karena itu dipilih atas model yang salah spesifikasi. **Perbaikan:** arsipkan `available_max_total` (atau `technical_available_max`, dst.) ke `lens_radar_history` dan pakai sebagai penyebut, atau hitung ulang skor kandidat lewat `calculateScore()` yang sesungguhnya.

**H-4 — "DCF (FCF)" bukan DCF.**
`dcf-valuation.service.ts:236` — `fcf_per_share × 1,05 / (0,12 − 0,05)` adalah perpetuitas Gordon satu tahap, yaitu **pengali tetap 15x FCF untuk setiap emiten non-bank**. Dilabeli "DCF (FCF)" dan diberi bobot 25-40% di `SECTOR_RULES`. Tidak ada proyeksi, tidak ada WACC, tidak ada CAPEX/ΔNWC. **Perbaikan:** ganti nama menjadi "FCF Perpetuity (1-stage)" atau arahkan ke `calculateDcfModel()` yang memang melakukan proyeksi 5 tahun.

**H-5 — Metrik backtest wajib doc §18 tidak ada.**
Pencarian `sharpe|sortino|cagr` di seluruh kode → hanya muncul di `modules/ai/knowledge/sahamlens-knowledge.ts` (teks prompt AI), **tidak di satu pun jalur perhitungan**. `simulate.service.ts` melaporkan returnPct, ihsgReturnPct, alpha, winRate, maxDrawdown, totalTrades. Yang tidak ada: CAGR, annualized return, volatilitas, Sharpe, Sortino, Profit Factor, Expectancy, Turnover di simulator (Profit Factor & Expectancy ada di Calibration Lab dan TP/CL Lab, tetapi tidak di simulator). **Perbaikan:** hitung dari `equityCurveDaily` yang sudah tersedia — Sharpe dan Sortino tinggal beberapa baris; turnover dari `trades.length`.

**H-6 — Cakupan fundamental PIT historis kemungkinan besar sangat tipis (UNVERIFIED).**
`fundamental_history` diisi oleh dua jalur: cron harian `archiveFundamentalSnapshot` (mulai berjalan sejak cron dipasang) dan import CSV admin manual. Tidak ada jalur yang mengambil laporan keuangan historis IDX secara sistematis. Artinya `fundamentalAsOf(fundamentals, bar.date)` akan mengembalikan `null` untuk hampir semua tanggal sebelum cron mulai — dan seluruh kelompok Fundamental (30 bobot) hilang dari skor historis. Ini **tidak bisa diverifikasi tanpa akses database**, jadi ditandai UNVERIFIED, tetapi mekanismenya jelas dari kode. **Perbaikan:** tampilkan `fundamentalCoverageByDate` di Calibration Lab (baris dengan fundamental non-null per tanggal). Kalau angkanya rendah, seluruh perbandingan bucket harus dinyatakan sebagai skor teknikal+flow, bukan LensScore.

**H-7 — TP/CL Lab tidak melaporkan seberapa besar hasilnya bergantung pada asumsi ambiguitas intraday.**
`tpcl-validation.service.ts:409-419` memilih SL lebih dulu saat satu bar menyentuh TP dan SL sekaligus, dan ini didokumentasikan di `guardrails`. Itu benar dan konservatif sesuai doc §33. Tetapi **jumlah bar ambigu tidak pernah dihitung atau ditampilkan**. Tanpa angka itu, tidak ada yang tahu apakah 2% atau 40% hasilnya ditentukan oleh tie-break. **Perbaikan:** tambahkan `ambiguousBarCount` dan `ambiguousOutcomeSharePct` ke `TpclMetrics`, plus jalankan skenario tandingan (TP lebih dulu) sebagai batas atas — selisih keduanya adalah rentang ketidakpastian sejati dari lab ini.

---

## 17. TEMUAN MEDIUM

**M-1 — Fabrikasi nilai 50 di klasifikasi market regime.** `market-regime.service.ts:209-212`, `indicatorMap.trend ?? 50` (juga breadth, volatility, participation). Nilai 50 lalu diuji terhadap ambang (`breadth < 50`, `trend >= 65`, `participation >= 55`) seolah hasil pengukuran. Indikator yang hilang harus membuat cabang yang bergantung padanya tidak dievaluasi, bukan diberi nilai tengah.

**M-2 — Magic number di bandar agent.** `orchestrator.service.ts:135-138`: skor 82 / 68 / 32 / 18 tergantung streak ≥ 4 hari. Tidak ada justifikasi. Kategori: ARBITRARY.

**M-3 — `SECTOR_RULES` bobot valuasi tanpa dasar.** Lihat C-5.

**M-4 — Ambang statistik tidak konsisten antar modul.** `MIN_EFFECTIVE_T_TEST_SAMPLES = 30` (calibration), `LENS_RADAR_OOS_MIN_EFFECTIVE_PER_EDGE_BUCKET = 30` (walk-forward), `MIN_METRIC_SAMPLES = 30` (TP/CL) — tapi `MIN_OOS_BUCKET_SAMPLE = 10` dan `OOS_MAX_P_VALUE = 0,10` di optimizer bobot. Optimizer juga memilih pemenang dari ~45 kandidat bobot lalu menguji satu kali di OOS dengan α = 0,10 **tanpa koreksi pengujian berganda**. Desainnya sudah jauh lebih baik daripada "coba 500 kombinasi lalu ambil yang paling untung" (doc §35), tetapi optimisme seleksi belum nol. **Perbaikan:** samakan minimum ke 30, turunkan α ke 0,05, dan laporkan jumlah kandidat yang diuji di samping p-value.

**M-5 — Gate robustness TP/CL memakai ambang tanpa dasar.** `deriveRobustnessStatus` menyatakan UNSTABLE kalau `spread > 2` poin persen expectancy; `oosStatus` menyatakan POSITIVE kalau `expectancy > 0 && profitFactor > 1` — tanpa confidence interval. Dengan n = 30, `PF = 1,05` tidak dapat dibedakan dari kebetulan. **Perbaikan:** ganti dengan bootstrap CI atas expectancy; POSITIVE hanya kalau batas bawah CI 95% > 0.

**M-6 — `changePct` di backfill memakai basis harga yang berbeda dari skor.** `backfill-lens-history.mjs:381-382` menghitung perubahan harian dari `Close` **raw**, sementara seluruh skor memakai adjusted. Pada hari ex-dividend, `changePct` menunjukkan penurunan palsu, dan `scoreVolume()` membaca volume tinggi + harga turun sebagai "distribusi" (0 dari 10 poin) untuk hari yang sebenarnya netral.

**M-7 — Basis 'RAW' bukan harga transaksi sesungguhnya.** Yahoo chart API mengembalikan `quote.close` yang **sudah** disesuaikan split secara retroaktif. `TRADING_PRICE_BASIS = 'RAW'` karena itu berarti "split-adjusted, belum dividend-adjusted", bukan harga yang benar-benar diperdagangkan. Konsekuensi konkret: `idxTick(price)` dan filter gocap `MIN_TRADABLE_PRICE_IDR = 50` diterapkan pada harga yang sudah disesuaikan mundur — untuk emiten yang pernah split, pita fraksi harga historisnya salah. Bukan bug besar hari ini, tetapi labelnya menyesatkan.

**M-8 — `market_cap` selalu null.** Lihat bagian 3.

**M-9 — Frekuensi transaksi broker dibuang; broker data tidak masuk skor.** Lihat bagian 7.

**M-10 — Tidak ada golden test dengan nilai referensi.** 92 file test menguji invariant (RSI dalam 0-100, warm-up menghasilkan null, panjang array cocok, konsensus tidak berubah karena jumlah analyzer). **Tidak satu pun** menguji `expect(calculateRsi(deret_tetap)).toBeCloseTo(nilai_referensi)`. Tidak ada test sama sekali untuk `impliedMultiples`, `calculateIntrinsicValue`, atau `calculateDcfModel` (pencarian "fair value" → 0 file test). Artinya doc §45 (**NOT IMPLEMENTED**) dan §46 (**NOT IMPLEMENTED** di CI — audit ini melakukannya secara manual dan menemukan C-1 tepat karena itu). **Perbaikan:** satu file `modules/technical/service/__tests__/golden-indicators.test.ts` dengan deret OHLC tetap dan nilai referensi untuk SMA, EMA, RSI, ATR(Wilder), MACD; satu file serupa untuk ROE/PER/PBV/DER/fairPbv/fairPer/RR/TP/CL.

**M-11 — Equity curve Transparency melangkah per-indeks, bukan per hari bursa.** `transparency.service.ts:303`: `for (let i = 0; i < signalDates.length; i += LENS_RADAR_HOLDING_DAYS)` — ini melangkah 20 **tanggal sinyal**, yang hanya sama dengan 20 hari bursa kalau ada sinyal setiap hari. Selain itu biaya round-trip 0,5% juga dikurangkan dari return benchmark IHSG (`:319`), padahal benchmark bukan trade.

**M-12 — `clusterLevels` dapat menggabungkan level berantai.** `swing-levels.ts:88-104` membandingkan setiap harga hanya dengan level terakhir, dan level itu bergeser ke rata-rata berbobot setiap kali menyerap sentuhan. Deret harga yang masing-masing berjarak < 1,5% dari tetangganya dapat menyatu menjadi satu level yang rentang totalnya jauh melebihi 1,5%.

**M-13 — Filter aksi korporasi menyeleksi berdasarkan likuiditas.** Lihat bagian 12.

**M-14 — Kalender bursa dibangun dari data, bukan dari kalender IDX.** Lihat bagian 12.

---

## 18. TEMUAN LOW

* **L-1** — `orchestrator.service.ts` menampilkan `score: 50` untuk agen `available: false` di `agent_breakdown`. Tidak masuk skor akhir (sudah diverifikasi), tapi terlihat di UI sebagai angka.
* **L-2** — Dua konvensi persentil untuk satu konsep drawdown. Lihat bagian 10.
* **L-3** — `corporateActionStatusFor()` memanggil `normalized.findIndex()` di dalam loop per bar → O(n²) per ticker. Hanya kinerja.
* **L-4** — `chooseBestThreshold()` (`calibration.service.ts:704`) memakai fungsi objektif `winRate + 1,5 × avgReturn + 8 × log(n/n₈₀)` — tiga konstanta tanpa dasar. Untungnya seluruh jalur ini mati karena `THRESHOLD_RECOMMENDER_ENABLED = false`. Kalau nanti dihidupkan, ini harus diganti lebih dulu.
* **L-5** — `RiskRewardCalculator`/UI menampilkan `cl2` yang dideprecate sebagai "emergency risk level" — dokumentasi tipe sudah menyatakan ini bukan CL kedua, tapi namanya masih membingungkan.

---

## 19. HASIL AUDIT KHUSUS VALIDATION ENGINE

| # | Modul | Status | Bukti |
|---|---|---|---|
| 1 | **Fundamental Backfill** | **PARTIAL** | Skema PIT benar & diuji (`period_end` vs `observed_date`, append-only, idempoten, `asOf()` fail-closed). Tetapi cakupan historisnya bergantung pada cron yang baru berjalan, tidak ada sumber laporan keuangan historis IDX, dan hanya 6 metrik yang diarsipkan. H-6 UNVERIFIED tanpa akses DB. |
| 2 | **Technical Backfill** | **PARTIAL** | Point-in-time benar (`historyToDate <= bar.date`), warm-up fail-closed, basis harga tegas. **Gagal** karena konteks sektor dikosongkan (C-2) sehingga skor yang dihasilkan bukan skor produksi. |
| 3 | **Point-in-Time Integrity** | **FAIL** | Arsitekturnya benar, tetapi C-3 membuktikan bar entry dapat jatuh pada atau sebelum tanggal sinyal. Satu jalur kebocoran cukup untuk menggagalkan klaim PIT. |
| 4 | **Historical Scoring** | **FAIL** | C-2: 8,4% kombinasi berpindah bucket vs jalur produksi, delta maks 10 poin. |
| 5 | **Backtest Engine** | **PARTIAL** | Biaya + slippage benar, eksekusi di open D+1 benar, gerbang likuiditas benar, dekorelasi benar. Gagal pada survivorship/selection bias universe (H-2), coverage tidak difilter (H-1), dan C-3. |
| 6 | **Signal Maturity** | **PASS** | `exitDateT20 <= asOfDate` sebagai syarat matang, status `WAITING_FOR_MATURITY` eksplisit, split TRAIN/VAL/HOLDOUT dihitung hanya dari sinyal yang sudah matang supaya HOLDOUT tidak tampak kosong karena masa depan belum ada, offset dihitung dalam **hari bursa** lewat kalender. Satu catatan: kalendernya dari data, bukan dari IDX (M-14), dan toleransi ±2 membuat "T+20" sebenarnya 18–22 hari bursa. |
| 7 | **Calibration Lab** | **FAIL (sebagai kalibrasi)** / **PASS (sebagai discrimination)** | C-4: nol kemunculan Brier/ECE/reliability/log loss/isotonic/Platt di seluruh basis kode. |
| 8 | **TP/CL Lab** | **FAIL** | C-1: memvalidasi setup dengan ATR Wilder dan lookback 60 bar, sementara produksi mengirim setup dengan ATR rata-rata sederhana dan lookback penuh. Metodologi labnya sendiri (first-touch, gap open, konservatif SL-first, funnel eligibility, forward-OOS beku) **baik** — objek yang divalidasinya yang salah. |
| 9 | **MAE / MFE** | **PASS** | Dicatat per trade dari low/high harian sepanjang trade berjalan, di-clamp agar drawdown tidak positif, `p95Mae` dan `worstMae` dipisah. Dipakai untuk mengevaluasi apakah TP terlalu jauh / CL terlalu dekat. Persis yang diminta doc §34. |
| 10 | **Transaction Costs** | **PASS** | `LENS_BUCKET_ROUND_TRIP_COST_PCT = 0,5%` (fee 0,4 + slippage 0,1) dikurangkan dari setiap return, dan `avgT20Gross` dilaporkan berdampingan supaya efeknya terlihat. Simulator memakai rincian lebih halus (slippage 0,2 + fee beli 0,15 + fee jual 0,25 termasuk levy). **Catatan:** dua angka biaya yang berbeda untuk satu aplikasi — 0,5% vs 0,6% — sebaiknya disatukan atau perbedaannya dijelaskan. |
| 11 | **Walk-Forward Validation** | **PARTIAL** | `buildRetrospectiveWalkForward` **secara eksplisit menolak menyebut dirinya OOS** (`genuineOos: false`, dengan alasan tertulis bahwa model dikembangkan dengan akses ke periode itu). `buildGenuineOosValidation` membekukan tanggal, melarang backfill, dan menggabungkan 5 gate (spread, bootstrap, permutation, IC, monotonisitas). **Ini desain terbaik di seluruh basis kode.** Status PARTIAL hanya karena belum ada data matang setelah freeze, dan karena C-1/C-2 berarti freeze harus diulang setelah perbaikan. |
| 12 | **Model Versioning** | **PARTIAL** | `SCORE_VERSION`/`VALUATION_VERSION`/`SIGNAL_VERSION`/`DATA_SNAPSHOT_VERSION` ada, `partitionByScoreVersion` menolak baris versi lain dan melaporkan `versionMixed`, cache key mengikuti versi. **Gagal** karena `parameterFingerprint` TP/CL hanya mem-hash 6 parameter numerik — perubahan formula ATR atau panjang lookback tidak terdeteksi, sehingga hasil OOS dua formula berbeda bisa tercampur di bawah fingerprint yang sama. |
| 13 | **Reproducibility** | **PARTIAL** | PRNG deterministik ber-seed dari `datasetHash`, `audit.version` + jumlah observasi + tanggal pertama/terakhir diekspos, backfill idempoten. **Gagal** pada reproduksi lintas-jalur: jalur backfill dan jalur produksi menghasilkan skor berbeda untuk input yang sama (C-2), dan tidak ada test yang menangkapnya. |
| 14 | **Validation Readiness** | **NOT READY** | Lihat bagian 23. |

---

## 20. ARSITEKTUR FORMULA YANG DIREKOMENDASIKAN

```text
SATU implementasi per indikator, di satu file, dipakai semua pemanggil:
  modules/technical/service/rsi.ts        ← SUDAH ADA, contoh yang benar
  modules/technical/service/atr.ts        ← BUAT (Wilder), ganti 3 salinan
  modules/technical/service/ema.ts        ← BUAT, ganti 2 salinan di ema/macd-analyzer
  modules/technical/service/sma.ts        ← BUAT, ganti 4+ salinan

Aturan yang membuat divergensi tidak mungkin terjadi lagi:
  1. Analyzer TIDAK BOLEH menghitung indikator sendiri — hanya menafsirkan.
  2. Setiap indikator punya golden test dengan nilai referensi tetap.
  3. Setiap indikator punya cross-check test terhadap implementasi independen
     (tulis ulang dari rumus dengan bentuk berbeda, bukan salin kode).
  4. Backfill dan produksi memanggil FUNGSI YANG SAMA dengan input yang
     dibangun oleh BUILDER YANG SAMA — bukan dua tempat yang menyusun
     TechnicalInput/FundamentalInput/FlowInput secara terpisah.
```

Poin 4 adalah akar C-1 dan C-2 sekaligus. Selama `backfill-lens-history.mjs` dan `app/api/stock/[ticker]/route.ts` masing-masing menyusun payload `calculateScore` sendiri, divergensi berikutnya hanya soal waktu. Ekstrak satu `buildScoringInputs(bars, fundamentalRow, sectorRow, opts)` yang dipakai keduanya.

---

## 21. ARSITEKTUR SCORING YANG DIREKOMENDASIKAN

```text
REAL MARKET DATA
      ↓
DATA VALIDATION               ← sudah ada (normalizeYahooOhlcRows, price-basis)
      ↓
POINT-IN-TIME DATA LAYER      ← sudah ada untuk fundamental; TAMBAH sektor PIT + universe PIT
      ↓
buildScoringInputs()          ← BARU: satu builder untuk live & historis
      ↓
FINANCIAL / QUANT FORMULAS    ← satu implementasi per indikator (bagian 20)
      ↓
NORMALIZATION                 ← sudah ada (combine + renormalisasi), pertimbangkan
                                 percentile sektor untuk PER/PBV sebagai lapisan kedua
      ↓
MODULE SCORES + coverage      ← sudah ada
      ↓
RISK + DATA QUALITY FILTER    ← sudah ada (eligibility); TERAPKAN JUGA di backtest
      ↓
COMPOSITE LENSSCORE
      ↓
DECISION ENGINE
      ↓
DISCRIMINATION LAB  →  CALIBRATION LAYER  →  Calibrated Probability
                       (Brier/ECE/isotonic,   hanya kalau sampel cukup;
                        fit di train, uji      kalau tidak: probability = unavailable)
                        di OOS)
      ↓
LensAI (penjelas, bukan sumber angka)
```

---

## 22. ROADMAP IMPLEMENTASI

**Fase 1 — hentikan pendarahan (sebelum menampilkan angka validasi apa pun ke pengguna)**
1. Satukan ATR ke Wilder di satu file; samakan lookback struktur antara produksi dan Lab (C-1).
2. Arsipkan sektor/industri/payout PIT; isi `sector` di backfill (C-2).
3. Ganti `barAtTradingOffset` untuk entry dengan varian forward-only + penjaga `idx > fromIndex` (C-3).
4. Tambahkan invariant test backfill-vs-produksi yang gagal kalau skornya berbeda.
5. Naikkan `SCORE_VERSION`, perluas `parameterFingerprint` agar mencakup formula ATR + lookback, **bekukan ulang** kedua tanggal OOS, dan buang histori versi lama dari populasi validasi.

**Fase 2 — buat lapisan validasi mengukur populasi yang benar**
6. Filter `coverage_pct >= 55` + terapkan `evaluateMinimalEligibility` di backtest; laporkan penghitungnya (H-1).
7. Universe point-in-time, atau minimal disclaimer bias yang sama di Transparency & Calibration Lab (H-2).
8. Perbaiki penyebut optimizer bobot (H-3); samakan ambang statistik ke n ≥ 30, α = 0,05 (M-4).
9. Tampilkan `ambiguousOutcomeSharePct` + skenario tandingan TP-first di TP/CL Lab (H-7).
10. Pakai `idx-trading-calendar.ts` sebagai kalender bursa, bukan tanggal yang kebetulan ada di data (M-14).

**Fase 3 — kalibrasi sungguhan & metrik yang hilang**
11. Reliability diagram + Brier + ECE + Wilson CI per bin; isotonic fit di train, uji di OOS (C-4).
12. Sharpe / Sortino / CAGR / Profit Factor / Expectancy / turnover di simulator (H-5).
13. Golden tests + cross-check tests di CI (M-10).

**Fase 4 — kedalaman finansial**
14. Pensiunkan `calculateIntrinsicValue()`, alihkan ke `impliedMultiples()` (C-5).
15. Metrik bank (NIM, NPL, CASA, CAR, LDR, CoC, CIR, PPOP) — tanpa ini, penilaian bank tetap dangkal.
16. Normalized earnings untuk siklikal; ganti penjaga ambang tunggal PER<8 & ROE>25.
17. Frekuensi transaksi broker + rasio value/frequency; naikkan cakupan harian dari 5 ticker.

---

## 23. FINAL VALIDATION STATUS

```text
MODEL STATUS: NOT VALIDATED
```

Status ini **sama dengan yang dinyatakan sistem itu sendiri** (`PRODUCT_VALIDATION_STATUS = 'RESEARCH_ONLY'`, `THRESHOLD_RECOMMENDER_ENABLED = false`, `genuineOos: false`, `researchOnly: true`, `RESEARCH_ONLY_DISCLAIMER` yang ditampilkan ke publik). SahamLens **tidak sedang mengklaim lebih dari yang dimilikinya**, dan itu poin yang harus diakui secara eksplisit: aplikasi ini tidak berbohong tentang statusnya.

**Bukti yang mendukung status NOT VALIDATED**, dipetakan langsung ke daftar larangan doc §48:

| Syarat doc §48 | Terpenuhi? | Bukti |
|---|---|---|
| backtest sudah PIT-safe | **TIDAK** | C-3 — bar entry dapat jatuh pada/sebelum tanggal sinyal, dibuktikan runnable |
| calibration sample sudah cukup | **TIDAK RELEVAN** | C-4 — tidak ada kalibrasi sama sekali untuk dinilai kecukupan sampelnya |
| transaction cost sudah diperhitungkan | **YA** | 0,5% round-trip dikurangkan per return; gross dilaporkan berdampingan |
| historical data sudah lengkap | **TIDAK** | H-6 (fundamental PIT tipis, UNVERIFIED), H-2 (universe bias) |
| formula tidak dummy/hardcoded | **SEBAGIAN** | Jalur LensScore bersih dan terbukti. Tetapi M-1 (`?? 50` regime), C-5 (model valuasi kedua dengan konstanta yang dinyatakan salah), M-2/M-3 magic number |
| TP/CL tidak arbitrary | **YA secara desain** | ATR + struktur + RR minimum + validasi ulang setelah pembulatan tick — tetapi C-1 membuat yang divalidasi ≠ yang dikirim |
| technical/fundamental backfill terverifikasi | **TIDAK** | C-2 — 8,4% kombinasi berpindah bucket antara jalur backfill dan produksi |

**Jarak menuju "VALIDATED FOR RESEARCH":** Fase 1 + Fase 2 di bagian 22. Setelah itu, dengan freeze OOS diulang dan populasi validasi yang cocok dengan populasi produksi, klaim "valid untuk riset" menjadi dapat dipertanggungjawabkan.

**Jarak menuju "VALIDATED FOR PRODUCTION":** tambah Fase 3, lalu tunggu ≥ 90 hari kalender dan ≥ 30 sampel efektif per bucket edge **setelah tanggal freeze yang baru** — gate ini sudah terkodekan di `resolveValidationStatus()` dan `buildGenuineOosValidation()`, dan gate itu benar. Tidak ada jalan pintas; menunggu adalah bagian dari metodenya.

---

## 24. CATATAN PENUTUP UNTUK PEMILIK PRODUK

Tiga hal yang layak dinyatakan tanpa basa-basi:

**Yang sudah benar itu tidak umum.** Renormalisasi bobot saat data hilang, pemisahan `NA` vs `NOT_APPLICABLE`, penolakan mencampur basis harga adjusted/raw, protokol OOS yang dibekukan forward-only dan menolak backfill, dekorelasi sampel tumpang tindih, dan penolakan eksplisit untuk menyebut fold retrospektif sebagai "out-of-sample" — ini bukan hal yang dilakukan aplikasi saham ritel. Beberapa di antaranya bahkan tidak dilakukan oleh produk institusional.

**Yang salah bukan kesalahan pemahaman, melainkan kesalahan pemeliharaan.** Basis kode ini sudah mengetahui bahwa rata-rata sederhana bukan Wilder (dijelaskan panjang lebar untuk RSI) — koreksinya tidak sampai ke ATR. Basis kode ini sudah mengetahui bahwa `(roe/12)*0.85` salah (dikutip sebagai contoh kesalahan) — file yang memakainya tidak ikut diperbaiki. Basis kode ini sudah tahu bahwa bobot yang hidup di dua tempat akan diam-diam berbeda (komentar panjang di `lens-score-weights.ts`) — pelajaran itu tidak diterapkan ke `TechnicalInput`/`FundamentalInput` yang disusun di dua tempat. Polanya konsisten: **perbaikan diterapkan di titik temuan, bukan di seluruh kelas masalah yang sama.**

**Satu test akan mencegah sebagian besar dari ini.** Bangun input yang sama, jalankan lewat jalur backfill dan jalur produksi, bandingkan skor. Kalau test itu ada enam bulan lalu, C-1 dan C-2 tidak akan pernah sampai ke produksi. Itu satu-satunya rekomendasi di dokumen ini yang biayanya beberapa jam dan hasilnya permanen.

---

*Audit ini dilakukan dengan membaca kode, menjalankan test suite yang ada, menjalankan mesin skor produksi terhadap 110.592 kombinasi input, dan melakukan cross-check indikator terhadap implementasi independen atas data pasar nyata. Setiap temuan yang dilabeli PASS/FAIL di bagian 19 memiliki bukti yang ditunjukkan di dokumen ini. Temuan yang tidak dapat diverifikasi tanpa akses database dilabeli UNVERIFIED, bukan diberi status.*
