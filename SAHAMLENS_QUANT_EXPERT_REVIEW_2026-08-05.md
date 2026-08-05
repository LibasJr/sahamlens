# SAHAMLENS QUANTITATIVE & CAPITAL MARKET EXPERT REVIEW

**Tanggal:** 2026-08-05
**Cakupan:** seluruh formula, indikator, scoring, rating, dan algoritma pengambilan keputusan di repo `c:\xampp\htdocs\trading`
**Status:** REVIEW SAJA — tidak ada satu baris source code pun diubah.

---

## 1. Executive Summary

SahamLens sudah melewati dua gelombang audit (integritas data 2026-08-03, logika & algoritma 2026-08-05) dan hasilnya nyata: `Math.random()`/`seedRandom()` sudah hilang dari jalur data, RSI sudah Wilder baku, look-ahead di backtest sudah diperbaiki (eksekusi di open D+1 + fee/slippage), fallback angka tebakan sudah banyak diganti `null`, dan asumsi valuasi sudah dikumpulkan & dilabeli.

**Tapi review ini menemukan bahwa perbaikan-perbaikan itu bersifat higienis, bukan metodologis.** Kebersihan data sudah baik; *desain modelnya* belum layak jadi dasar BUY/HOLD/SELL. Tiga alasan pokok:

1. **Ada 5 mesin keputusan paralel yang tidak sepakat satu sama lain**, masing-masing dengan bobot & ambang sendiri, semuanya dipanggil "rekomendasi SahamLens".
2. **Hampir seluruh angka ambang adalah magic number** — bukan hasil estimasi, bukan hasil kalibrasi, tidak sektor-aware, dan tidak pernah diuji.
3. **LensScore tidak pernah di-backtest sama sekali.** Fitur Backtest yang ada menguji *kombinasi filter indikator*, bukan skor. Jadi klaim "skor 82 = bagus" saat ini tidak punya satu pun bukti empiris.

Selain itu ditemukan **4 cacat P0 yang masih hidup di kode hari ini** (bukan temuan lama yang sudah ditutup) — di antaranya AI Pick bisa menayangkan saham yang sistemnya sendiri sudah menyatakan `DATA TIDAK CUKUP`, dan `coverage_pct` melaporkan kelengkapan data terlalu tinggi untuk komponen yang datanya cuma separuh.

Jawaban singkat atas pertanyaan penutup ada di bagian akhir dokumen: **BELUM LAYAK.**

---

## 2. Current SahamLens Algorithm Architecture

### 2.1 Peta mesin keputusan (yang sebenarnya ada di kode)

| # | Mesin | File | Output | Ambang | Dipakai halaman |
|---|-------|------|--------|--------|-----------------|
| 1 | `calculateScore()` | `modules/technical/service/scoring.service.ts` | 0-100 + kategori | 75/60/45 | Detail Saham, Rekomendasi, Screener (kolom Signal), AI Pick, Council |
| 2 | `calculateConsensus()` | `modules/technical/service/consensus.service.ts` | vote-based kategori | 80%/60% | Detail Saham, Rekomendasi |
| 3 | `scoreStock()` | `modules/market/service/screener.service.ts:332` | 0-100 (ranking) | tidak ada | Screener ranking |
| 4 | `runMultiAgentOrchestrator()` | `modules/ai/service/orchestrator.service.ts` | 0-100 dari 9 agen | 65/55/45/35 | /multi-agent |
| 5 | `analyzeSymbolForBreakout()` | `modules/recommendation/service/breakout.service.ts` | skor 0-8 poin | `> 0` | Breakout Radar, AI Pick tag |
| + | `calculateIntrinsicValue()` / `calculateDcfModel()` | `modules/fundamental/service/dcf-valuation.service.ts` | fair value + MoS | — | Fundamental, DCF, Valuation Agent |

Kelima mesin ini **menilai saham yang sama, di hari yang sama, dengan data yang sama, lalu menghasilkan kategori yang bisa berbeda**. Dokumentasi di `decision-thresholds.ts:4-16` menyatakan perbedaan ambang 75/60/45 vs 65/55/45/35 itu "disengaja karena mengukur dua skor komposit berbeda". Secara teknis benar, tetapi dari sudut pandang pengguna itu tetap satu produk yang mengatakan "BUY" di satu halaman dan "HOLD" di halaman lain untuk emiten yang sama.

### 2.2 Pipeline mesin utama — `calculateScore()`

```
INPUT
  Teknikal : currentPrice, ma20, ma50, ma200, rsi, macdHist/Line/Signal, volToday, volAvg20
  Fundamental: per, pbv, roe, der, currentRatio, revenueGrowth
  Flow     : cmf20, accumulationStatus, consecutiveBuy/SellDays, volRatio
      |
DATA SOURCE
  Yahoo Finance chart API (OHLCV harian, AdjClose) + quoteSummary
  (defaultKeyStatistics / financialData / summaryDetail / assetProfile / price)
      |
NORMALIZATION
  TIDAK ADA normalisasi statistik. Setiap metrik dipetakan lewat if/else berjenjang
  ke poin absolut (mis. ROE > 20 -> 5 poin; 15-20 -> 4; 8-15 -> 2; < 8 -> 0).
      |
WEIGHT (poin absolut, bukan bobot relatif)
  TEKNIKAL 40 : ma_trend 15 | rsi 8 | macd 7 | volume 10
  FUNDAMENTAL 30 : valuasi 10 (per 5 + pbv 5) | profitabilitas 10 (roe 5 + revGrowth 5)
                   | kesehatan 10 (der 5 + currentRatio 5)
  FLOW 30 : flow_tekanan 20 (CMF20) | flow_persistensi 10 (streak)
      |
CONDITION
  Komponen tanpa data -> available:false, dikeluarkan dari pembilang DAN penyebut
      |
SCORE per kelompok -> combine() -> renormalisasi ke bobot yang datanya ada
      |
FINAL SCORE = (technical + fundamental + flow) / availableMaxTotal * 100
      |
RECOMMENDATION
  coverage_pct < 55            -> 'DATA TIDAK CUKUP'
  total_score  > 75            -> 'STRONG BUY'
  total_score >= 60            -> 'BUY'
  total_score >= 45            -> 'HOLD'
  selain itu                   -> 'SELL'
```

### 2.3 Pipeline `calculateConsensus()`

10 analyzer (Detail Saham: **12**, karena LensFlow + Bandarmology ikut di-push) → tiap analyzer 1 vote setara BULLISH/BEARISH/NEUTRAL → `bull_pct = bull/total` → ≥80% STRONG BUY, ≥60% BUY, dst.

### 2.4 Pipeline orchestrator (/multi-agent)

| Agen | Bobot | Isi |
|------|-------|-----|
| technical_agent | 15% | rata-rata EMA + MACD + MA Trend + SMA Score |
| fundamental_agent | 15% | rata-rata PE + PBV + ROE + ROA + DER + Current Ratio |
| valuation_agent | **20%** | `clamp(50 + MoS_DCF, 0, 100)` |
| momentum_agent | 10% | rata-rata RSI + Momentum 1D/5D |
| flow_agent | 10% | rata-rata Volume + Market Flow Index |
| pattern_agent | 10% | Support/Resistance 20D |
| bandar_agent | 10% | akumulasi/distribusi CMF 4-lapis |
| risk_agent | 0% | ATR (sengaja dinolkan) |
| news_agent | 0% | jujur "belum tersedia" |

Konversi vote→skor: `scoreFromDecision(d, conf) = 50 ± conf/2`.

### 2.5 Pipeline valuasi

`calculateIntrinsicValue()`: 5 metode (Graham, PBV Fair, DDM, PER Fair, DCF 1-tahap) → dibobot per sektor lewat `SECTOR_RULES` → `fair_value` → `mos = (fair − price)/fair`.

`calculateDcfModel()`: DCF 5 tahun + terminal, WACC = 6.7% + 5.2% = 11.9% (asumsi statis), growth = ROE × retention di-clamp 2–12%.

---

## 3. Problems Found

Diurutkan menurut dampak terhadap keputusan investasi pengguna.

### P0-1 — AI Pick menayangkan saham yang sistemnya sendiri nyatakan `DATA TIDAK CUKUP`

`rankAiPicks()` (`modules/recommendation/service/ai-pick.service.ts:167-168`) hanya menyaring:

```ts
.filter((i) => i.finalScore >= MIN_SCORE)   // MIN_SCORE = 60
```

`coverage` ikut dibawa sampai ke item (baris 150) tapi **tidak pernah dipakai sebagai filter**. Padahal `getKategori()` (`scoring.service.ts:331-337`) menetapkan bahwa `coverage_pct < 55` ⇒ kategori `'DATA TIDAK CUKUP'`, apa pun skornya.

Karena `total_score` direnormalisasi ke bobot yang datanya ada, saham yang **hanya punya data teknikal** (fundamental & flow kosong, coverage ~40%) dan kebetulan teknikalnya kuat bisa mendapat `total_score` 85-100 — lalu masuk daftar "hari ini beli apa" sebagai peringkat teratas. Komentar `MIN_SCORE` di baris 45-48 secara eksplisit menyatakan tujuannya adalah "daftar hari ini beli apa tidak boleh memuat saham yang sistem sendiri tidak kategorikan layak beli" — aturan itu tidak ditegakkan.

**Dampak:** saham dengan data paling sedikit justru paling mudah mendapat skor tinggi. Ini kebalikan dari yang diinginkan.

### P0-2 — `coverage_pct` melaporkan kelengkapan data terlalu tinggi

`combine()` (`scoring.service.ts:319-329`):

```ts
const declaredMax = components.reduce((s, c) => s + c.max, 0);
const availableMax = (rawMax / declaredMax) * groupMax;
```

Masalahnya: `scoreValuasi/scoreProfitabilitas/scoreKesehatan` **mengecilkan `max` sendiri** kalau salah satu sub-metrik hilang (baris 194-196: "kalau salah satu tidak ada, `max` ikut menyusut"). Akibatnya `declaredMax` ikut menyusut, dan rasio `rawMax/declaredMax` tetap 1.0.

Contoh nyata (emiten rugi, PER null, sisanya lengkap):

| Komponen | max | available |
|---|---|---|
| valuasi (hanya PBV) | 5 | ya |
| profitabilitas | 10 | ya |
| kesehatan | 10 | ya |

`rawMax = 25`, `declaredMax = 25` ⇒ `availableMax = (25/25) × 30 = 30` ⇒ **coverage fundamental dilaporkan 100%**, padahal separuh blok valuasi hilang.

Renormalisasi ke `declaredMax` hanya bekerja benar kalau komponen hilang **seluruhnya** (lewat `NA()` yang mempertahankan `max` penuh). Untuk komponen yang hilang **sebagian**, kehilangan itu tak terlihat sama sekali di `coverage_pct` — angka yang justru dipakai sebagai satu-satunya gerbang "DATA TIDAK CUKUP".

### P0-3 — Tidak ada gerbang kelayakan (eligibility) di titik penilaian

Tidak ditemukan penanganan sama sekali untuk (grep seluruh repo):

- ARA / ARB (auto rejection atas/bawah)
- suspensi / halt / UMA
- rights issue, stock split, reverse split, bonus shares, waran
- IPO baru / histori terlalu pendek untuk penilaian menyeluruh
- data harga basi (stale) sebagai pemblokir rekomendasi

Yang ada hanyalah:

- filter likuiditas **statis & manual** — `AI_PICK_UNIVERSE` (109 ticker) disalin **dengan tangan** dari keluaran `scripts/backtest-universe-refresh.mjs`; kriterianya (harga ≥ Rp200, nilai transaksi ≥ Rp1 M/hari, volatilitas ≤ 120%/th) tidak pernah dievaluasi ulang saat runtime;
- `MIN_MARKET_CAP = 500 miliar` di `recommendation.service.ts:22`, dan itupun **dilewati kalau `marketCap` null** (baris 238).

**Konsekuensi paling berbahaya:** `/api/stock/[ticker]` menerima **ticker apa pun** — tidak ada penyaringan universe. Saham gorengan yang sedang ARA berturut-turut akan mendapat: MA trend uptrend sempurna (15/15), volume ratio > 2x (10/10), CMF tinggi (20/20), streak akumulasi (10/10) — yaitu **skor teknikal + flow sempurna tepat pada saat saham itu paling berbahaya untuk dibeli**. Sistem tidak punya satu pun mekanisme untuk mengatakan "jangan".

### P0-4 — Skor tidak pernah divalidasi; backtest menguji hal yang berbeda

`modules/backtest/` melakukan simulasi atas **kombinasi filter indikator biner** (`allBullish(day, filters)`), bukan atas `total_score`. Tidak ada di seluruh repo:

- uji bucket skor (90-100 vs 80-89 vs 70-79 …)
- Information Coefficient / rank-IC
- uji monotonisitas (apakah skor lebih tinggi ⇒ hasil lebih baik)
- out-of-sample split / walk-forward
- kalibrasi confidence

Artinya seluruh ambang 75/60/45, seluruh bobot 40/30/30, seluruh sub-bobot 15/8/7/10, **belum pernah diuji apakah punya daya prediktif sama sekali**. Angka-angka itu saat ini adalah pendapat yang dituangkan ke kode.

### P1-5 — Konsensus tidak konsisten antar halaman untuk saham yang sama

`recommendation.service.ts:119` memanggil `calculateConsensus()` dengan **10** analyzer.
`app/api/stock/[ticker]/route.ts` mem-`push` 2 analyzer tambahan (LensFlow + Bandarmology) **sebelum** memanggil `calculateConsensus()` ⇒ **12** analyzer.

Karena `bull_pct = bullCount / totalModels`, penyebutnya berbeda. 7 vote bullish = 70% (BUY) di Rekomendasi, tapi 58% (HOLD) di Detail Saham — untuk saham & hari yang sama. Ini **persis kelas bug M-04** yang dulu diperbaiki dengan menyatukan fungsinya; penyatuan fungsi tidak cukup karena input listnya berbeda.

Lebih buruk: dua analyzer tambahan itu (LensFlow, Bandarmology) **keduanya turunan CMF20 yang sama**, jadi di Detail Saham arus dana mendapat 2 dari 12 suara sekaligus 30 dari 100 poin skor.

### P1-6 — Double counting tren di konsensus (bobot tersembunyi)

Dari 10 analyzer, empat mengukur hal yang praktis sama:

| Analyzer | Isi |
|---|---|
| `EMA 20/50 Cross` | arah EMA20 vs EMA50 |
| `MA Trend IDX (20,50,200)` | harga vs MA20/50/200 |
| `SMA Score (5,10,20)` | harga vs SMA5/10/20 + urutan SMA |
| `MACD (12,26,9)` | selisih EMA12−EMA26 |

Semua turunan rata-rata bergerak harga penutupan. Dengan skema **1 analyzer = 1 vote setara**, tren menguasai ~40% suara, RSI hanya 10%. Bobot itu tidak pernah dideklarasikan di mana pun — ia muncul sebagai efek samping dari "berapa banyak analyzer bertema tren yang kebetulan ditulis".

### P1-7 — RSI dinilai berlawanan arah oleh dua bagian sistem yang sama

| RSI | `rsi-analyzer.ts` | `scoreRsi()` |
|---|---|---|
| < 40 | **BULLISH** (oversold = beli), confidence `100 − rsi` | **2 dari 8 poin**, alasan "OVERSOLD zona SELL/hati-hati" |
| 50-70 | BULLISH | 8 dari 8 |
| > 78 | BEARISH | 0 dari 8 |

Kedua hasil ditampilkan **di halaman yang sama** (kartu analyzer + breakdown skor). Untuk RSI 32, pengguna melihat kartu "RSI 14: BULLISH (68%)" tepat di sebelah alasan skor "RSI 32.0 OVERSOLD zona SELL/hati-hati".

### P1-8 — `scoreVolume()` memberi poin penuh untuk volume besar TANPA melihat arah harga

`scoring.service.ts:179-187`:

```ts
if (ratio >= 2.0) return { score: 10, reason: `Volume ${ratio}x avg (SANGAT TINGGI)` };
```

Saham yang **anjlok −12% dengan volume 3x rata-rata** (panic selling / distribusi) mendapat **10/10 poin volume** — 10% dari seluruh skor komposit — persis sama dengan saham yang breakout naik dengan volume 3x. Volume adalah besaran, bukan arah; memberinya poin searah tanpa konfirmasi arah adalah kesalahan kategori yang sama persis dengan temuan H-08 (ATR) yang sudah diperbaiki di `volatility-analyzer.ts`, tapi belum diterapkan ke volume.

### P1-9 — `analyzeAccumulationSignal()` tidak stabil dari hari ke hari

Syarat ke-3 (`foreign-flow-proxy.ts:130`): `volRatio > 1.5` **pada hari terakhir**.

Artinya: saham yang sudah 15 hari terkonfirmasi akumulasi akan **kehilangan status AKUMULASI seluruhnya** begitu ada satu hari dengan volume normal. `flow_persistensi` melompat dari 10 → 5 poin, dan `foreignFlow` berubah dari "STRONG NET BUY" ke "NEUTRAL", hanya karena volume satu hari. Persistensi seharusnya diukur atas jendela, bukan digerbangi oleh satu bar terakhir.

### P1-10 — Valuasi tidak sektor-aware di mesin skor utama

`scoreValuasi()` memakai ambang identik untuk **seluruh emiten IDX**:

```
PER < 10       = murah  (5/5)
PER 10-15      = wajar  (4/5)
PER 15-25      = agak mahal (2/5)
PER >= 25      = mahal  (0/5)
PBV < 1        = 5/5 ; PBV < 2 = 3/5 ; selain itu 1/5
```

Untuk pasar Indonesia ini secara sistematis salah ke dua arah:

- **Emiten siklikal (batu bara, CPO, nikel)** hampir selalu ber-PER 3-8x **tepat di puncak siklus laba** — model ini memberi mereka skor valuasi maksimum persis saat risikonya tertinggi (klasik *value trap*).
- **Bank** dinilai lewat PBV yang benar, tetapi ambang PBV<1 = murah mengabaikan bahwa PBV wajar bank adalah fungsi ROE-nya: BBCA di PBV 4x dengan ROE 21% bukan "premium" dalam arti yang sama dengan bank ROE 6% di PBV 1.2x.
- **Consumer staples / healthcare** yang secara struktural diperdagangkan 25-35x PER otomatis mendapat 0/5.

Kolom "PER vs Sektor" di Screener sudah benar arahnya (`screener.service.ts:342`), tapi itu mesin **ranking** yang berbeda dan tidak memberi makan `calculateScore()`.

### P1-11 — `scoreKesehatan()` menghukum struktur neraca sektor tertentu

`DER < 0.5 = 5/5`, `DER >= 2.0 = 0/5`, `Current Ratio > 2.0 = 5/5`.

- **Bank & multifinance**: DER "sehat" bank itu 5-8x menurut definisi bisnisnya. Kalau Yahoo mengembalikan angkanya, bank dapat **0/5**; kalau Yahoo tidak mengembalikan, komponennya dikeluarkan (`NA`). Jadi bank dinilai baik hanya karena datanya kebetulan hilang.
- **Property & konstruksi** (WIKA, PTPP, CTRA): DER 1.5-2.5x adalah norma industri.
- **Current Ratio** tidak punya makna untuk bank sama sekali.

### P1-12 — Semua asumsi valuasi tunggal untuk seluruh emiten

`dcf-valuation.service.ts:21-43`:

| Asumsi | Nilai | Masalah |
|---|---|---|
| `DISCOUNT_RATE` | 12% untuk **semua** emiten | Tidak ada penyesuaian risiko. `beta.service.ts` **sudah ada dan berfungsi** tapi tidak pernah dipakai untuk menurunkan cost of equity. |
| `PERPETUAL_GROWTH` | 5% | Di atas pertumbuhan nominal PDB jangka panjang yang wajar untuk perpetuitas. Kombinasi (12%−5%)=7% ⇒ pengganda dividen 15x untuk *semua* emiten pembayar dividen. |
| `FAIR_PER_NON_BANK` | 15 | Konvensi, bukan estimasi. |
| `NON_BANK_PBV_DIVISOR/MULTIPLIER` | ROE/12 × 0.85 | Tidak diturunkan dari teori. Bentuk yang benar (Gordon): PBV\* = (ROE − g)/(r − g). Untuk ROE 20%, g 5%, r 12% ⇒ PBV\* = 2.14x; rumus yang ada memberi 1.42x. Selisih 50%. |

Dan `intrinsic_dcf` memakai **FCF satu tahun tunggal** sebagai basis perpetuitas (`fcf_per_share × 1.05 / 0.07` = FCF × 15). Untuk emiten siklikal yang FCF-nya berayun dari negatif ke triliunan antar tahun, ini menghasilkan nilai wajar yang berayun ratusan persen.

### P1-13 — `valuation_agent` = bobot terbesar (20%) di atas angka paling rapuh

`orchestrator.service.ts:287`: `mosScore = clamp(50 + dcf.mos, 0, 100)`.

`mos = (fair − price)/fair`. Kalau `fair` mendekati `price` dari bawah, `mos` bisa −∞ secara matematis (mis. fair 100, price 500 ⇒ mos = −400 ⇒ clamp ke 0). Fungsi ini sangat tidak linier justru di daerah yang paling sering terjadi, dan MoS-nya berasal dari model dengan asumsi tetap (poin P1-12). Bobot 20% — terbesar dari semua agen — diberikan ke angka paling banyak asumsinya.

### P1-14 — Screener call-site masih menyuntik nilai default yang dilarang

`screener.service.ts:193-196`:

```ts
const rsiVal   = typeof rsiResult?.raw?.rsi === 'number' ? rsiResult.raw.rsi : 50;
const macdLineVal = ... : 0;
const macdSigVal  = ... : 0;
const macdHistVal = ... : 0;
```

dan baris 221-223: `ma20: ma20 ?? 0, ma50: ma50 ?? 0, ma200: ma200 ?? 0`.

Ini **persis pola temuan C-7 & H-2** yang sudah ditutup di `app/api/stock/[ticker]/route.ts`, `recommendation.service.ts`, dan `ai-pick-scan.service.ts` — tapi terlewat di sini. Kontrak `TechnicalInput` (`scoring.service.ts:45-47`) menyatakan eksplisit "WAJIB null … jangan pernah mengirim rata-rata bar seadanya".

Dampak praktis **rendah** (blok ini dijaga `hasFullHistory` ≥ 200 bar, sehingga RSI/MACD/MA praktis selalu terhitung), tapi pelanggaran kontraknya nyata dan hanya butuh satu perubahan guard untuk menjadi berbahaya kembali. RSI = 50 jatuh **persis** di pita "zona BUY ideal" (8/8 poin).

### P1-15 — Backtest memakai AdjClose yang direstatement (look-ahead halus)

`precompute.service.ts` memanggil analyzer yang membaca `AdjClose`. AdjClose Yahoo untuk bar tanggal T **dihitung ulang setiap kali ada dividen setelah T**. Artinya nilai AdjClose yang dipakai simulasi untuk tahun lalu **bukan angka yang tersedia pada tanggal itu**.

Efeknya kecil untuk emiten IDX (dividen 2-5%/tahun) dan berlawanan arah dengan bias optimis (AdjClose masa lalu jadi lebih rendah), tapi secara metodologis ini **tetap penggunaan informasi masa depan** dan harus dinyatakan bersama batasan lain di `backtest-limitations.ts`.

Catatan positif: eksekusi di **open D+1** (`simulate.service.ts:147-176`) sudah benar dan merupakan salah satu bagian terkuat dari seluruh sistem.

### P2-16 — Support & Resistance bukan struktur pasar

`support-resistance.ts`: `resistance = max(High, 20 bar)`, `support = min(Low, 20 bar)`.

Ini adalah *range* 20 hari, bukan support/resistance. Tidak ada swing high/low, tidak ada pivot, tidak ada volume profile, tidak ada jumlah sentuhan. Dan hasilnya dipakai sebagai **sinyal arah** (dekat support ⇒ BULLISH) dengan bobot 10% penuh sebagai `pattern_agent` — asumsi mean reversion tanpa syarat, diterapkan juga pada saham yang sedang downtrend, yaitu definisi *catching a falling knife*.

### P2-17 — TP/CL AI Pick simetris ⇒ Risk/Reward selalu 1:1

`ai-pick.service.ts:160-163`:

```
tp1 = price + 1×ATR    cl1 = price − 1×ATR
tp2 = price + 2×ATR    cl2 = price − 2×ATR
```

Risk/Reward = 1.0 secara konstruksi, untuk setiap saham, setiap hari. Dengan biaya round-trip ~0.6-0.8% (angka dari `simulate.service.ts:24-26`), setup RR 1:1 membutuhkan win rate > ~52% hanya untuk impas. Angka ini disajikan sebagai "target & level waspada" tanpa RR pernah ditampilkan.

Level-nya juga mengabaikan struktur harga: CL bisa jatuh tepat di atas support nyata, atau jauh di bawahnya, tanpa pernah diperiksa.

### P2-18 — "Risk/Reward" di Breakout Radar bukan risk/reward

`breakout.service.ts:135-138`:

```ts
const risk   = currentPrice - low20;
const reward = high20 - currentPrice;
const rr = reward / risk;
```

Ini rasio posisi harga di dalam range 20 hari, bukan RR dari sebuah setup. Saham yang harganya **tepat di low 20 hari** menghasilkan `risk ≈ 0` ⇒ RR meledak ke angka besar ⇒ ditampilkan "1:47". Tidak ada stop loss yang benar-benar diletakkan di `low20`, dan tidak ada penyesuaian volatilitas.

### P2-19 — Skor breakout: poin 3/2/1/1/1 dan pita RSI 52-60

`breakout.service.ts:126-133`. Lima konstanta tanpa dasar, dan `isRsiBreakout = rsi >= 52 && rsi <= 60` — jendela selebar 8 poin RSI yang menolak RSI 61 (momentum lebih kuat) tapi menerima RSI 52. Selain itu `isBandarAccum = price > ma20 && isVolSpike` **memakai ulang `isVolSpike` yang sudah diberi 2 poin sendiri** ⇒ volume spike dihitung dua kali (2 + 1 dari 8 total poin).

### P2-20 — `estimateFullDayVolume()` mengasumsikan volume intraday linear

`shared/market/trading-session.ts`: `volume_estimasi = volume_parsial / (menit_berlalu / total_menit)`.

Volume intraday IDX berbentuk U (tebal di pembukaan & menjelang penutupan/pre-closing). Ekstrapolasi linear pukul 09:30 akan **melebih-lebihkan** volume harian secara sistematis, sehingga `vol_ratio` dan sinyal "VOL SPIKE" bias ke atas pagi hari. Selain itu jam sesi dimodelkan 09:00-15:00 kontinu, mengabaikan jeda siang dan jam tutup Jumat (sudah diakui di komentarnya).

### P2-21 — `moatRating` menamai heuristik dua-angka sebagai "moat"

`screener.service.ts:316-320`: `ROE ≥ 20 && GM ≥ 40 ⇒ 'Lebar'`. Economic moat adalah pernyataan tentang **daya tahan** keunggulan (konsistensi ROIC di atas WACC bertahun-tahun), bukan snapshot dua rasio TTM. Label "Lebar/Sedang/Sempit" meniru terminologi Morningstar dan akan dibaca pengguna sebagai penilaian setara.

### P2-22 — Normalisasi ranking Screener adalah heuristik murni

`screener.service.ts:352-356` (sudah jujur diberi "CATATAN KALIBRASI"):

```ts
roeScore    = clamp(roe * 3, 0, 100)          // ROE 33% -> 100
derScore    = max(0, 100 - der * 40)          // DER 2.5x -> 0
divScore    = min(100, div_yield * 15)        // yield 6.7% -> 100
growthScore = clamp(50 + rev_growth * 5)      // growth +10% -> 100
momentumScore = clamp(vol_ratio * 50)         // vol 2x -> 100
```

`momentumScore` khususnya **bukan momentum sama sekali** — itu rasio volume, dinamai momentum, dan diberi bobot **30%** pada profil Agresif. Saham yang jatuh dengan volume tinggi mendapat momentum score maksimal.

### P2-23 — `riskScore` di UI adalah fungsi linier ATR yang jenuh terlalu cepat

`lib/utils/lens-score-breakdown.ts:22`: `100 − volatilitas% × 15`.

ATR 6.7%/hari ⇒ skor 0. ATR 6.7% bukan hal luar biasa untuk saham lapis dua IDX. Efeknya seluruh saham small/mid-cap bertumpuk di skor risiko 0-20 dan tidak bisa dibedakan satu sama lain. Selain itu risiko direduksi menjadi satu dimensi (volatilitas) — tidak ada beta, drawdown, gap risk, maupun risiko likuiditas.

### P2-24 — Tidak ada relative strength & tidak ada market regime

Grep seluruh repo: perbandingan terhadap IHSG **hanya ada di hasil backtest** (`alphaPct`). Tidak ada satu pun komponen skor yang membandingkan saham terhadap IHSG atau terhadap sektornya. Saham yang naik 8% dalam 3 bulan sementara sektornya naik 25% dinilai identik dengan saham yang naik 8% saat sektornya turun 10%.

Demikian pula tidak ada deteksi rezim pasar. `market-pulse.service.ts` menghitung breadth (advancing/declining) tetapi hasilnya **hanya ditampilkan**, tidak pernah masuk ke keputusan mana pun.

### P2-25 — Sector heatmap adalah rata-rata sederhana 5-8 saham kurasi manual

`market-pulse.service.ts:IDX_SECTORS`. Sudah jujur ditandai `isProxy: true` + `sampleSize`, tapi rata-rata **tidak berbobot** dari 5-8 saham pilihan tangan bukan pengganti indeks sektor IDX (IDXFIN, IDXENERGY, dst.) — dan penamaan sektornya mengikuti taksonomi Yahoo/Morningstar, bukan **IDX-IC** yang berlaku di BEI.

### P3-26 — Confidence tidak terkalibrasi dan bukan probabilitas

Contoh dari kode:

```ts
// macd-analyzer.ts
confidence = Math.min(95, 60 + (histogram / currentPrice) * 1000)
// ema-analyzer.ts
confidence = Math.min(100, 50 + ((ema20 - ema50) / ema50) * 500)
// momentum-analyzer.ts
confidence = Math.min(99, 60 + (pct1D + pct5D) * 2)
```

Konstanta 1000, 500, 2, 15, 20 tidak diturunkan dari apa pun. Angka-angka ini kemudian: (a) menjadi `median_skor` yang ditampilkan sebagai "Skor", dan (b) dikonversi `50 ± conf/2` menjadi skor agen yang dibobot 15%/10% di orchestrator. Rantai ini berarti **final_score /multi-agent adalah rata-rata tertimbang dari konstanta yang dikarang**.

Tidak ada Confidence Score tingkat sistem sama sekali.

### P3-27 — Tidak ada Data Quality Score

`coverage_pct` mendekati konsepnya tapi hanya mengukur satu dimensi (kelengkapan bobot), punya bug P0-2, dan tidak memasukkan kesegaran data. `classifyFreshness()` sudah ada (`shared/http/freshness.ts`) tapi hasilnya hanya masuk `_meta`, tidak pernah mempengaruhi skor maupun kategori.

---

## 4. Magic Numbers / Arbitrary Thresholds

Inventaris lengkap ambang yang dipakai untuk mengambil keputusan, dengan penilaian dasarnya.

### 4.1 Ambang keputusan akhir

| Konstanta | Nilai | Lokasi | Dasar |
|---|---|---|---|
| `SCORING_KATEGORI_THRESHOLDS` | 75 / 60 / 45 | `decision-thresholds.ts:24` | **Tidak ada.** Tidak pernah diuji. |
| `ORCHESTRATOR_SCORE_THRESHOLDS` | 65 / 55 / 45 / 35 | `decision-thresholds.ts:30` | **Tidak ada.** Berbeda dari di atas tanpa alasan empiris. |
| `CONSENSUS_VOTE_THRESHOLDS` | 80% / 60% | `decision-thresholds.ts:39` | **Tidak ada.** |
| `MIN_COVERAGE_PCT` | 55 | `scoring.service.ts:129` | Diakui sendiri "keputusan produk". |
| `MIN_SCORE` (AI Pick) | 60 | `ai-pick.service.ts:49` | Mewarisi ambang BUY. |
| `MAX_ITEMS` | 10 | `ai-pick.service.ts:50` | Keputusan tampilan (wajar). |

### 4.2 Bobot kelompok

| Bobot | Nilai | Dasar |
|---|---|---|
| Technical / Fundamental / Flow | 40 / 30 / 30 | Tidak ada. |
| ma_trend / rsi / macd / volume | 15 / 8 / 7 / 10 | Tidak ada. |
| valuasi / profitabilitas / kesehatan | 10 / 10 / 10 | Tidak ada. |
| flow_tekanan / flow_persistensi | 20 / 10 | Tidak ada. **30% skor total dari satu indikator proxy (CMF).** |
| Bobot 9 agen orchestrator | 15/15/20/10/10/10/10/0/0 | Tidak ada. |

### 4.3 Ambang fundamental (`scoring.service.ts`)

| Metrik | Ambang | Catatan |
|---|---|---|
| PER | 10 / 15 / 25 | Universal, tidak sektor-aware. Menghadiahi siklikal di puncak laba. |
| PBV | 1.0 / 2.0 | Universal. Mengabaikan hubungan PBV–ROE. |
| ROE | 20 / 15 / 8 | Wajar sebagai rule of thumb, tapi tidak memperhitungkan leverage (DuPont) — ROE tinggi karena utang dinilai sama dengan ROE tinggi karena margin. |
| Revenue growth | 15 / 5 / 0 | Satu titik YoY TTM. Tidak ada konsistensi, tidak ada CAGR. |
| DER | 0.5 / 1.0 / 2.0 | Universal — menghukum bank, property, konstruksi, multifinance. |
| Current Ratio | 2.0 / 1.5 / 1.0 | Tidak bermakna untuk bank/keuangan. |

### 4.4 Ambang teknikal

| Metrik | Ambang | Catatan |
|---|---|---|
| RSI (scoring) | 40 / 50 / 70 / 78 | 78 (bukan 70) tidak standar & tidak dijelaskan. |
| RSI (analyzer) | 40 / 50 / 70 / 78 | Interpretasi **berlawanan** untuk < 40 (lihat P1-7). |
| RSI breakout | 52-60 | Pita 8-poin, tanpa dasar. |
| Volume ratio | 2.0 / 1.5 / 1.0 | Tanpa konfirmasi arah harga. |
| CMF20 | 20 / 5 / −5 / −20 | Diklaim "standar industri" (`foreign-flow-proxy.ts:79`) — ±20 memang lazim untuk klasifikasi, tapi pemetaan ke 20/14/8/3/0 poin adalah karangan. |
| CLV | 0.6 / 0.4 | Wajar sebagai konvensi Chaikin. |
| Streak akumulasi | ≥ 4 hari | Tanpa dasar. |
| `analyzeAccumulationSignal` | CMF>15, CLV>0.6 ×3 hari, vol>1.5×, ΣMFM>0.5 | Empat konstanta; syarat volume harian membuat sinyalnya tidak stabil (P1-9). |
| Support/Resistance | jarak < 2%, posisi 0.4/0.6 | Tanpa dasar. |
| Market Flow | accumPct > 55 / < 45 | Tanpa dasar. |
| SMA Score | ≥ 4 / ≤ 1 dari 5 | Tanpa dasar. |
| Volatility | ATR% 3.0 / 1.5 | Hanya untuk confidence, tidak untuk arah (sudah benar). |

### 4.5 Konstanta confidence (skala arbitrer)

`× 1000` (MACD), `× 500` (EMA), `× 2` (Momentum), `× 15` (ATR ke risk score), `× 10/5/2` (analyzer fundamental), `+ 50/60` sebagai basis di hampir semua analyzer. Tidak satu pun diturunkan dari distribusi data.

### 4.6 Konstanta valuasi

| Konstanta | Nilai | Catatan |
|---|---|---|
| `DISCOUNT_RATE` | 0.12 | Satu angka untuk semua emiten; `beta.service.ts` tersedia tapi tak dipakai. |
| `PERPETUAL_GROWTH` | 0.05 | Tinggi untuk perpetuitas. |
| `FAIR_PER_NON_BANK` / `_BANK` | 15 / 14.5 | Konvensi. |
| `BANK_PBV_DIVISOR/MULTIPLIER` | 12 / 1.4 | Heuristik; tidak konsisten dengan Gordon. |
| `BANK_HIGH_ROE_*` | 11 / 1.3 (jika ROE>20) | Diskontinuitas di ROE 20% — ROE 19.9% dan 20.1% menghasilkan PBV wajar berbeda tajam. |
| `BANK_PBV_CAP` | 3.2 | Tanpa dasar. |
| `NON_BANK_PBV_DIVISOR/MULTIPLIER` | 12 / 0.85 | Tanpa dasar. |
| `GRAHAM_CONSTANT` | 22.5 | Konstanta klasik Graham 1949 (AS, era berbeda) — dipakai apa adanya untuk IDX 2026. |
| `SBN_10Y_YIELD_PCT` | 6.7 | **Asumsi statis** (sudah dilabeli jujur), tapi ini seharusnya data pasar yang bisa diambil. |
| `EQUITY_RISK_PREMIUM_PCT` | 5.2 | Asumsi statis. |
| `TERMINAL_GROWTH_PCT` | 3.5 | Asumsi. |
| Growth clamp | 2%-12% | Tanpa dasar. |
| `SECTOR_RULES` (bobot per sektor) | 5 set angka × 11 sektor | Seluruhnya tanpa dasar; taksonomi Yahoo, bukan IDX-IC. |
| `discountRate` bank ROE>20 | 0.105 | Diskontinuitas kedua di ROE 20%. |

### 4.7 Konstanta simulasi & universe

| Konstanta | Nilai | Catatan |
|---|---|---|
| `SLIPPAGE_PCT` | 0.002 | Wajar & didokumentasikan. Tapi konstan — saham tidak likuid slippage-nya jauh lebih besar. |
| `FEE_BUY/SELL_PCT` | 0.0015 / 0.0025 | Wajar untuk ritel IDX. |
| `MAX_SLOTS` | 5 | Keputusan produk. |
| `TRADING_DAYS_PER_MONTH` | 22 | Aproksimasi wajar. |
| `LOOKBACK_DAYS` / `ANALYZER_WINDOW` / `RETAIN_DAYS` | 200 / 250 / 560 | Wajar & didokumentasikan. |
| `MIN_MARKET_CAP` | Rp 500 M | Dilewati kalau data null. |
| Universe filter | harga ≥ 200, nilai ≥ 1 M/hari, vol ≤ 120%/th | Wajar, **tapi statis & manual**. |

**Total: 90+ magic number yang mempengaruhi keputusan BUY/SELL, dengan 0 yang diturunkan dari data IDX.**

---

## 5. Fundamental Model Review

### Masalah struktural

1. **Semua data adalah TTM snapshot dari Yahoo `financialData`/`defaultKeyStatistics`.** Tidak ada deret waktu. Konsekuensinya: tidak ada konsistensi margin, tidak ada stabilitas ROE, tidak ada CAGR, tidak ada tren — hanya satu titik.
2. **Tidak ada earnings quality.** Tidak ada `operatingCashflow / netIncome` (accrual ratio), padahal itu satu-satunya penyaring paling efektif terhadap laba yang "dibikin". Di BEI ini krusial (laba dari revaluasi aset, keuntungan selisih kurs, penjualan anak usaha).
3. **Tidak ada ROIC.** ROE bisa tinggi murni karena leverage. Tanpa dekomposisi DuPont (margin × turnover × leverage), ROE 25% dari DER 3x dinilai sama dengan ROE 25% dari margin.
4. **Tidak ada interest coverage** (EBIT/beban bunga) — metrik solvabilitas yang paling relevan untuk emiten IDX yang berutang, jauh lebih informatif daripada DER telanjang.
5. **Redundansi**: PER dan PBV dinilai bersama di "valuasi", tapi ROE = PBV/PER secara identitas. Menilai ROE (di profitabilitas) + PER + PBV (di valuasi) berarti menilai kuantitas yang saling terikat tiga kali.

### Yang sudah benar

- Koreksi PBV untuk emiten pelapor USD (`correctPbvForUsdReporter`) — ini penanganan yang benar dan penting untuk ADRO/ITMG/INCO/MEDC.
- Penghapusan fallback kurs 15500.
- Renormalisasi bobot saat komponen hilang (konsep benar, implementasi bermasalah — lihat P0-2).

---

## 6. Valuation Model Review

### Yang salah

| Isu | Detail |
|---|---|
| PER absolut universal | Lihat P1-10. Value trap siklikal. |
| Tidak ada Forward PER | Yahoo menyediakan `forwardPE`; hanya dipakai sebagai fallback di `pe-analyzer.ts`, tidak di skor. |
| Tidak ada EV/EBITDA | Wajib untuk emiten berutang (telco, tower, infra, konstruksi). Yahoo menyediakan `enterpriseToEbitda`. |
| Tidak ada Earnings Yield | PER pecah untuk laba negatif; EY = EPS/harga tidak. |
| Tidak ada FCF Yield | Tersedia dari `freeCashflow` + market cap. |
| Tidak ada valuasi vs histori sendiri | "PER 18x" tak bermakna tanpa tahu range historis emiten itu. |
| Tidak ada PEG | Tersedia dari data yang sudah diambil. |
| DDM & DCF 1-tahap | Sangat sensitif ke (r−g); FCF satu tahun sebagai basis perpetuitas. |
| PBV wajar tidak konsisten teori | Lihat P1-12. |

### Yang sudah benar

- Router sektor untuk memilih metode (PBV/DDM untuk bank, DCF/PER untuk non-bank) — arahnya tepat.
- DCF dinonaktifkan untuk bank dengan penjelasan eksplisit — benar.
- Tabel sensitivitas WACC × terminal growth — praktik yang baik.
- Redistribusi bobot saat metode tidak tersedia — benar.
- Pelabelan `is_model_estimate` / `is_assumption` — jujur dan patut dipertahankan.

---

## 7. Technical Model Review

### Redundansi (double counting)

| Kelompok | Indikator yang tumpang tindih | Dampak |
|---|---|---|
| Tren | EMA 20/50, MA Trend 20/50/200, SMA Score 5/10/20, MACD | 4 dari 10 vote konsensus |
| Arus dana | CMF20 (flow_tekanan), accumulationStatus (turunan CMF20), LensFlow analyzer (CMF), Bandarmology analyzer (CMF) | 30/100 poin skor + 2/12 vote |
| Volume | scoreVolume, Volume analyzer, Market Flow Index, syarat volume di accumulationSignal, isVolSpike breakout | 4-5 tempat |

### Yang hilang

- **ADX** — tidak ada ukuran *kekuatan* tren, hanya arah. Ini yang membuat sistem tidak bisa membedakan uptrend kuat dari sideways yang kebetulan di atas MA.
- **Kemiringan (slope) MA** — hanya urutan MA yang diperiksa, bukan arah geraknya.
- **Struktur pasar** (HH/HL vs LH/LL) — tidak ada.
- **OBV / A/D line kumulatif** — `market-flow.ts` menghitung rasio volume 14 hari, bukan OBV kumulatif.
- **VWAP** — tidak ada.
- **Bollinger / volatility squeeze** — tidak ada.

### Yang sudah benar

- RSI Wilder terpusat satu implementasi — sangat baik.
- EMA di-seed SMA — benar.
- AdjClose dipakai konsisten untuk indikator tren — benar dan penting untuk IDX (dividen besar).
- ATR tidak lagi memberi vote arah — koreksi yang tepat.
- Penyesuaian volume bar berjalan — konsep benar (implementasi linear perlu diperbaiki, P2-20).

---

## 8. Momentum Model Review

Momentum saat ini = `analyzeMomentum` (1D & 5D) + RSI. Dua masalah:

1. **Horizon terlalu pendek.** 1D dan 5D adalah *noise*, bukan momentum. Literatur momentum (Jegadeesh-Titman dan seluruh turunannya) konsisten menemukan efek pada horizon **6-12 bulan dengan skip 1 bulan** (12-1). Reversal justru dominan pada horizon 1 minggu-1 bulan — artinya `analyzeMomentum` saat ini kemungkinan besar memberi sinyal **berlawanan** dengan momentum yang punya bukti empiris.
2. **Tidak ada relative strength.** Momentum absolut di pasar yang sedang bull memberi sinyal beli ke hampir semua saham. Yang punya daya prediktif adalah momentum **relatif** terhadap IHSG/sektor.

RSI diperlakukan sebagai mean-reversion (< 40 = BULLISH di analyzer) sekaligus trend-following (50-70 = terbaik di scoring). Dua interpretasi ini tidak bisa keduanya benar tanpa syarat rezim.

---

## 9. Risk Model Review

**Status: praktis tidak ada.**

- `risk_agent` di orchestrator: bobot **0%**.
- `riskScore()` di UI: fungsi linier ATR, jenuh di ATR 6.7% (P2-23).
- `scoring.service.ts` field `risk`: **string teks**, bukan skor — hanya menyebut jarak ke MA20 dan flag overbought.
- `beta.service.ts`: implementasi benar, tapi hanya dipakai di halaman /risk untuk portofolio; **tidak masuk skor saham manapun**.
- Tidak ada: maximum drawdown per saham, downside deviation, gap risk, liquidity risk, risiko konsentrasi sektor, risiko corporate action.

Skor akhir 0-100 saat ini **naik** kalau volatilitas naik (lewat volume ratio & CMF yang cenderung ekstrem di saham volatil) — arah yang salah.

---

## 10. Liquidity Model Review

**Status: hanya filter universe statis manual.**

Tidak ada di runtime:
- Average Daily Value (ADV) hari ini
- turnover (volume / shares outstanding)
- bid-ask spread (tidak tersedia dari Yahoo — batasan nyata)
- jumlah hari tanpa transaksi dalam 20 hari terakhir
- penalti likuiditas pada skor
- status `NOT ELIGIBLE`

Untuk BEI ini adalah kelemahan paling material. Sebagian besar dari ~900 emiten IDX praktis tidak bisa dieksekusi dalam ukuran ritel wajar sekalipun. `/api/stock/[ticker]` menerima semuanya dan memberi skor penuh.

---

## 11. Sector Model Review

**Status: hampir tidak ada.**

Yang ada:
1. `SECTOR_RULES` di DCF — bobot metode valuasi per sektor. **Ini bagian terbaik dari sistem sektor.**
2. `isBank` boolean di DCF.
3. `sectorAvgPer` di Screener ranking (tidak masuk `calculateScore`).

Yang tidak ada:
- Tidak ada penyesuaian sektor sama sekali di `calculateScore()` — mesin utama.
- Taksonomi memakai sektor **Yahoo/Morningstar** (`assetProfile.sector`), bukan **IDX-IC** (11 sektor resmi BEI: IDXENERGY, IDXBASIC, IDXINDUST, IDXNONCYC, IDXCYCLIC, IDXHEALTH, IDXFIN, IDXPROP, IDXTECH, IDXINFRA, IDXTRANS). Untuk emiten IDX, klasifikasi Yahoo sering salah atau kosong (`|| 'Lainnya'`).
- Tidak ada metrik khusus bank (NIM, NPL, CAR, CASA, LDR, loan growth) — tidak satu pun tersedia dari Yahoo `quoteSummary`, jadi ini **keterbatasan data yang nyata**, bukan kelalaian. Harus dinyatakan, bukan disiasati.
- Tidak ada penanganan siklus komoditas untuk energi/basic materials.

---

## 12. Market Regime Review

**Status: tidak ada.**

`market-pulse.service.ts` menghitung breadth (advancing/declining/ratio) dan performa sektor proxy, tetapi keluarannya **hanya untuk tampilan**. Tidak ada satu pun keputusan BUY/SELL yang melihat kondisi IHSG.

Konsekuensi: pada Maret 2020 atau koreksi tajam IHSG, sistem akan tetap menghasilkan daftar "STRONG BUY" dengan skor 80+ karena setiap saham dinilai hanya terhadap dirinya sendiri.

`^JKSE` **sudah di-fetch** dan tersedia (`precompute.service.ts:116`) — bahan bakunya ada, tidak dipakai.

---

## 13. BUY/HOLD/SELL Review

| Aspek | Status |
|---|---|
| Berapa mesin keputusan | **5, saling tidak sepakat** |
| Dasar ambang | Tidak ada |
| Hard filter | Hanya `coverage < 55%` (dan itu di-bypass AI Pick, P0-1) |
| Risk-adjusted | Tidak |
| Liquidity-adjusted | Tidak |
| Regime-adjusted | Tidak |
| Confidence | Tidak ada di tingkat sistem |
| Kalibrasi | Tidak pernah diuji |

Satu hal yang **benar dan patut dipuji**: keputusan menghapus lapisan "bonus" dari AI Pick (`ai-pick.service.ts:5-43`). Analisisnya tajam dan benar — memisahkan kualitas (skor) dari timing (sinyal), dan menolak menjumlahkan sinyal yang saling berkorelasi. Prinsip itu harus jadi fondasi model baru.

---

## 14. Target Price Review

| Sumber "target" | Metode | Penilaian |
|---|---|---|
| `fair_value` (LensFundamental) | blend 5 metode, bobot sektor | Metodologis paling matang di aplikasi ini, tapi seluruh asumsinya tetap & seragam |
| `fair_value` (DCF page) | DCF 5-tahun + terminal | Struktur benar; WACC asumsi statis |
| TP1/TP2 (AI Pick) | harga ± 1/2 ATR | **Bukan target harga.** Ini pita volatilitas. RR selalu 1:1. |
| 52W High/Low (Screener) | fakta historis | Benar — dan sudah diperbaiki dari label "Target Bull/Bear" yang menyesatkan |
| `rr` (Breakout) | (high20−P)/(P−low20) | **Bukan risk/reward.** Bisa meledak ke tak hingga. |

**Yang penting:** aplikasi ini sudah benar dalam **tidak** menghasilkan target price dari `currentPrice × angka arbitrer`. Itu jebakan paling umum dan sudah dihindari.

---

## 15. Proposed SahamLens Score 0–100

### 15.1 Prinsip desain

**Prinsip 1 — Ganti ambang absolut dengan peringkat lintas-saham (cross-sectional percentile).**

Ini perubahan paling penting dan menghapus ~60 magic number sekaligus. Alih-alih "ROE > 15 ⇒ 4 poin", gunakan "persentil ROE emiten ini di dalam universe likuid IDX hari ini". Alasannya:

- **Kalibrasi otomatis ke IDX.** ROE median IDX berbeda dari ROE median S&P 500; persentil menyesuaikan sendiri tanpa perlu menebak angka.
- **Kalibrasi otomatis lintas waktu.** PER median IDX 2020 ≠ 2026. Persentil tidak lapuk.
- **Bisa dinetralkan per sektor** hanya dengan mengganti populasi pembanding.
- **Tidak ada diskontinuitas.** Tidak ada lagi lompatan 4→2 poin antara ROE 15.01% dan 14.99%.
- **Bisa dijelaskan.** "Skor valuasi 82 = lebih murah dari 82% emiten likuid di sektornya" jauh lebih bermakna daripada "82".
- **Bisa di-backtest langsung** dengan rank-IC.

**Prinsip 2 — Risiko & likuiditas bukan komponen aditif, melainkan gerbang + pengali.**

Kalau risiko jadi komponen aditif, saham berskor tinggi tapi tidak likuid tetap lolos dengan mengorbankan sedikit poin. Yang benar: likuiditas rendah ⇒ **tidak layak sama sekali**, bukan −5 poin.

**Prinsip 3 — Satu skor, satu mesin keputusan.** Kelima mesin dilebur menjadi satu. Konsensus analyzer dipertahankan sebagai **tampilan penjelas**, bukan sebagai mesin keputusan kedua.

**Prinsip 4 — Setiap angka yang belum diuji diberi label eksplisit.**

### 15.2 Arsitektur skor

```
UNIVERSE (dihitung ulang harian, bukan daftar manual)
      |
[GATE 0] ELIGIBILITY  -> NOT_ELIGIBLE / INSUFFICIENT_DATA / ELIGIBLE
      |
[GATE 1] DATA QUALITY (0-100) -> jika < 50: INSUFFICIENT_DATA
      |
SEKTOR (IDX-IC; fallback Yahoo; fallback 'UNCLASSIFIED')
      |
6 PILAR (masing-masing 0-100, dari persentil lintas-saham)
  Q  Quality          20%   [global percentile, sektor-neutral]
  V  Valuation        20%   [percentile DALAM SEKTOR]
  G  Growth           10%   [percentile DALAM SEKTOR]
  T  Trend            20%   [global percentile]
  M  Momentum & RS    15%   [global percentile]
  F  Flow & Partisipasi 15% [global percentile]
      |
RAW = 0.20Q + 0.20V + 0.10G + 0.20T + 0.15M + 0.15F
      |
x RISK_ADJ   (0.70 - 1.00)   <- pengali, bukan pengurang
x LIQ_ADJ    (0.60 - 1.00)   <- pengali
      |
LENSSCORE = round(clamp(RAW x RISK_ADJ x LIQ_ADJ, 0, 100))
      |
CONFIDENCE (0-100)  <- terpisah, tidak mempengaruhi skor
RISK SCORE (0-100)  <- terpisah, dilaporkan berdampingan
      |
DECISION ENGINE (skor x confidence x risiko x rezim)
```

> **INITIAL HYPOTHESIS — MUST BE BACKTESTED:** seluruh bobot pilar (20/20/10/20/15/15) dan rentang pengali. Titik awal ini dipilih dengan alasan: (a) fundamental+valuasi = 50% karena horizon target SahamLens adalah investor ritel menengah, bukan trader harian; (b) teknikal+momentum = 35% karena bukti empiris momentum/tren lintas pasar cukup kuat; (c) flow = 15% (turun dari 30%) karena CMF adalah **proxy**, bukan data broker — bobot 30% untuk proxy tidak proporsional.

### 15.3 Definisi pilar

#### Q — Quality (20%)

| Sub-faktor | Formula | Bobot dalam pilar |
|---|---|---|
| ROIC | `EBIT×(1−tax) / (total debt + equity − cash)` | 30% |
| Earnings quality | `operatingCashflow / netIncome` (accrual check) | 25% |
| Stabilitas margin | `−stdev(net margin, 5 tahun)` (makin kecil makin baik) | 20% |
| Interest coverage | `EBIT / beban bunga` | 15% |
| Konsistensi laba | jumlah tahun laba positif dari 5 tahun | 10% |

Tiap sub-faktor → persentil lintas-saham (global, karena kualitas *bisa* dibandingkan lintas sektor) → rata-rata tertimbang.

**Fallback bank/keuangan:** ROIC & interest coverage tidak berlaku ⇒ gunakan ROE + ROA + stabilitas ROE, dan **bobot sub-faktor direnormalisasi** (bukan diberi nol).

#### V — Valuation (20%) — **percentile DALAM SEKTOR**

| Sub-faktor | Formula | Bobot |
|---|---|---|
| Earnings Yield | `EPS_ttm / harga` (menangani laba negatif tanpa pecah) | 30% |
| FCF Yield | `FCF / market cap` | 25% |
| PBV relatif implied | `PBV_implied / PBV_aktual`, di mana `PBV_implied = (ROE − g)/(r − g)` | 25% |
| EV/EBITDA (inverse) | `1 / enterpriseToEbitda` | 20% |

`r` = cost of equity per emiten = `SBN10Y + beta × ERP` (beta dari `beta.service.ts` yang **sudah ada**), `g` = min(sustainable growth, 5%).

**Bank:** EV/EBITDA & FCF yield tidak berlaku ⇒ bobot direnormalisasi ke EY + PBV-implied.

**Anti value-trap siklikal (P1-10):** untuk sektor Energy & Basic Materials, EY dihitung dari **median EPS 5 tahun**, bukan EPS TTM. Ini penyesuaian standar (Shiller-style normalization) dan langsung menutup jebakan "PER 4x di puncak siklus batu bara".

#### G — Growth (10%) — **percentile DALAM SEKTOR**

| Sub-faktor | Formula | Bobot |
|---|---|---|
| Revenue CAGR 3 tahun | `(rev_t/rev_t−3)^(1/3) − 1` | 35% |
| EPS CAGR 3 tahun | idem | 35% |
| Konsistensi | proporsi kuartal YoY positif dari 8 kuartal terakhir | 30% |

Growth satu titik YoY **tidak dipakai sendirian**. Kalau histori < 3 tahun ⇒ pilar G ditandai tidak tersedia dan bobotnya direnormalisasi ke pilar lain (bukan diberi 50).

#### T — Trend (20%)

| Sub-faktor | Formula | Bobot |
|---|---|---|
| Posisi vs MA | `(P−MA50)/ATR` dan `(P−MA200)/ATR` (dinormalisasi volatilitas, bukan biner) | 30% |
| Kemiringan MA50 | `(MA50_t − MA50_t−20)/MA50_t−20` | 25% |
| Kekuatan tren | ADX(14) | 25% |
| Struktur pasar | skor HH/HL vs LH/LL atas 5 swing terakhir (fractal) | 20% |

Klasifikasi tren objektif (menggantikan "P > MA200 = bullish"):

| Kelas | Syarat |
|---|---|
| STRONG UPTREND | P>MA50>MA200, slope MA50>0, ADX>25, struktur HH+HL |
| UPTREND | P>MA200, slope MA50>0, ADX>20 |
| SIDEWAYS | ADX<20 **atau** \|P−MA50\|/ATR < 1 |
| DOWNTREND | P<MA200, slope MA50<0, ADX>20 |
| STRONG DOWNTREND | P<MA50<MA200, slope MA50<0, ADX>25, struktur LH+LL |

#### M — Momentum & Relative Strength (15%)

| Sub-faktor | Formula | Bobot |
|---|---|---|
| Momentum 12-1 | return 12 bulan **tidak termasuk** 1 bulan terakhir | 30% |
| RS vs IHSG (3M) | `return_saham_3M − return_IHSG_3M` | 30% |
| RS vs sektor (3M) | `return_saham_3M − return_sektor_3M` | 25% |
| RSI regime-aware | dalam UPTREND: RSI 50-80 baik, >80 mulai turun. Dalam DOWNTREND: RSI <30 **tidak** dianggap beli. | 15% |

Menghapus momentum 1D/5D sepenuhnya — itu noise.

#### F — Flow & Partisipasi (15%)

| Sub-faktor | Formula | Bobot |
|---|---|---|
| CMF(20) | seperti sekarang | 35% |
| Kemiringan OBV(20) | regresi linier OBV 20 hari / harga | 30% |
| Konfirmasi volume-arah | korelasi(return harian, volume relatif) 20 hari | 20% |
| Persistensi | proporsi hari dengan MFM>0 dalam 20 hari (**bukan** streak, **bukan** digerbangi volume hari terakhir) | 15% |

Ini memperbaiki P1-9 (persistensi jadi stabil) dan menghapus double counting volume.

### 15.4 Pengali risiko & likuiditas

```
RISK_ADJ = 1.00 − 0.30 × percentile_risiko/100        [rentang 0.70 – 1.00]
LIQ_ADJ  = 1.00                                  jika ADV20 ≥ Rp 5 miliar/hari
         = 0.60 + 0.40 × (ADV20 − 1e9)/(5e9 − 1e9)   jika Rp 1 M ≤ ADV20 < Rp 5 M
         = NOT_ELIGIBLE                            jika ADV20 < Rp 1 miliar/hari
```

> **INITIAL HYPOTHESIS — MUST BE BACKTESTED:** batas Rp 1 M & Rp 5 M/hari, dan kedalaman diskon 0.70/0.60. Batas Rp 1 M/hari **sudah dipakai** sebagai kriteria universe di `scripts/backtest-universe-refresh.mjs` — ini konsisten dengan keputusan yang sudah diambil tim, bukan angka baru.

---

## 16. Proposed BUY/HOLD/SELL Engine

### 16.1 Gerbang keras (dievaluasi dulu, membatalkan skor apa pun)

| Kondisi | Deteksi | Status keluaran |
|---|---|---|
| Suspensi / tidak diperdagangkan | tidak ada bar baru > 3 hari bursa, atau volume 0 selama 3 hari | `SUSPENDED / NOT TRADED` |
| Data basi | `regularMarketTime` > 2 hari bursa lalu | `STALE DATA` |
| Likuiditas terlalu rendah | ADV20 < Rp 1 miliar/hari | `NOT ELIGIBLE — LIKUIDITAS` |
| Harga terlalu rendah | harga < Rp 100 (zona fraksi/ARB ekstrem) | `NOT ELIGIBLE — HARGA` |
| Histori tidak cukup | < 200 bar bursa | `INSUFFICIENT HISTORY` |
| ARA/ARB beruntun | ≥ 2 hari berturut menyentuh batas auto-rejection | `ABNORMAL — AUTO REJECT` |
| Volatilitas ekstrem | ATR% > 15%/hari, atau return 20 hari > +100% | `EXTREME VOLATILITY` |
| Distorsi corporate action | split/reverse/rights dalam 5 hari terakhir | `CORPORATE ACTION — DATA DISESUAIKAN` |
| Data quality rendah | DQ Score < 50 | `INSUFFICIENT DATA` |

> **Catatan implementasi ARA/ARB:** batas auto-rejection IDX berjenjang menurut kelompok harga dan **telah berubah beberapa kali** (2020, 2021, 2023). Tabel batasnya **wajib dikonfigurasi dari peraturan IDX yang berlaku saat implementasi**, bukan di-hardcode dari ingatan. Deteksi yang aman tanpa tabel: `|return harian| ≥ 14%` sebagai kandidat ARA/ARB, dikonfirmasi dengan close menempel di high (ARA) atau low (ARB) hari itu.

### 16.2 Matriks keputusan

Setelah semua gerbang lolos:

| LensScore | Confidence ≥ 70 | Confidence 50-69 | Confidence < 50 |
|---|---|---|---|
| ≥ 80 | **STRONG BUY** | BUY | HOLD (data lemah) |
| 65-79 | **BUY** | BUY | HOLD |
| 50-64 | **HOLD** | HOLD | HOLD |
| 35-49 | **REDUCE** | HOLD | HOLD |
| < 35 | **SELL** | REDUCE | HOLD |

**Penyesuaian rezim** (diterapkan ke *ambang*, bukan ke skor — supaya skor tetap bisa dibandingkan lintas waktu):

| Rezim IHSG | Deteksi | Penyesuaian |
|---|---|---|
| BULL | IHSG > MA200, slope MA200 > 0, breadth A/D > 1.2 | ambang normal |
| SIDEWAYS | selain keduanya | ambang BUY +5 |
| BEAR | IHSG < MA200, slope MA200 < 0 | ambang BUY +10, STRONG BUY dinonaktifkan |
| HIGH VOLATILITY | ATR% IHSG > persentil 90 (2 tahun) | ambang BUY +10, ukuran posisi disarankan turun |

> **INITIAL HYPOTHESIS — MUST BE BACKTESTED:** seluruh sel matriks dan penyesuaian +5/+10.

Kategori sengaja **5, bukan 6+**: STRONG BUY / BUY / HOLD / REDUCE / SELL. Menambah "ACCUMULATE" di antara BUY dan HOLD menciptakan perbedaan yang tidak bisa dipertanggungjawabkan oleh presisi model ini.

### 16.3 Setup transaksi (menggantikan TP/CL simetris)

```
ENTRY      = harga terakhir (atau batas pullback ke MA20 jika RSI > 75)

STOP LOSS  = min( swing_low_terdekat − 0.5×ATR ,  harga − 2×ATR )
             -> berbasis struktur DAN volatilitas, bukan persentase tetap

RISK       = entry − stop

TARGET 1   = entry + 2×RISK      (RR 2:1)
TARGET 2   = resistance struktural terdekat di atas TARGET 1
             (swing high, bukan max 20 hari)

RR         = (TARGET1 − entry) / RISK

ATURAN: jika RR < 1.5, JANGAN tampilkan setup.
        Tulis "tidak ada setup dengan risk/reward memadai saat ini".
        Ini lebih berguna daripada setup dengan ekspektansi negatif.
```

Untuk saham dengan skor tinggi, `atr14Pct` yang sudah ada tetap ditampilkan sebagai konteks ruang gerak (keputusan yang sudah benar di `screener.service.ts:86-93`).

---

## 17. Proposed Confidence Score

```
CONFIDENCE = 100 × ( 0.35×C_data + 0.25×C_agreement + 0.20×C_history + 0.20×C_freshness )
```

| Komponen | Formula |
|---|---|
| `C_data` | proporsi **sub-faktor** (bukan pilar) yang punya data, dihitung benar (memperbaiki P0-2) |
| `C_agreement` | `1 − stdev(6 pilar)/50`, di-clamp 0-1. Enam pilar sepakat ⇒ tinggi; pilar berlawanan ⇒ rendah |
| `C_history` | `min(1, bar_tersedia / 500)` |
| `C_freshness` | 1.0 jika data ≤ 1 hari bursa; 0.6 jika 2-3 hari; 0.2 jika > 3 hari |

**Aturan yang tidak boleh dilanggar:** Confidence **tidak pernah** mengubah LensScore. Ia hanya mengubah *tindakan* (lihat matriks 16.2). Memasukkan confidence ke dalam skor membuat skor tidak bisa dibandingkan antar saham.

**Setelah backtest tersedia**, `C_agreement` harus diganti dengan hit rate historis empiris per bucket (skor 80-89 dengan agreement tinggi menghasilkan return positif X% dari waktu) — barulah confidence menjadi angka yang benar-benar terkalibrasi.

> **INITIAL HYPOTHESIS — MUST BE BACKTESTED:** bobot 0.35/0.25/0.20/0.20 dan semua konstanta di dalamnya.

---

## 18. Proposed Risk Score

```
RISK SCORE = 100 × ( 0.30×R_vol + 0.20×R_beta + 0.20×R_dd + 0.20×R_liq + 0.10×R_gap )
0 = risiko relatif terendah di universe ; 100 = tertinggi
```

| Komponen | Formula | Sumber |
|---|---|---|
| `R_vol` | persentil ATR%(14) lintas universe | sudah ada |
| `R_beta` | persentil \|beta − 1\| terhadap IHSG, 1 tahun | **`beta.service.ts` sudah ada, tinggal dipakai** |
| `R_dd` | persentil max drawdown 12 bulan | dari OHLC yang sudah ada |
| `R_liq` | persentil invers ADV20 | butuh perhitungan baru (mudah) |
| `R_gap` | persentil proporsi hari dengan gap > 3% dalam 60 hari | dari OHLC yang sudah ada |

Semua persentil ⇒ **tidak ada magic number** di dalam Risk Score. Ini contoh langsung manfaat Prinsip 1.

Label yang ditampilkan: 0-25 RENDAH, 26-50 MENENGAH, 51-75 TINGGI, 76-100 SANGAT TINGGI.

> **INITIAL HYPOTHESIS — MUST BE BACKTESTED:** bobot 0.30/0.20/0.20/0.20/0.10.

---

## 19. Proposed Data Quality Score

```
DQ = 100 × ( 0.40×D_complete + 0.25×D_fresh + 0.20×D_depth + 0.15×D_consistent )
```

| Komponen | Formula |
|---|---|
| `D_complete` | sub-faktor tersedia / total sub-faktor **yang berlaku untuk sektor emiten** (bank tidak dihukum karena tidak punya current ratio) |
| `D_fresh` | 1.0 jika bar terakhir = hari bursa terakhir; turun linier sampai 0 pada 5 hari |
| `D_depth` | `min(1, bar / 500)` |
| `D_consistent` | uji silang: `PBV ≈ harga/BVPS`? `PER ≈ harga/EPS`? `ROE ≈ EPS/BVPS`? Setiap identitas yang meleset > 10% mengurangi 0.25. **Ini menangkap bug mata uang USD/IDR secara otomatis** — kelas bug C-07 yang dulu ditemukan manual. |

| DQ | Konsekuensi |
|---|---|
| ≥ 80 | rekomendasi normal |
| 50-79 | rekomendasi ditampilkan + peringatan kualitas data eksplisit |
| < 50 | **rekomendasi diblokir** ⇒ `INSUFFICIENT DATA` |

`D_consistent` adalah tambahan yang paling bernilai: ia mengubah audit manual berulang menjadi pemeriksaan otomatis setiap request.

---

## 20. Backtesting Methodology

### 20.1 Yang harus diuji (dan belum pernah)

**Uji utama — kalibrasi bucket skor:**

Untuk setiap hari bursa T dalam periode uji, untuk setiap saham eligible:
1. Hitung LensScore dengan data **yang tersedia pada T saja**
2. Catat forward return pada T+1, T+5, T+10, T+20, T+60, T+120
3. Kelompokkan ke bucket: 90-100, 80-89, 70-79, 60-69, 50-59, < 50

Metrik per bucket per horizon:

| Metrik | Kenapa |
|---|---|
| Mean return | Level dasar |
| Median return | Tahan outlier ARA |
| Return relatif IHSG (alpha) | Yang benar-benar penting |
| Win rate | Konteks, **bukan target** |
| Std dev return | Untuk Sharpe |
| Sharpe & Sortino | Risk-adjusted |
| Max drawdown bucket | Ketahanan |
| Hit rate vs IHSG | Konsistensi |
| False positive rate | Berapa % skor ≥ 80 yang turun > 10% dalam 20 hari |

**Kriteria lulus (harus ditetapkan SEBELUM melihat hasil):**

| Kriteria | Ambang minimum |
|---|---|
| Monotonisitas | Mean alpha 20 hari harus naik monoton dari bucket <50 ke 90-100, dengan maksimal **satu** pelanggaran |
| Spread | Alpha bucket 90-100 dikurangi bucket <50 harus > 0 dan **signifikan secara statistik** (t-stat > 2) |
| Rank IC | Rata-rata Spearman(skor, forward return 20 hari) > 0.03, dengan IR (mean IC / stdev IC) > 0.3 |
| Konsistensi waktu | Rank IC positif di ≥ 60% bulan dalam periode uji |
| Stabilitas | Turnover peringkat top-decile < 40% per bulan |

Kalau **satu pun** gagal, skor belum layak jadi dasar rekomendasi.

**Uji per pilar:** rank IC untuk masing-masing Q/V/G/T/M/F **secara terpisah**. Pilar dengan IC ≈ 0 atau negatif harus dibuang atau dibalik — bukan dipertahankan karena "logikanya masuk akal". Ini juga cara **menentukan bobot** secara empiris: bobot ∝ IC × (1 − korelasi rata-rata dengan pilar lain).

**Uji redundansi:** matriks korelasi antar pilar. Korelasi > 0.7 ⇒ pilar digabung atau salah satu dibuang. Ini yang mencegah kambuhnya double counting.

### 20.2 Yang jangan dijadikan target

Win rate **bukan** tujuan optimasi. Sistem dengan win rate 80% dan rata-rata rugi 4× rata-rata untung adalah sistem yang merugi. Laporkan bersama:

```
Expectancy   = (win_rate × avg_win) − (loss_rate × avg_loss)
Profit Factor = total_untung / total_rugi
Payoff Ratio  = avg_win / avg_loss
```

### 20.3 Backtest strategi (menggantikan simulasi filter yang ada)

Pertahankan mesin `simulate.service.ts` yang sudah benar (eksekusi open D+1, fee, slippage), tapi ganti sinyalnya: **beli top-N LensScore**, jual saat keluar dari top-2N atau saat gerbang keras aktif. Tambahkan:

- **Stop loss berbasis ATR** (2×ATR) dan bandingkan dengan tanpa stop. Data yang sudah ada di repo menyebutkan pengujian 4.705 sampel: stop 5% tersentuh 77% dan memangkas hasil dari +1.34% ke +0.02% (`screener.service.ts:88-93`). Uji ulang dengan stop **berbasis volatilitas**, bukan persentase tetap — hipotesisnya hasilnya berbeda.
- **Rebalance mingguan/bulanan**, bukan harian, untuk menekan biaya.
- **Benchmark**: IHSG, LQ45, dan **equal-weight universe** (yang terakhir paling penting — mengalahkan IHSG bisa saja hanya karena efek small-cap, bukan karena skornya bekerja).

---

## 21. Validation Methodology

### 21.1 Look-ahead bias — yang WAJIB diperbaiki

| Sumber | Status | Tindakan |
|---|---|---|
| Eksekusi di close hari sinyal | **Sudah diperbaiki** | Pertahankan |
| Fundamental TTM Yahoo | **BELUM ADA point-in-time** | Lihat di bawah — ini blocker |
| AdjClose direstatement | Belum ditangani (P1-15) | Gunakan Close mentah + penanganan corporate action eksplisit, atau nyatakan sebagai batasan |
| Universe hari ini | Didokumentasikan | Pertahankan pengungkapannya |
| Indikator | Benar (`windowHistory = history[0..i]`) | Pertahankan |

**Blocker point-in-time fundamental.** Laporan Q2 terbit pertengahan Agustus. Backtest bulan Juli tidak boleh melihatnya. Yahoo `quoteSummary` **hanya memberi TTM saat ini tanpa tanggal publikasi** — sehingga backtest fundamental yang bebas look-ahead **secara teknis tidak mungkin dengan sumber data yang ada sekarang.**

Tiga jalan keluar, urut dari yang paling praktis:

1. **Mulai menyimpan snapshot harian sekarang** (`fundamental_snapshot(ticker, tanggal_ambil, fields...)` di Postgres yang sudah ada). Dalam 12 bulan tersedia data point-in-time asli. Ini yang paling murah dan harus dimulai **hari ini** karena setiap hari yang lewat adalah data yang hilang permanen.
2. **Lag konservatif**: asumsikan laporan kuartalan baru tersedia **45 hari** setelah akhir kuartal (batas OJK untuk laporan tidak diaudit), lalu geser semua data fundamental mundur sesuai itu. Perkiraan kasar, tapi jauh lebih baik daripada tidak sama sekali, dan **harus dinyatakan sebagai perkiraan**.
3. **IDX XBRL / e-reporting** untuk data historis dengan tanggal penyampaian sebenarnya. Paling akurat, paling mahal.

**Sampai salah satu tersedia: backtest hanya boleh dijalankan atas pilar T/M/F (teknikal, momentum, flow), dan hasilnya tidak boleh diklaim memvalidasi pilar Q/V/G.**

### 21.2 Survivorship bias

Sudah diakui jujur di `backtest-limitations.ts`. Mitigasi yang mungkin: `idx_emiten_900.csv` yang sudah ada di repo bisa jadi titik awal untuk membangun daftar konstituen historis, tapi tanpa tanggal delisting itu belum cukup. **Sampai tersedia, nyatakan bahwa seluruh hasil backtest bias optimis** — jangan hanya di catatan kaki.

### 21.3 Out-of-sample & walk-forward

```
Data tersedia: 5 tahun (fetchYahooHistory '5y')

TRAINING    : 2021-01 s/d 2023-12   (36 bulan)  -> tentukan bobot pilar
VALIDATION  : 2024-01 s/d 2024-12   (12 bulan)  -> tune ambang keputusan
OUT-OF-SAMPLE: 2025-01 s/d 2026-08  (20 bulan)  -> SENTUH SEKALI SAJA
```

**Aturan mutlak:** kalau hasil out-of-sample mengecewakan lalu model diubah dan diuji ulang di periode yang sama, periode itu **bukan lagi out-of-sample** dan hasilnya tidak sah. Ini kesalahan paling umum dan paling merusak.

Walk-forward untuk uji robustness:

```
Window: train 24 bulan -> test 6 bulan -> geser 6 bulan -> ulang
Menghasilkan ~6 periode uji independen dari 5 tahun data.
Ukur: stabilitas bobot optimal antar window.
Kalau bobot optimal berayun liar antar window -> model OVERFIT, sederhanakan.
```

### 21.4 Disiplin anti-overfitting

| Aturan | Alasan |
|---|---|
| Maksimal **6 pilar**, maksimal **5 sub-faktor** per pilar | Batasi jumlah parameter |
| Bobot dibulatkan ke kelipatan 5% | Presisi 17.3% adalah ilusi |
| Setiap sub-faktor harus punya **alasan ekonomi tertulis** sebelum diuji | Mencegah data mining |
| Jumlah kombinasi yang diuji **dicatat** | Untuk koreksi multiple-testing |
| Model sederhana menang saat hasilnya berdekatan | Kalau 6 pilar dan 3 pilar memberi IC serupa, pakai 3 |
| Persentil, bukan ambang | Ambang absolut adalah tempat overfitting paling gampang bersembunyi |

---

## 22. Final Recommended Architecture

```
                   UNIVERSE HARIAN (dihitung ulang, bukan daftar manual)
                   filter: ADV20 >= Rp1M/hari, harga >= Rp100, bar >= 200
                                    |
        +---------------------------+---------------------------+
        |                           |                           |
   HARGA/OHLCV               FUNDAMENTAL SNAPSHOT          IHSG + SEKTOR
   (Yahoo, harian)           (disimpan point-in-time)      (^JKSE + indeks IDX)
        |                           |                           |
        +---------------------------+---------------------------+
                                    |
                          [1] DATA VALIDATION
                   uji identitas: PBV≈P/BVPS, PER≈P/EPS, ROE≈EPS/BVPS
                   deteksi mata uang, deteksi outlier
                                    |
                          [2] DATA QUALITY SCORE (0-100)
                                    |
                          [3] ELIGIBILITY GATES
                   suspensi | stale | ARA/ARB | corp action | volatilitas ekstrem
                   -> NOT ELIGIBLE / INSUFFICIENT DATA (BERHENTI DI SINI)
                                    |
                          [4] KLASIFIKASI SEKTOR (IDX-IC)
                                    |
                          [5] HITUNG 6 PILAR
              Q      V      G      T      M      F
              |      |      |      |      |      |
                          [6] NORMALISASI
              persentil lintas-saham; V & G di dalam sektor
                                    |
                          [7] BOBOT + PENGALI
              RAW = 0.20Q+0.20V+0.10G+0.20T+0.15M+0.15F
              LENSSCORE = RAW x RISK_ADJ x LIQ_ADJ
                                    |
        +---------------------------+---------------------------+
        |                           |                           |
   LENSSCORE 0-100          CONFIDENCE 0-100            RISK SCORE 0-100
        |                           |                           |
        +---------------------------+---------------------------+
                                    |
                          [8] REZIM PASAR (IHSG)
                   BULL / SIDEWAYS / BEAR / HIGH-VOL -> geser ambang
                                    |
                          [9] DECISION ENGINE
              STRONG BUY | BUY | HOLD | REDUCE | SELL
                                    |
                          [10] TRADING SETUP (opsional)
              entry / stop ATR+struktur / target RR>=1.5
              -> tidak tampil kalau RR < 1.5
                                    |
                          [11] EXPLANATION
              Angka deterministik SELALU dari [5]-[10].
              LLM HANYA menyusun narasi dari angka itu.
              LLM TIDAK PERNAH menghasilkan angka.
```

**Perubahan arsitektural terpenting dibanding sekarang:**

1. Lima mesin keputusan → **satu**.
2. Ambang absolut → **persentil lintas-saham**.
3. Likuiditas & risiko: dari tidak ada → **gerbang + pengali**.
4. Universe manual → **dihitung harian**.
5. Confidence & Data Quality: dari tidak ada → **kelas utama, mempengaruhi tindakan bukan skor**.
6. Backtest filter → **backtest skor dengan kriteria lulus yang ditetapkan di muka**.

---

## TABEL FORMULA FINAL

Semua bobot & konstanta berlabel **[HIPOTESIS]** wajib di-backtest sebelum dipakai memberi rekomendasi.

| FACTOR | METRIC | FORMULA | NORMALIZATION | WEIGHT | SECTOR ADJ | REGIME ADJ | RISK ADJ | DATA REQUIREMENT | OUTPUT |
|---|---|---|---|---|---|---|---|---|---|
| **QUALITY** | ROIC | `EBIT×(1−0.22)/(debt+equity−cash)` | persentil global | 30% dari Q | bank: ganti ROA | — | — | income stmt + balance sheet | 0-100 |
| | Earnings quality | `OCF / netIncome` | persentil global | 25% dari Q | — | — | — | cash flow stmt | 0-100 |
| | Stabilitas margin | `−stdev(net margin, 5th)` | persentil global | 20% dari Q | — | — | — | 5th income stmt | 0-100 |
| | Interest coverage | `EBIT / beban bunga` | persentil global | 15% dari Q | bank: N/A, renormalisasi | — | — | income stmt | 0-100 |
| | Konsistensi laba | `tahun_laba_positif / 5` | rasio × 100 | 10% dari Q | — | — | — | 5th income stmt | 0-100 |
| | **Pilar Q** | rata-rata tertimbang | — | **20% [HIPOTESIS]** | — | — | — | — | 0-100 |
| **VALUATION** | Earnings Yield | `EPS_ttm / harga` (siklikal: median EPS 5th) | persentil **dalam sektor** | 30% dari V | Energy & Basic Materials pakai EPS ternormalisasi | — | — | EPS, harga | 0-100 |
| | FCF Yield | `FCF / market cap` | persentil dalam sektor | 25% dari V | bank: N/A, renormalisasi | — | — | FCF, mcap | 0-100 |
| | PBV vs implied | `((ROE−g)/(r−g)) / PBV_aktual`, `r = SBN10Y + β×ERP` | persentil dalam sektor | 25% dari V | — | — | — | ROE, PBV, beta, SBN10Y | 0-100 |
| | EV/EBITDA inv | `1 / enterpriseToEbitda` | persentil dalam sektor | 20% dari V | bank: N/A, renormalisasi | — | — | EV, EBITDA | 0-100 |
| | **Pilar V** | rata-rata tertimbang | — | **20% [HIPOTESIS]** | **YA — seluruh persentil dalam sektor** | — | — | — | 0-100 |
| **GROWTH** | Revenue CAGR 3th | `(rev_t/rev_t−3)^(1/3)−1` | persentil dalam sektor | 35% dari G | — | — | — | 3th revenue | 0-100 |
| | EPS CAGR 3th | `(eps_t/eps_t−3)^(1/3)−1` | persentil dalam sektor | 35% dari G | — | — | — | 3th EPS | 0-100 |
| | Konsistensi | `kuartal_YoY_positif / 8` | rasio × 100 | 30% dari G | — | — | — | 8 kuartal | 0-100 |
| | **Pilar G** | rata-rata tertimbang | — | **10% [HIPOTESIS]** | **YA** | — | — | histori ≥ 3th; jika kurang: N/A + renormalisasi | 0-100 |
| **TREND** | Posisi vs MA | `0.5×(P−MA50)/ATR + 0.5×(P−MA200)/ATR` | persentil global | 30% dari T | — | — | — | 200 bar | 0-100 |
| | Slope MA50 | `(MA50_t − MA50_t−20)/MA50_t−20` | persentil global | 25% dari T | — | — | — | 70 bar | 0-100 |
| | ADX(14) | Wilder DI+/DI−/DX standar | persentil global | 25% dari T | — | — | — | 30 bar | 0-100 |
| | Struktur pasar | skor HH/HL vs LH/LL, 5 swing (fractal 5-bar) | −100..100 → 0-100 | 20% dari T | — | — | — | 60 bar | 0-100 |
| | **Pilar T** | rata-rata tertimbang | — | **20% [HIPOTESIS]** | — | — | — | — | 0-100 + label tren |
| **MOMENTUM/RS** | Momentum 12-1 | `P_t−21 / P_t−252 − 1` | persentil global | 30% dari M | — | — | — | 252 bar | 0-100 |
| | RS vs IHSG 3M | `ret_saham_63d − ret_IHSG_63d` | persentil global | 30% dari M | — | — | — | 63 bar + IHSG | 0-100 |
| | RS vs sektor 3M | `ret_saham_63d − ret_sektor_63d` | persentil global | 25% dari M | **YA — butuh return sektor** | — | — | 63 bar + indeks sektor | 0-100 |
| | RSI regime-aware | uptrend: 50-80 optimal; downtrend: RSI rendah **tidak** bullish | pemetaan bersyarat tren | 15% dari M | — | **YA — interpretasi berubah per rezim** | — | 15 bar | 0-100 |
| | **Pilar M** | rata-rata tertimbang | — | **15% [HIPOTESIS]** | — | **YA** | — | — | 0-100 |
| **FLOW** | CMF(20) | `Σ(MFM×Vol)/ΣVol` | persentil global | 35% dari F | — | — | — | 20 bar OHLCV | 0-100 |
| | Slope OBV(20) | regresi linier OBV / harga | persentil global | 30% dari F | — | — | — | 20 bar | 0-100 |
| | Konfirmasi vol-arah | `corr(return_harian, vol_relatif)` 20 hari | persentil global | 20% dari F | — | — | — | 20 bar | 0-100 |
| | Persistensi | `hari_MFM>0 / 20` (**bukan streak**) | rasio × 100 | 15% dari F | — | — | — | 20 bar | 0-100 |
| | **Pilar F** | rata-rata tertimbang | — | **15% [HIPOTESIS]** | — | — | — | — | 0-100 |
| **RISK** | ATR% | `ATR14 / harga × 100` | persentil global | 30% dari R | — | — | — | 15 bar | 0-100 |
| | \|Beta−1\| | `Cov(r_s,r_m)/Var(r_m)` 1th | persentil global | 20% dari R | — | — | — | 250 bar + IHSG | 0-100 |
| | Max drawdown 12M | `min((P−peak)/peak)` | persentil global | 20% dari R | — | — | — | 252 bar | 0-100 |
| | Risiko likuiditas | invers ADV20 | persentil global | 20% dari R | — | — | — | 20 bar vol×harga | 0-100 |
| | Gap risk | `hari_gap>3% / 60` | persentil global | 10% dari R | — | — | — | 60 bar | 0-100 |
| | **RISK SCORE** | rata-rata tertimbang **[HIPOTESIS]** | — | terpisah | — | — | — | — | 0-100 |
| **LIQUIDITY** | ADV20 | `mean(volume×close, 20 hari)` | ambang absolut (Rupiah) | gerbang + pengali | — | — | — | 20 bar | ELIGIBLE / diskon / NOT ELIGIBLE |
| **CONFIDENCE** | Kelengkapan data | sub-faktor tersedia / berlaku | rasio | 35% | **YA — penyebut per sektor** | — | — | — | 0-100 |
| | Kesepakatan pilar | `1 − stdev(6 pilar)/50` | clamp 0-1 | 25% | — | — | — | — | 0-100 |
| | Kedalaman histori | `min(1, bar/500)` | rasio | 20% | — | — | — | — | 0-100 |
| | Kesegaran | 1.0 / 0.6 / 0.2 per umur data | tangga | 20% | — | — | — | timestamp | 0-100 |
| **DATA QUALITY** | Kelengkapan | idem confidence | rasio | 40% | **YA** | — | — | — | 0-100 |
| | Kesegaran | linier turun 5 hari | rasio | 25% | — | — | — | — | 0-100 |
| | Kedalaman | `min(1, bar/500)` | rasio | 20% | — | — | — | — | 0-100 |
| | Konsistensi | uji identitas PBV/PER/ROE, −0.25 per pelanggaran | tangga | 15% | — | — | — | — | 0-100 |
| **LENSSCORE** | Komposit | `(0.20Q+0.20V+0.10G+0.20T+0.15M+0.15F) × RISK_ADJ × LIQ_ADJ` | sudah 0-100 | — | via V & G | via ambang keputusan | **YA — pengali** | semua di atas | **0-100** |
| **DECISION** | Matriks | LensScore × Confidence, ambang digeser rezim | 5 kategori | — | — | **YA** | via LensScore | + gerbang keras | STRONG BUY / BUY / HOLD / REDUCE / SELL |

---

## A. FORMULA SAHAMLENS SAAT INI

```
LENSSCORE = ( TECHNICAL + FUNDAMENTAL + FLOW ) / bobot_tersedia × 100

TECHNICAL (40)
  ma_trend (15) : P>MA20>MA50>MA200 =15 | P>MA20 & P>MA50 =10 | P>MA200 =5
                  | downtrend penuh =0 | sideways =3
  rsi (8)       : 50-70 =8 | 40-50 =4 | 70-78 =5 | >78 =0 | <40 =2
  macd (7)      : hist>0 =7 | hist<0 =0 | hist=0 =3
  volume (10)   : ratio>=2.0 =10 | >=1.5 =8 | >=1.0 =4 | <1.0 =1

FUNDAMENTAL (30)
  valuasi (10)  : PER <10=5 |10-15=4 |15-25=2 |>=25=0 ; PBV <1=5 |<2=3 |>=2=1
  profit  (10)  : ROE >20=5 |>=15=4 |>=8=2 |<8=0 ; RevGrowth >15=5 |>5=3 |>0=1 |<=0=0
  kesehatan(10) : DER <0.5=5 |<1.0=4 |<2.0=2 |>=2.0=0 ; CR >2.0=5 |>=1.5=4 |>=1.0=2 |<1.0=0

FLOW (30)
  tekanan (20)  : CMF20 >20=20 |>5=14 |>=−5=8 |>=−20=3 |<−20=0
  persistensi(10): AKUMULASI & streak>=4 =10 | AKUMULASI =7 | NETRAL =5
                   | DISTRIBUSI =2 | DISTRIBUSI & streak>=4 =0

KATEGORI
  coverage < 55%  -> DATA TIDAK CUKUP
  skor > 75       -> STRONG BUY
  skor >= 60      -> BUY
  skor >= 45      -> HOLD
  selain itu      -> SELL
```

Plus 4 mesin paralel lain (§2.1) yang bisa memberi kesimpulan berbeda untuk saham yang sama.

## B. KELEMAHAN FORMULA SAAT INI

| # | Kelemahan | Bukti |
|---|---|---|
| 1 | 5 mesin keputusan tidak sepakat | §2.1 |
| 2 | 90+ magic number, 0 diturunkan dari data | §4 |
| 3 | Tidak sektor-aware di mesin utama | `scoreValuasi`/`scoreKesehatan` universal |
| 4 | Tidak ada relative strength | grep: alpha hanya di backtest |
| 5 | Tidak ada market regime | breadth hanya untuk tampilan |
| 6 | Tidak ada risk score fungsional | `risk_agent` bobot 0%, field `risk` = string |
| 7 | Tidak ada gerbang likuiditas/ARA/ARB/suspensi | grep: nihil |
| 8 | Double counting tren (4/10 vote) & flow (30 poin + 2 vote) | §7 |
| 9 | Momentum horizon 1D/5D = noise | `momentum-analyzer.ts` |
| 10 | Volume diberi poin tanpa arah | `scoring.service.ts:179-187` |
| 11 | RSI ditafsirkan dua arah berlawanan | §P1-7 |
| 12 | Valuasi memberi skor maksimum ke value trap siklikal | §P1-10 |
| 13 | Asumsi valuasi tunggal untuk semua emiten | `VALUATION_ASSUMPTIONS` |
| 14 | Skor tidak pernah di-backtest | §P0-4 |
| 15 | `coverage_pct` overstate untuk komponen parsial | §P0-2 |
| 16 | AI Pick melewati gerbang DATA TIDAK CUKUP | §P0-1 |
| 17 | TP/CL simetris ⇒ RR selalu 1:1 | §P2-17 |
| 18 | Confidence tidak terkalibrasi, tidak ada di tingkat sistem | §P3-26 |
| 19 | Konsensus beda penyebut antar halaman | §P1-5 |
| 20 | Fundamental hanya snapshot TTM, tanpa deret waktu | §5 |

## C. FORMULA YANG DIREKOMENDASIKAN EXPERT

Lihat §15-19 dan Tabel Formula Final. Ringkasnya:

```
LENSSCORE v2 = (0.20×Quality + 0.20×Valuation + 0.10×Growth
              + 0.20×Trend + 0.15×Momentum&RS + 0.15×Flow)
              × RISK_ADJ(0.70-1.00) × LIQ_ADJ(0.60-1.00)

semua pilar = persentil lintas-saham (V & G di dalam sektor)
di belakang gerbang eligibility + data quality
dilaporkan bersama CONFIDENCE dan RISK SCORE terpisah
keputusan dari matriks skor × confidence, ambang digeser rezim IHSG
```

## D. ALASAN AKADEMIK / FINANSIAL / STATISTIK

| Keputusan | Dasar |
|---|---|
| Persentil, bukan ambang absolut | Menghapus parameter bebas (sumber overfitting terbesar), otomatis terkalibrasi ke level IDX & ke waktu, langsung bisa dinetralkan per sektor, dan hasilnya bisa dijelaskan sebagai peringkat |
| Momentum 12-1 | Jegadeesh & Titman (1993) dan replikasi lintas pasar termasuk emerging: momentum bekerja pada 6-12 bulan; 1 bulan terakhir di-skip karena reversal jangka pendek |
| Relative strength | Yang diminati investor adalah *alpha*, bukan return absolut. Return absolut di bull market memberi sinyal beli ke semua saham |
| Valuasi per sektor | Multiple wajar adalah fungsi ROIC, pertumbuhan, dan intensitas modal — ketiganya berbeda struktural antar sektor. Membandingkan PER bank dengan PER emiten teknologi adalah kesalahan kategori |
| EPS ternormalisasi untuk siklikal | Graham-Dodd (1934) dan Shiller CAPE: laba puncak siklus menghasilkan PER rendah palsu tepat di titik risiko tertinggi. Ini masalah nyata dan besar untuk BEI (batu bara, CPO, nikel) |
| PBV implied = (ROE−g)/(r−g) | Turunan langsung dari model Gordon terhadap nilai buku. Konsisten secara teoritis, tidak seperti `ROE/12×0.85` |
| Earnings Yield, bukan PER | EY linier dan terdefinisi untuk laba negatif; PER meledak di sekitar nol dan menciptakan diskontinuitas |
| Accrual / earnings quality | Sloan (1996): akrual tinggi memprediksi return masa depan rendah. Salah satu anomali paling konsisten dan paling relevan di pasar dengan pengawasan lebih longgar |
| ROIC > ROE | ROE bisa direkayasa dengan leverage. ROIC mengukur efisiensi modal sesungguhnya |
| Risiko sebagai pengali, bukan komponen | Komponen aditif bisa "dibeli" dengan poin dari faktor lain. Untuk risiko dan likuiditas, itu justru kegagalan yang paling ingin dihindari |
| ADX + slope + struktur | Harga di atas MA200 sama sekali tidak membedakan tren kuat dari sideways yang menanjak pelan. ADX mengukur kekuatan, slope mengukur arah, struktur mengukur perilaku pelaku pasar |
| RSI regime-aware | Wilder sendiri menyatakan overbought/oversold hanya bermakna di pasar sideways. Dalam tren kuat RSI bertahan di ekstrem berminggu-minggu |
| Confidence tidak masuk skor | Mencampur "seberapa bagus" dengan "seberapa yakin" membuat skor tidak bisa dibandingkan antar saham |
| Rank IC sebagai kriteria utama | Standar industri untuk mengukur daya prediktif faktor; tahan outlier, tidak bergantung asumsi distribusi |
| Kriteria lulus ditetapkan di muka | Menetapkan ambang setelah melihat hasil adalah p-hacking |

## E. DATA YANG DIBUTUHKAN

| Data | Status | Prioritas |
|---|---|---|
| OHLCV harian | **Tersedia** (Yahoo) | — |
| Fundamental TTM | **Tersedia** (terbatas) | — |
| Beta vs IHSG | **Tersedia & sudah diimplementasi**, belum dipakai di skor | Tinggal dipakai |
| IHSG (^JKSE) | **Tersedia & sudah di-fetch**, belum dipakai di skor | Tinggal dipakai |
| Breadth pasar | **Tersedia**, hanya untuk tampilan | Tinggal dipakai |
| **Fundamental point-in-time** | **TIDAK ADA** | **P0 — mulai snapshot harian hari ini** |
| **ADV20 per saham** | Tidak dihitung runtime (bisa dihitung dari data yang ada) | **P0** |
| **Indeks sektor IDX** (IDXFIN, IDXENERGY, dst.) | Tidak ada | **P1** |
| **Klasifikasi IDX-IC** | Tidak ada (pakai Yahoo) | **P1** |
| **Status suspensi / UMA** | Tidak ada | **P1** |
| **Tabel batas ARA/ARB IDX** | Tidak ada | **P1** — wajib dari peraturan IDX berlaku |
| **Kalender corporate action** | Sebagian (`corporate-calendar.service.ts`) | P1 |
| Laporan keuangan multi-tahun (5th) | Tidak ada (Yahoo hanya TTM) | P1 — untuk Q & G |
| Yield SBN 10Y live | Tidak ada (asumsi statis 6.7%) | P2 |
| Konstituen historis (delisting) | Tidak ada | P2 — untuk survivorship |
| Broker summary / net foreign asing | Tidak tersedia gratis | **Tidak akan tersedia — nyatakan apa adanya** (sudah dilakukan dengan benar) |
| Bid/ask depth | Tidak tersedia | Tidak akan tersedia |
| NIM/NPL/CAR/CASA bank | Tidak tersedia dari Yahoo | Nyatakan sebagai batasan |

## F. HAL YANG BELUM DAPAT DIBUKTIKAN

Daftar ini adalah kejujuran metodologis, bukan kelemahan yang harus disembunyikan.

1. Bahwa LensScore (lama **maupun** baru) punya daya prediktif — belum ada satu pun bukti.
2. Bahwa bobot 20/20/10/20/15/15 lebih baik dari 40/30/30 — belum diuji.
3. Bahwa ambang BUY 65 lebih baik dari 60 — belum diuji.
4. Bahwa pilar Flow (CMF proxy) punya daya prediktif sama sekali — ini yang paling meragukan dari enam pilar, karena ia proxy dari proxy.
5. Bahwa penyesuaian rezim memperbaiki hasil risk-adjusted — plausibel, belum diuji.
6. Bahwa persentil mengalahkan ambang absolut untuk IDX — sangat plausibel secara teori, belum diuji di data IDX.
7. Bahwa 5 tahun data cukup untuk kesimpulan yang stabil — hanya mencakup satu siklus penuh; kesimpulan apa pun akan bergantung rezim.
8. Bahwa fair value dari model manapun di aplikasi ini mendekati nilai intrinsik sesungguhnya — tidak bisa dibuktikan secara prinsip; yang bisa diuji hanya apakah MoS tinggi memprediksi return lebih baik.
9. Bahwa universe 109 saham cukup mewakili peluang IDX — belum diuji.

## G. YANG WAJIB DIBACKTEST

Urutan pelaksanaan:

1. **Kalibrasi bucket skor** — monotonisitas, spread, signifikansi. *Kalau ini gagal, semua yang lain tidak relevan.*
2. **Rank IC per pilar** — Q, V, G, T, M, F **secara terpisah**. Pilar dengan IC ≤ 0 dibuang, bukan dipertahankan.
3. **Matriks korelasi antar pilar** — deteksi double counting sebelum menetapkan bobot.
4. **Sensitivitas bobot** — apakah hasil berubah drastis bila bobot digeser ±5%? Kalau ya, model rapuh.
5. **Sensitivitas ambang** — apakah 60 vs 65 vs 70 mengubah kesimpulan?
6. **Gerbang likuiditas** — apakah Rp 1 M/hari batas yang tepat? Bandingkan hasil per kelompok ADV.
7. **Penyesuaian rezim** — bandingkan hasil dengan dan tanpa.
8. **Stop loss berbasis ATR** vs tanpa stop vs persentase tetap. (Data internal yang ada menunjukkan stop 5% merusak hasil — uji apakah 2×ATR berbeda.)
9. **Kalibrasi confidence** — apakah confidence tinggi benar-benar berkorelasi dengan hit rate lebih baik?
10. **Turnover & biaya** — berapa biaya nyata dari rebalance pada frekuensi yang dipilih?
11. **Walk-forward** — stabilitas bobot optimal antar window.
12. **Out-of-sample terakhir** — dijalankan **satu kali**, tidak boleh diulang setelah model diubah.

## H. PRIORITAS PERUBAHAN

### P0 — Critical (perbaiki sebelum mengklaim rekomendasi apa pun)

| # | Item | Ref |
|---|---|---|
| P0-1 | AI Pick harus menghormati `coverage`/kategori `DATA TIDAK CUKUP` | §P0-1 |
| P0-2 | Perbaiki `coverage_pct` untuk komponen yang tersedia sebagian | §P0-2 |
| P0-3 | Tambahkan gerbang eligibility: likuiditas (ADV20), suspensi, data basi, histori minimum, deteksi ARA/ARB, volatilitas ekstrem | §P0-3, §16.1 |
| P0-4 | **Mulai simpan snapshot fundamental harian ke Postgres hari ini** — setiap hari yang lewat hilang permanen | §21.1 |
| P0-5 | Bangun harness backtest bucket skor + kriteria lulus di muka | §20.1 |
| P0-6 | Jangan tampilkan rekomendasi untuk ticker di luar universe eligible di `/api/stock/[ticker]` | §P0-3 |

### P1 — High

| # | Item | Ref |
|---|---|---|
| P1-1 | Satukan 5 mesin keputusan menjadi satu | §2.1 |
| P1-2 | Ganti ambang absolut dengan persentil lintas-saham | §15.1 |
| P1-3 | Valuasi & growth dinormalisasi **dalam sektor**; EPS ternormalisasi untuk siklikal | §15.3 |
| P1-4 | Tambahkan relative strength vs IHSG & sektor | §15.3 |
| P1-5 | Ganti momentum 1D/5D dengan 12-1 | §8 |
| P1-6 | `scoreVolume` wajib mempertimbangkan arah harga | §P1-8 |
| P1-7 | Satukan interpretasi RSI (regime-aware) di analyzer & scoring | §P1-7 |
| P1-8 | Risk Score fungsional 0-100 sebagai pengali; pakai `beta.service.ts` yang sudah ada | §18 |
| P1-9 | Data Quality Score dengan uji identitas (menangkap bug mata uang otomatis) | §19 |
| P1-10 | Confidence Score tingkat sistem | §17 |
| P1-11 | Samakan daftar analyzer yang masuk `calculateConsensus()` antar halaman | §P1-5 |
| P1-12 | Persistensi flow atas jendela, bukan streak digerbangi volume hari terakhir | §P1-9 |
| P1-13 | Hapus fallback RSI=50/MACD=0/MA=0 di `screener.service.ts` | §P1-14 |
| P1-14 | PBV wajar pakai `(ROE−g)/(r−g)`; cost of equity per emiten dari beta | §P1-12 |
| P1-15 | Universe dihitung harian, bukan daftar manual | §P0-3 |
| P1-16 | Deteksi rezim IHSG dan terapkan ke ambang keputusan | §12, §16.2 |

### P2 — Medium

| # | Item |
|---|---|
| P2-1 | Tambahkan ADX, slope MA, struktur pasar ke Trend |
| P2-2 | Ganti Support/Resistance 20D dengan swing structure |
| P2-3 | Setup transaksi berbasis ATR + struktur, RR minimum 1.5, sembunyikan kalau tidak memenuhi |
| P2-4 | Perbaiki "RR" Breakout Radar yang bisa meledak ke tak hingga |
| P2-5 | Tambahkan ROIC, earnings quality (OCF/NI), interest coverage |
| P2-6 | Tambahkan EV/EBITDA, FCF Yield, Earnings Yield ke valuasi |
| P2-7 | Growth pakai CAGR 3 tahun + konsistensi, bukan satu titik YoY |
| P2-8 | Klasifikasi sektor IDX-IC, bukan Yahoo |
| P2-9 | `estimateFullDayVolume` pakai profil volume intraday berbentuk U, bukan linear |
| P2-10 | Ganti/hapus `momentumScore` di Screener (itu rasio volume, bukan momentum) |
| P2-11 | Ganti label "Moat" atau lengkapi dengan ukuran daya tahan |
| P2-12 | Normalisasi FCF (median 3-5 tahun) sebelum masuk DCF |
| P2-13 | Hilangkan diskontinuitas di ROE 20% pada model PBV/discount rate bank |
| P2-14 | Nyatakan restatement AdjClose di `backtest-limitations.ts` |
| P2-15 | Ambil yield SBN 10Y dari sumber nyata, bukan konstanta |

### P3 — Enhancement

| # | Item |
|---|---|
| P3-1 | Bobot pilar dari optimasi walk-forward (setelah backtest tersedia) |
| P3-2 | Confidence dikalibrasi dari hit rate historis empiris |
| P3-3 | Bangun konstituen historis untuk mengurangi survivorship bias |
| P3-4 | Slippage berbasis likuiditas di simulasi, bukan konstan 0.2% |
| P3-5 | Analisis atribusi: berapa alpha dari tiap pilar |
| P3-6 | Metrik khusus bank (NIM/NPL/CAR/CASA) kalau sumber data ditemukan |
| P3-7 | Sinkronkan kalender bursa dengan hari libur IDX resmi |

---

# "APAKAH FORMULA SAHAMLENS SAAT INI SUDAH LAYAK MENJADI DASAR BUY/HOLD/SELL?"

## **BELUM.**

Jawaban ini tidak didasarkan pada selera, melainkan pada bukti yang bisa diperiksa di source code:

**1. Tidak ada satu pun bukti bahwa skornya bekerja.**
Kriteria paling mendasar untuk sistem rekomendasi adalah: skor lebih tinggi ⇒ hasil risk-adjusted lebih baik. Ini **belum pernah diuji satu kali pun**. Fitur Backtest yang ada menguji kombinasi filter indikator, bukan LensScore. Sampai uji bucket skor dijalankan dan lulus kriteria yang ditetapkan di muka, angka "82/100" adalah pendapat yang diformat seperti pengukuran.

**2. Sistem tidak bisa mengatakan "jangan".**
Tidak ada gerbang likuiditas, suspensi, ARA/ARB, atau volatilitas ekstrem. Saham gorengan yang sedang ARA berturut-turut justru akan mendapat skor **mendekati sempurna** pada komponen teknikal & flow — tepat pada saat paling berbahaya. Ini bukan risiko teoretis; itu perilaku yang bisa dibaca langsung dari `scoreMATrend` + `scoreVolume` + `scoreFlowTekanan`.

**3. Satu pertanyaan, lima jawaban berbeda.**
Lima mesin keputusan dengan lima set ambang berbeda, semuanya ditampilkan sebagai "analisis SahamLens". Pengguna tidak punya cara mengetahui mana yang benar — dan memang tidak ada yang lebih benar, karena tidak satu pun tervalidasi.

**4. Modelnya tidak sesuai karakter pasar Indonesia.**
Valuasi absolut yang mengabaikan sektor akan **secara sistematis** memberi skor tertinggi pada emiten batu bara/CPO/nikel tepat di puncak siklus laba mereka — value trap paling klasik dan paling sering terjadi di BEI. Bank dinilai dengan DER dan current ratio yang tidak berlaku untuk model bisnisnya. Tidak ada IHSG, tidak ada sektor, tidak ada likuiditas, tidak ada corporate action.

**5. Sembilan puluh lebih magic number, nol yang diturunkan dari data.**
Bukan berarti angkanya pasti salah — berarti tidak ada yang tahu apakah benar. Untuk sistem yang memberi rekomendasi keuangan, itu sama saja.

---

### Yang sudah benar dan harus dipertahankan

Penting untuk dicatat bahwa fondasinya **jauh lebih baik dari kebanyakan aplikasi sejenis**:

- Tidak ada data karangan di jalur keputusan. `Math.random()`/`seedRandom()` sudah hilang, dan komentar kode secara aktif menolak menghidupkannya kembali.
- Prinsip `null` untuk data hilang alih-alih angka default sudah tertanam kuat (walau ada satu call-site terlewat).
- RSI Wilder, EMA seed-SMA, AdjClose — implementasi indikator sudah baku dan terpusat.
- Eksekusi backtest di open D+1 + fee + slippage — bagian terkuat dari seluruh sistem.
- Batasan dinyatakan terbuka: survivorship bias, "proxy bukan data broker asing", "asumsi model bukan target analis", "isProxy: true".
- Analisis yang menghapus lapisan bonus AI Pick menunjukkan pemahaman yang benar tentang korelasi sinyal.
- Kebijakan "LLM tidak boleh menghasilkan angka" ditegakkan konsisten di seluruh prompt.

**Kesimpulan:** kejujuran data sudah baik. Yang belum ada adalah **model kuantitatif yang tervalidasi**. Jarak dari kondisi sekarang ke sistem yang layak bukanlah penulisan ulang total — melainkan (a) menutup 6 item P0, (b) mengganti ambang dengan persentil, (c) menambahkan gerbang eligibility, dan (d) **membuktikan lewat backtest bahwa skornya benar-benar bekerja**.

Sampai (d) selesai, posisi paling jujur adalah menyajikan SahamLens sebagai **alat penyaring dan penjelas data**, bukan sebagai pemberi rekomendasi BUY/HOLD/SELL.

---

**STOP — TIDAK ADA IMPLEMENTASI SAMPAI ADA PERSETUJUAN.**

Dokumen ini murni review & desain. Tidak ada source code yang diubah. Menunggu keputusan Anda mengenai:
1. Apakah arah desain di §15-19 disetujui?
2. Apakah mulai dari P0 saja dulu, atau sekaligus P0+P1?
3. Apakah snapshot fundamental harian (P0-4) boleh mulai dijalankan segera? Ini satu-satunya item yang **biayanya naik setiap hari ditunda**.
