# SAHAMLENS QUANT IMPLEMENTATION BLUEPRINT V2

**Tanggal:** 2026-08-05
**Prasyarat:** `SAHAMLENS_QUANT_EXPERT_REVIEW_2026-08-05.md` (Tahap 1)
**Status:** SPESIFIKASI — nol baris source code diubah.
**Pembaca sasaran:** coding agent yang akan mengimplementasikan, tanpa perlu menebak maksud.

## Konvensi label

Setiap rekomendasi di dokumen ini wajib berlabel salah satu dari:

| Label | Arti | Boleh diimplementasikan tanpa riset tambahan? |
|---|---|---|
| **[BUG FIX]** | Kesalahan implementasi jelas | Ya |
| **[STRUCTURAL]** | Perubahan arsitektur yang jelas lebih baik secara engineering | Ya |
| **[HYPOTHESIS]** | Formula/bobot/threshold belum terbukti | **TIDAK — implementasi boleh, klaim hasil TIDAK** |
| **[DATA BLOCKER]** | Tidak valid dengan data sekarang | **TIDAK** |

Coding agent: perlakukan `[HYPOTHESIS]` sebagai *nilai default yang dapat dikonfigurasi*, bukan kebenaran. Setiap angka `[HYPOTHESIS]` **wajib** hidup di file konfigurasi terpisah, bukan tersebar sebagai literal di dalam fungsi.

---

## 1. EXECUTIVE DECISION

### Keputusan yang diambil di blueprint ini

| # | Keputusan | Label |
|---|---|---|
| 1 | Dibuat modul baru `modules/decision/` sebagai **satu-satunya** authoritative decision engine. Semua halaman membaca dari sini. | [STRUCTURAL] |
| 2 | `calculateScore()` (v1) **tidak dihapus**. Ia berjalan paralel di belakang flag sampai v2 lulus acceptance criteria. | [STRUCTURAL] |
| 3 | Eligibility dievaluasi **sebelum** scoring, di modul terpisah `modules/eligibility/`. | [STRUCTURAL] |
| 4 | Data Quality dihitung dari **sub-faktor**, bukan komponen — ini memperbaiki P0-2 secara struktural. | [BUG FIX] |
| 5 | Normalisasi memakai **percentile rank lintas-saham**. Konsekuensinya LensScore v2 adalah skor **relatif**, bukan absolut — dan ini harus dinyatakan ke pengguna. | [STRUCTURAL] |
| 6 | Market regime menggeser **ambang keputusan**, bukan raw score. | [STRUCTURAL] |
| 7 | Risk & Liquidity = **gate + multiplier**, bukan pilar aditif. | [STRUCTURAL] |
| 8 | Data Quality **tidak** mempengaruhi LensScore (hindari double punishment). Ia mempengaruhi Confidence dan gate. | [STRUCTURAL] |
| 9 | Arsip fundamental point-in-time dibangun sendiri (Option B) — biayanya jauh lebih murah dari perkiraan Tahap 1 karena cron-nya sudah ada. | [STRUCTURAL] |
| 10 | Seluruh bobot, ambang, dan konstanta v2 berlabel `[HYPOTHESIS]` sampai backtest lulus. | — |

### Yang TIDAK diputuskan di sini (menunggu data)

- Bobot final pilar — `[HYPOTHESIS]`
- Ambang keputusan final — `[HYPOTHESIS]`
- Apakah pilar Flow layak dipertahankan sama sekali — **BELUM TERBUKTI**
- Apakah momentum 12-1 bekerja di IDX — **BELUM TERBUKTI**

### Temuan baru yang mengubah rencana Tahap 1

**Cron `app/api/cron/fundamental-snapshot/route.ts` SUDAH ADA.** Ia menarik 6 field fundamental untuk 109 ticker setiap hari, lalu menulisnya ke Redis lewat `writeFundamentalSnapshot()` dengan TTL 24 jam — **menimpa**, bukan mengarsip (`shared/cache/ai-pick-cache.ts:36-38`).

Artinya P0-4 bukan "bangun pipeline baru", melainkan **"tambahkan satu INSERT ke cron yang sudah jalan"**. `shared/database/schema.service.ts` sudah memakai pola `CREATE TABLE IF NOT EXISTS` yang idempoten & aditif, jadi penambahan tabel aman. Effort turun dari perkiraan hari ke **jam**.

Ini mengubah prioritas: P0-4 naik menjadi item paling mendesak sekaligus paling murah.

---

## 2. P0 REMEDIATION SPECIFICATION

### P0-1 — AI Pick meloloskan saham berstatus `DATA TIDAK CUKUP`

| Aspek | Isi |
|---|---|
| **Label** | [BUG FIX] |
| **Root cause** | `rankAiPicks()` menyaring hanya `finalScore >= MIN_SCORE`. Field `coverage` dibawa sampai item (`ai-pick.service.ts:150`) tapi tidak pernah dievaluasi. Kategori dari `getKategori()` tidak pernah ikut dibawa dari `scanAiPickScores()` sama sekali — `ScoredStock` tidak punya field `kategori`. |
| **Affected files** | `modules/recommendation/service/ai-pick.service.ts` (tipe `ScoredStock`, `AiPickItem`, `rankAiPicks`), `modules/recommendation/service/ai-pick-scan.service.ts` (`scoreOne` — perlu meneruskan `scoring.kategori`), `shared/cache/ai-pick-cache.ts` (bentuk cache berubah) |
| **Behavior saat ini** | Saham dengan `coverage_pct` 40% (fundamental & flow kosong, hanya teknikal) yang teknikalnya kuat mendapat `total_score` sampai 100 karena renormalisasi, lalu menempati peringkat teratas "hari ini beli apa". `calculateScore()` untuk saham yang sama mengembalikan `kategori: 'DATA TIDAK CUKUP'`. |
| **Behavior seharusnya** | Item dengan `kategori === 'DATA TIDAK CUKUP'` **tidak pernah** masuk daftar. Tidak diberi peringkat rendah — **dikeluarkan**. |
| **Proposed fix** | 1. Tambah `kategori: ScoringResult['kategori']` ke tipe `ScoredStock`. 2. Isi dari `scoring.kategori` di `scoreOne()`. 3. Di `rankAiPicks()`: `.filter(i => i.kategori !== 'DATA TIDAK CUKUP' && i.finalScore >= MIN_SCORE)`. 4. Untuk entri cache lama tanpa field `kategori` (TTL 3 hari), turunkan ulang dari `coverage`: `coverage != null && coverage < 55 ⇒ perlakukan sebagai DATA TIDAK CUKUP`. Kalau `coverage` juga null (entri sangat lama) ⇒ **keluarkan** (fail-closed). |
| **Risiko regresi** | Daftar AI Pick bisa mengecil, mungkin sampai kosong pada hari tertentu. Ini **perilaku yang benar**, bukan regresi — tetapi UI (`app/breakout-radar/page.tsx`, `app/home/page.tsx`) harus punya empty state yang jujur: "Tidak ada saham yang lolos ambang kualitas + kelengkapan data hari ini." Jangan tampilkan daftar kosong tanpa penjelasan. |
| **Unit test** | `ai-pick.service.test.ts`: (a) item `kategori: 'DATA TIDAK CUKUP'` dengan `finalScore: 95` tidak muncul di hasil; (b) item tanpa field `kategori` dengan `coverage: 40` tidak muncul; (c) item tanpa `kategori` dan tanpa `coverage` tidak muncul; (d) item `kategori: 'BUY'` `finalScore: 60` muncul; (e) hasil kosong mengembalikan `[]`, tidak melempar. |
| **Integration test** | `scanAiPickScores()` dengan snapshot fundamental `null` untuk seluruh universe ⇒ `rankAiPicks()` mengembalikan `[]` (karena semua coverage < 55). |
| **Acceptance criteria** | Tidak ada satu pun item di `GET /api/ai-pick` yang `coverage < 55` atau `kategori === 'DATA TIDAK CUKUP'`. Diverifikasi lewat assert di test, bukan inspeksi manual. |

### P0-2 — `coverage_pct` melebih-lebihkan kelengkapan data

| Aspek | Isi |
|---|---|
| **Label** | [BUG FIX] |
| **Root cause** | `combine()` (`scoring.service.ts:319-329`) menghitung `declaredMax` dari `components.reduce((s,c) => s + c.max, 0)`. Tetapi `scoreValuasi`/`scoreProfitabilitas`/`scoreKesehatan` **mengecilkan `c.max` sendiri** ketika satu sub-metrik hilang (`scoring.service.ts:194-196`). Akibatnya `declaredMax` ikut menyusut dan rasio `rawMax/declaredMax` tetap 1.0 — kehilangan sub-faktor menjadi tak terlihat. |
| **Affected files** | `modules/technical/service/scoring.service.ts` (`combine`, `scoreValuasi`, `scoreProfitabilitas`, `scoreKesehatan`, `calculateScore`), `modules/technical/service/__tests__/scoring.service.test.ts` |
| **Behavior saat ini** | Emiten rugi (PER null, PBV ada), ROE+growth ada, DER+CR ada ⇒ `rawMax = 25`, `declaredMax = 25` ⇒ `availableMax = 30` ⇒ **coverage fundamental dilaporkan 100%** padahal separuh blok valuasi hilang. Coverage total bisa melaporkan 100% dengan 5 dari 13 sub-faktor hilang. |
| **Behavior seharusnya** | `coverage_pct` = proporsi **bobot sub-faktor** yang benar-benar punya data, terhadap bobot sub-faktor yang **berlaku**. Contoh di atas seharusnya melaporkan coverage fundamental = 25/30 = 83%, bukan 100%. |
| **Proposed fix (minimal, untuk v1)** | Pisahkan dua angka di dalam `Component`: `max` (bobot yang **dideklarasikan** untuk komponen ini, selalu konstan: 10/10/10) dan `availableMax` (bobot sub-faktor yang punya data). `combine()` memakai `availableMax` untuk pembilang & `max` untuk penyebut. Ubah tanda tangan: `interface Component { key; score; availableMax; declaredMax; available; reason }`. |
| **Proposed fix (final, v2)** | Ganti seluruhnya dengan **factor registry** (§6.2): setiap sub-faktor adalah entri terdaftar dengan bobot sendiri, dan kelengkapan dihitung sekali di satu tempat. Cacat kelas ini tidak bisa kambuh karena tidak ada lagi komponen komposit yang menyembunyikan sub-faktornya. |
| **Risiko regresi** | `coverage_pct` akan **turun** untuk banyak saham. Saham yang tadinya coverage 100% bisa jadi 78%. Beberapa yang tadinya di atas 55% bisa jatuh di bawahnya ⇒ berubah menjadi `DATA TIDAK CUKUP` ⇒ hilang dari AI Pick. **Ini adalah tujuan perbaikan**, tapi harus dikomunikasikan: jangan dianggap "AI Pick rusak". Ukur dampaknya dulu (§ Phase 0 acceptance). |
| **Unit test** | (a) Semua sub-faktor ada ⇒ coverage 100. (b) PER null, sisanya lengkap ⇒ coverage **95** (5 dari 100 bobot hilang), bukan 100. (c) Seluruh blok valuasi null ⇒ coverage 90. (d) Seluruh fundamental null ⇒ coverage 70. (e) Hanya teknikal ⇒ coverage 40 ⇒ kategori `DATA TIDAK CUKUP`. |
| **Integration test** | Fixture emiten rugi (PER null) diverifikasi menghasilkan coverage < 100 di `GET /api/stock/[ticker]`. |
| **Acceptance criteria** | Untuk setiap kombinasi ketersediaan sub-faktor, `coverage_pct` sama persis dengan `(Σ bobot sub-faktor tersedia / Σ bobot sub-faktor berlaku) × 100`. Diuji secara ekshaustif atas 2^13 kombinasi lewat property test, atau minimal 10 kombinasi representatif. |

### P0-3 — Belum ada centralized eligibility gate

| Aspek | Isi |
|---|---|
| **Label** | [STRUCTURAL] (arsitektur) + [DATA BLOCKER] (sebagian gate) |
| **Root cause** | Tidak pernah ada lapisan kelayakan. Yang ada hanya (a) daftar universe statis yang disalin manual, (b) `MIN_MARKET_CAP` di satu service yang di-bypass kalau data null, (c) `coverage < 55%`. `GET /api/stock/[ticker]` menerima ticker apa pun tanpa penyaringan. |
| **Affected files** | Semua entry point scoring: `app/api/stock/[ticker]/route.ts`, `modules/recommendation/service/recommendation.service.ts`, `modules/recommendation/service/ai-pick-scan.service.ts`, `modules/market/service/screener.service.ts`, `modules/ai/service/orchestrator.service.ts`, `app/api/council/route.ts` |
| **Behavior saat ini** | Saham gorengan yang ARA berturut-turut memperoleh `ma_trend` 15/15 (uptrend sempurna), `volume` 10/10 (rasio > 2x), `flow_tekanan` 20/20 (CMF tinggi), `flow_persistensi` 10/10 (streak) — yaitu skor teknikal + flow **mendekati sempurna tepat pada saat paling berbahaya**. Tidak ada mekanisme apa pun untuk menolak. |
| **Behavior seharusnya** | `evaluateEligibility()` dijalankan sebelum scoring. Status non-ELIGIBLE menghentikan scoring (untuk gate keras) atau menekan rekomendasi (untuk gate lunak) — spesifikasi lengkap di §5. |
| **Proposed fix** | Modul baru `modules/eligibility/` (§5). Semua entry point wajib melewatinya. Ditegakkan lewat tipe: fungsi scoring v2 hanya menerima input bertipe `EligibleStockInput`, yang **hanya bisa dikonstruksi** oleh `evaluateEligibility()`. Ini membuat "lupa memanggil gate" menjadi compile error, bukan bug diam-diam. |
| **Risiko regresi** | Sebagian ticker yang sekarang bisa dianalisis akan berubah menjadi `NOT ELIGIBLE`. Halaman detail saham harus tetap menampilkan **data & indikator** (pengguna berhak melihat), hanya **rekomendasinya** yang diganti status. Jangan mengembalikan HTTP 4xx — kembalikan payload lengkap dengan `decision.status`. |
| **Unit test** | Satu test per gate, dengan fixture yang memicunya persis: histori 199 bar ⇒ `INSUFFICIENT_HISTORY`; bar terakhir 5 hari bursa lalu ⇒ `STALE_DATA`; ADV20 Rp 800 juta ⇒ `LOW_LIQUIDITY`; 3 hari volume 0 ⇒ `SUSPENDED_OR_NOT_TRADED`; ATR% 18 ⇒ `EXTREME_VOLATILITY`; 2 hari return +24% close=high ⇒ `ABNORMAL_PRICE_MOVEMENT`. Plus test urutan prioritas kalau beberapa gate aktif bersamaan. |
| **Integration test** | Fixture saham tidak likuid melewati pipeline penuh ⇒ `decision.status === 'NOT_ELIGIBLE'`, `decision.action === null`, `lensScore` tetap ada tapi ditandai `advisory: false`. |
| **Acceptance criteria** | Tidak ada jalur kode yang bisa menghasilkan `action ∈ {STRONG BUY, BUY}` ketika `eligibility.status !== 'ELIGIBLE'`. Ditegakkan tipe + satu integration test per gate. |

### P0-4 — LensScore belum pernah divalidasi

| Aspek | Isi |
|---|---|
| **Label** | [STRUCTURAL] (harness) + [DATA BLOCKER] (untuk pilar fundamental) |
| **Root cause** | `modules/backtest/` mensimulasikan **kombinasi filter indikator biner** (`allBullish(day, filters)`), bukan skor. Tidak ada kode yang menghitung forward return per bucket skor, rank IC, atau out-of-sample split. |
| **Affected files** | Baru: `modules/backtest/service/factor-validation.service.ts`, `modules/backtest/service/score-history.service.ts`. Diperluas: `modules/backtest/service/precompute.service.ts` (harus menyimpan skor historis, bukan hanya keputusan indikator). |
| **Behavior saat ini** | Angka "82/100" ditampilkan tanpa satu pun bukti bahwa 82 lebih baik dari 62. |
| **Behavior seharusnya** | Harness yang, untuk setiap hari bursa T dalam periode uji, menghitung LensScore dari data yang tersedia pada T saja, lalu mengukur forward return T+1/5/20/60/120. Kriteria lulus ditetapkan **sebelum** melihat hasil (§19). |
| **Proposed fix** | §18 (arsitektur backtest v2). **Prasyarat mutlak:** arsip fundamental point-in-time (§17), tanpa itu hanya pilar T/M/F yang bisa divalidasi. |
| **Blocker** | Pilar Q/V/G **TIDAK BISA** divalidasi secara historis dengan data hari ini. `DATA BLOCKER`. Mitigasi: mulai arsip sekarang; sementara itu jalankan validasi T/M/F saja dan **jangan klaim** hasilnya memvalidasi Q/V/G. |
| **Unit test** | `factor-validation.service.test.ts` dengan deret sintetis berhasil-diketahui: skor yang sengaja dibuat berkorelasi sempurna dengan forward return harus menghasilkan rank IC ≈ 1.0; skor acak harus menghasilkan IC ≈ 0. Ini menguji harness-nya, bukan modelnya. |
| **Integration test** | Jalankan bucket test atas data 6 bulan; verifikasi output berisi seluruh metrik wajib dan jumlah observasi per bucket dilaporkan. |
| **Acceptance criteria** | Harness menghasilkan laporan reproducible (manifest §25) yang memuat: n observasi per bucket, mean/median forward return per bucket per horizon, rank IC + IR, dan p-value spread top-vs-bottom bucket. |

### P0-5 (baru) — Arsip fundamental point-in-time belum ada, dan setiap hari yang lewat hilang permanen

| Aspek | Isi |
|---|---|
| **Label** | [STRUCTURAL] |
| **Root cause** | `writeFundamentalSnapshot()` menulis ke satu key Redis dengan TTL 24 jam (`shared/cache/ai-pick-cache.ts:36-38`). Setiap eksekusi cron **menimpa** hari sebelumnya. |
| **Affected files** | `shared/database/schema.service.ts` (tabel baru), `app/api/cron/fundamental-snapshot/route.ts` (tambah INSERT), baru: `modules/fundamental/repository/fundamental-history.repository.ts` |
| **Behavior seharusnya** | Cron yang sama, selain menulis cache, melakukan `INSERT ... ON CONFLICT DO NOTHING` ke tabel append-only dengan kunci `(ticker, observed_date)`. |
| **Kenapa mendesak** | Ini satu-satunya item di seluruh blueprint yang **biayanya naik setiap hari ditunda**. Data yang tidak disimpan hari ini tidak bisa diperoleh kembali dengan cara apa pun. |
| **Effort** | Rendah — satu tabel, satu repository, ~15 baris di cron yang sudah berjalan. |
| **Unit test** | Repository: insert idempoten (dua kali insert tanggal sama ⇒ satu baris); pembacaan `asOf(date)` mengembalikan baris terbaru dengan `observed_date <= date`. |
| **Acceptance criteria** | Setelah 1 hari: 109 baris. Setelah 30 hari: ~109 × 22 baris (hari bursa). Query `asOf('2026-09-01')` mengembalikan snapshot yang benar. |

---

## 3. TARGET ARCHITECTURE

### 3.1 Struktur modul

```
modules/
  eligibility/                        [BARU]
    index.ts
    constants/eligibility.constants.ts      <- semua threshold [HYPOTHESIS]
    service/eligibility.service.ts          <- evaluateEligibility()
    service/abnormal-movement.service.ts    <- deteksi kandidat (data-only)
    service/auto-rejection.service.ts       <- konfirmasi ARA/ARB dari ruleset
    types/eligibility.types.ts

  factor/                             [BARU]
    index.ts
    registry/factor-registry.ts             <- SATU sumber kebenaran sub-faktor
    registry/sector-applicability.ts        <- faktor mana berlaku untuk sektor mana
    compute/quality.factors.ts
    compute/valuation.factors.ts
    compute/growth.factors.ts
    compute/trend.factors.ts
    compute/momentum.factors.ts
    compute/flow.factors.ts
    normalize/percentile.ts                 <- normalisasi lintas-saham
    types/factor.types.ts

  decision/                           [BARU]
    index.ts
    constants/lensscore.config.ts           <- SEMUA bobot & ambang [HYPOTHESIS]
    service/lensscore.service.ts            <- komposisi pilar -> LensScore
    service/data-quality.service.ts
    service/risk.service.ts
    service/liquidity.service.ts
    service/confidence.service.ts
    service/market-regime.service.ts
    service/decision-engine.service.ts      <- AUTHORITATIVE
    service/score-trace.service.ts          <- observability
    types/decision.types.ts

  sector/                             [BARU]
    constants/idx-ic-mapping.ts             <- pemetaan manual universe eligible
    service/sector-classifier.service.ts
```

### 3.2 Pipeline authoritative

```
                      evaluateStock(ticker, asOf?)
                                 |
  [A] LOAD  ------------------------------------------------
      OHLCV (Yahoo, >=2y)  |  Fundamental (snapshot as-of)  |  IHSG  |  Sector
                                 |
  [B] evaluateEligibility(loaded)
      -> EligibilityResult { status, reasonCodes[], blocking: boolean }
      -> jika blocking: BERHENTI. Kembalikan payload data + status. Tanpa skor.
                                 |
  [C] computeDataQuality(loaded, sector)
      -> DataQuality { score, completeness, freshness, depth, consistency, missing[] }
      -> jika score < DQ_MIN_SCORING: BERHENTI. status = INSUFFICIENT_DATA.
                                 |
  [D] classifySector(ticker, yahooSector)  -> IdxIcSector | 'UNCLASSIFIED'
                                 |
  [E] computeFactors(loaded, sector)
      -> FactorValues { [factorId]: number | null }   (nilai MENTAH, belum dinormalisasi)
                                 |
  [F] normalize(FactorValues, universeContext)
      -> FactorScores { [factorId]: 0..100 | null }   (percentile rank)
                                 |
  [G] composePillars(FactorScores, sector)
      -> Pillars { Q, V, G, T, M, F }  masing-masing 0..100 | null
         bobot sub-faktor direnormalisasi atas yang tersedia & applicable
                                 |
  [H] computeRisk(loaded, universeContext)      -> RiskScore 0..100
      computeLiquidity(loaded, universeContext) -> LiquidityScore + ADV20
                                 |
  [I] rawLensScore = Σ w_pillar × pillar   (bobot direnormalisasi atas pilar tersedia)
      lensScore = raw × riskAdj × liqAdj
                                 |
  [J] computeConfidence(dataQuality, pillars, lensScore, thresholds)
                                 |
  [K] classifyMarketRegime(ihsg, breadth)  -> MarketRegime
                                 |
  [L] decide(lensScore, confidence, risk, eligibility, regime)
      -> Decision { status, action, reasonCodes[], advisory: boolean }
                                 |
  [M] buildScoreTrace(semua di atas)  -> ScoreTrace (observability, §24)
                                 |
                          StockDecision
```

### 3.3 Kontrak tipe utama

```ts
// modules/decision/types/decision.types.ts

export type EligibilityStatus =
  | 'ELIGIBLE'
  | 'INSUFFICIENT_DATA'
  | 'INSUFFICIENT_HISTORY'
  | 'STALE_DATA'
  | 'LOW_LIQUIDITY'
  | 'SUSPENDED_OR_NOT_TRADED'
  | 'EXTREME_VOLATILITY'
  | 'ABNORMAL_PRICE_MOVEMENT'
  | 'CORPORATE_ACTION_REVIEW';

export type DecisionAction =
  | 'STRONG_BUY' | 'BUY' | 'HOLD' | 'REDUCE' | 'SELL';

export interface StockDecision {
  ticker: string;
  asOf: string;                  // ISO, tanggal data yang dipakai (BUKAN Date.now())
  modelVersion: string;          // §25

  eligibility: {
    status: EligibilityStatus;
    reasonCodes: string[];
    blocking: boolean;
  };

  dataQuality: {
    score: number;               // 0-100
    completeness: number;
    freshness: number;
    depth: number;
    consistency: number;
    missingFactors: string[];    // factorId yang tidak tersedia
    inconsistencies: string[];   // hasil uji identitas
  };

  sector: { idxIc: string; source: 'manual' | 'yahoo' | 'unclassified' };

  pillars: {
    quality: number | null;
    valuation: number | null;
    growth: number | null;
    trend: number | null;
    momentum: number | null;
    flow: number | null;
  };

  lensScore: {
    raw: number;                 // sebelum pengali
    riskAdjustment: number;      // 0.70 - 1.00
    liquidityAdjustment: number; // 0.60 - 1.00
    final: number;               // 0-100
  };

  risk: { score: number; label: 'RENDAH'|'MENENGAH'|'TINGGI'|'SANGAT TINGGI' };
  liquidity: { adv20Idr: number; score: number };
  confidence: { score: number; components: Record<string, number> };
  marketRegime: { state: string; asOf: string };

  decision: {
    /** null kalau tidak layak diberi rekomendasi. TIDAK PERNAH di-default ke 'HOLD'. */
    action: DecisionAction | null;
    /** false = angka boleh ditampilkan, rekomendasi TIDAK boleh ditampilkan */
    advisory: boolean;
    reasonCodes: string[];
    explanation: string;         // deterministik, bukan LLM
  };

  trace?: ScoreTrace;            // hanya kalau diminta / di lingkungan dev
}
```

**Aturan wajib untuk coding agent:**
1. `decision.action` bertipe `DecisionAction | null`. **Jangan pernah** memberi nilai default `'HOLD'` untuk kasus gagal. `null` berarti tidak dinilai.
2. `asOf` selalu tanggal **data**, bukan `Date.now()`. Ini prasyarat backtest.
3. Setiap field numerik yang bisa tidak tersedia bertipe `number | null`. Tidak ada `?? 0`, `?? 50`, `?? 15500`.

---

## 4. SINGLE DECISION ENGINE

### 4.1 Authoritative engine

**`modules/decision/service/decision-engine.service.ts` → `evaluateStock()`**

Ini satu-satunya fungsi yang boleh menghasilkan `STRONG BUY / BUY / HOLD / REDUCE / SELL`.

Semua halaman membaca dari sini. Analyzer individual tetap ada untuk explainability, tetapi **dilarang** mengeluarkan label yang terbaca sebagai rekomendasi.

### 4.2 Migration map

| OLD ENGINE | NEW ROLE | Label | Fase |
|---|---|---|---|
| `calculateScore()` (`scoring.service.ts`) | **Dipertahankan sebagai v1** selama shadow mode. Setelah v2 lulus acceptance: **deprecated**, lalu dihapus. Komponen internalnya (scoreMATrend, scoreRsi, …) tidak diangkat ke v2 — v2 punya factor registry sendiri. | [STRUCTURAL] | Phase 6 |
| `calculateConsensus()` (`consensus.service.ts`) | **Diubah menjadi supporting signal / explainability**. Tetap menghitung vote, tetapi **field `kategori` dan `konsensus` yang berbunyi "STRONG BUY (80%)" dihapus**. Diganti label deskriptif: `"8 dari 10 indikator teknikal bullish"`. Ia tidak boleh lagi mengeluarkan kata BUY/SELL. Sebagai efek samping, ini juga menutup P1-5 (penyebut berbeda antar halaman) karena tidak ada lagi keputusan yang bergantung padanya. | [STRUCTURAL] | Phase 5 |
| `scoreStock()` (`screener.service.ts`) | **Deprecated & dihapus.** Diganti: Screener mengurutkan berdasarkan LensScore v2, dan profil risiko (Konservatif/Moderat/Agresif) menjadi **preset bobot pilar** di atas mesin yang sama, bukan formula terpisah. Lihat §4.3. | [STRUCTURAL] | Phase 5 |
| `runMultiAgentOrchestrator()` (`orchestrator.service.ts`) | **Diubah menjadi lapisan presentasi.** 9 kartu "agen" tetap ada di UI, tapi isinya menjadi rendering dari 6 pilar + risk + liquidity + data quality. `decisionFromScore()` dan `ORCHESTRATOR_SCORE_THRESHOLDS` **dihapus** — `decision` diambil dari Decision Engine. Ini menghapus satu set ambang duplikat sepenuhnya. | [STRUCTURAL] | Phase 5 |
| `analyzeSymbolForBreakout()` (`breakout.service.ts`) | **Dipertahankan sebagai event/tag detector saja.** Sudah searah dengan keputusan yang benar di `ai-pick.service.ts` (sinyal jadi tag, bukan poin). Yang **dihapus**: field `rr` (bukan risk/reward, bisa meledak ke tak hingga — §16) dan skor 0-8 sebagai angka yang ditampilkan ke pengguna. Sinyal `GOLDEN CROSS` / `VOL SPIKE` tetap ditampilkan sebagai label. | [BUG FIX] + [STRUCTURAL] | Phase 5 |
| `calculateIntrinsicValue()` / `calculateDcfModel()` | **Dipertahankan**, tetapi outputnya diberi nama `fairValueModel`, bukan "target". Tidak masuk LensScore secara langsung — masuk lewat sub-faktor valuasi `pbv_vs_implied` yang punya definisi sendiri. Menghindari double counting valuasi. | [STRUCTURAL] | Phase 2 |
| `momentumScore()` / `riskScore()` (`lib/utils/lens-score-breakdown.ts`) | **Dihapus.** Digantikan pilar Momentum dan Risk Score v2. | [STRUCTURAL] | Phase 5 |

### 4.3 Profil risiko Screener setelah migrasi

Alih-alih formula terpisah, profil menjadi preset bobot pilar di atas mesin yang sama:

| Profil | Q | V | G | T | M | F | Catatan |
|---|---|---|---|---|---|---|---|
| Konservatif | 30 | 25 | 5 | 15 | 10 | 15 | + `riskAdj` diperkuat (rentang 0.55–1.00) |
| Moderat (default) | 20 | 20 | 10 | 20 | 15 | 15 | Bobot dasar |
| Agresif | 10 | 10 | 20 | 25 | 25 | 10 | + `riskAdj` dilemahkan (rentang 0.85–1.00) |

**Label: [HYPOTHESIS].** Ketiganya wajib divalidasi terpisah — profil Agresif yang tidak menghasilkan return risk-adjusted lebih baik dari Moderat tidak layak ditawarkan.

**Konsekuensi penting:** skor antar profil **tidak dapat dibandingkan langsung**. UI wajib menyatakan profil yang aktif di samping angkanya.

### 4.4 Aturan konsistensi yang wajib ditegakkan

```
INVARIAN 1: Untuk (ticker, asOf) yang sama, decision.action identik di
            SELURUH halaman. Diuji lewat integration test yang memanggil
            setiap route dan membandingkan field-nya.

INVARIAN 2: Tidak ada modul selain decision-engine yang boleh mengembalikan
            string 'STRONG BUY' | 'BUY' | 'SELL' | 'STRONG SELL' | 'REDUCE'.
            Ditegakkan lewat lint rule / grep test di CI.

INVARIAN 3: decision.action !== null  =>  eligibility.status === 'ELIGIBLE'
            && dataQuality.score >= DQ_MIN_RECOMMENDATION.
```

INVARIAN 2 dapat ditegakkan murah dengan test:

```ts
// __tests__/invariants/no-competing-decisions.test.ts
// grep seluruh modules/ & app/api/ untuk literal 'STRONG BUY' dst.
// allowlist: modules/decision/**, dan file test.
```

---

## 5. ELIGIBILITY ENGINE

### 5.1 Tanda tangan

```ts
// modules/eligibility/service/eligibility.service.ts

export interface EligibilityInput {
  ticker: string;
  asOf: string;                          // tanggal evaluasi
  bars: OhlcvBar[];                      // urut naik menurut tanggal
  lastBarDate: string;
  marketTimestamp: number | null;        // Yahoo meta.regularMarketTime
  tradingCalendar: TradingCalendar;      // hari bursa (shared/calendar/)
  corporateActions?: CorporateAction[];  // opsional; kalau null gate-nya SKIPPED
}

export interface EligibilityResult {
  status: EligibilityStatus;
  reasonCodes: string[];        // bisa lebih dari satu
  blocking: boolean;            // true = hentikan scoring
  details: Record<string, number | string | null>;  // untuk trace
}

export function evaluateEligibility(input: EligibilityInput): EligibilityResult;
```

### 5.2 Keputusan blocking vs non-blocking

| Status | Blocking? | Alasan |
|---|---|---|
| `INSUFFICIENT_HISTORY` | **YA** | Pilar Trend butuh MA200 + ADX + struktur. Tanpa 200 bar, skornya bukan sekadar kurang lengkap — ia tidak terdefinisi. |
| `SUSPENDED_OR_NOT_TRADED` | **YA** | Harga terakhir bukan harga pasar yang bisa dieksekusi. Seluruh perhitungan berbasis harga menjadi tidak bermakna. |
| `STALE_DATA` | **YA** | Sama seperti di atas — menghitung indikator atas harga basi menghasilkan angka yang terlihat sah. |
| `INSUFFICIENT_DATA` (DQ < 50) | **YA** | Terlalu sedikit faktor untuk komposisi yang bermakna. |
| `LOW_LIQUIDITY` | **TIDAK** | Data harganya valid; skornya bermakna. Yang tidak boleh adalah **merekomendasikan**-nya. Pengguna yang sudah memegang saham itu berhak melihat analisisnya. |
| `EXTREME_VOLATILITY` | **TIDAK** | Sama. |
| `ABNORMAL_PRICE_MOVEMENT` | **TIDAK** | Sama — dan justru penting ditampilkan sebagai peringatan. |
| `CORPORATE_ACTION_REVIEW` | **TIDAK** | Angka bisa terdistorsi; tampilkan dengan peringatan eksplisit. |

**Aturan:** non-blocking ⇒ `lensScore` tetap dihitung, `decision.action = null`, `decision.advisory = false`, `decision.status` = status eligibility-nya.

**Prioritas kalau beberapa gate aktif:** urutan di tabel di atas (dari atas ke bawah). `reasonCodes` memuat **semua** yang aktif, `status` memuat yang prioritasnya tertinggi.

### 5.3 Spesifikasi per gate

#### G1 — `INSUFFICIENT_HISTORY`

| | |
|---|---|
| Input | `bars.length` |
| Formula | `bars.length < MIN_BARS` |
| Threshold | `MIN_BARS = 200` |
| Sumber threshold | Kebutuhan teknis MA200. **Bukan** hipotesis — ini definisi, bukan pilihan. |
| Fallback | — |
| Reason code | `HISTORY_TOO_SHORT` |
| User-facing | "Riwayat harga baru {n} hari bursa. Analisis tren butuh minimal 200 hari — belum bisa dinilai." |
| Label | [STRUCTURAL] |

#### G2 — `STALE_DATA`

| | |
|---|---|
| Input | `lastBarDate`, `asOf`, `tradingCalendar` |
| Formula | `tradingDaysBetween(lastBarDate, asOf) > MAX_STALE_TRADING_DAYS` |
| Threshold | `MAX_STALE_TRADING_DAYS = 2` |
| Sumber | [HYPOTHESIS] — dipilih agar libur panjang tidak memicu false positive; wajib diuji terhadap kalender IDX nyata |
| Fallback | Kalau `tradingCalendar` tidak tersedia, pakai hari kalender dengan ambang 5. Turunkan DQ freshness. |
| Reason code | `DATA_STALE` |
| User-facing | "Data harga terakhir {tanggal} — {n} hari bursa lalu. Analisis tidak dijalankan atas data basi." |
| Label | [STRUCTURAL] |

#### G3 — `SUSPENDED_OR_NOT_TRADED`

| | |
|---|---|
| Input | `bars` (volume 20 bar terakhir) |
| Formula | `consecutiveZeroVolumeDays(bars) >= MAX_ZERO_VOL_DAYS` **atau** `zeroVolumeDaysIn(bars, 20) >= MAX_ZERO_VOL_IN_20` |
| Threshold | `MAX_ZERO_VOL_DAYS = 3`, `MAX_ZERO_VOL_IN_20 = 8` |
| Sumber | [HYPOTHESIS] |
| Fallback | Yahoo kadang mengembalikan `volume: null` untuk hari libur, bukan 0. Perlakukan `null` sebagai **bar tidak ada**, bukan volume nol. Ini pembedaan penting — jangan disatukan. |
| Reason code | `NO_TRADING_ACTIVITY` |
| User-facing | "Saham ini tidak tercatat bertransaksi dalam {n} hari terakhir (kemungkinan suspensi). Analisis tidak dijalankan." |
| Catatan | Ini **proxy**, bukan status suspensi resmi. IDX punya daftar suspensi tapi tidak tersedia sebagai feed di aplikasi ini. Wajib dilabeli "kemungkinan", bukan "disuspensi". |
| Label | [STRUCTURAL] + sebagian [DATA BLOCKER] |

#### G4 — `LOW_LIQUIDITY`

| | |
|---|---|
| Input | `bars` (20 terakhir) |
| Formula | `ADV20 = mean(close_i × volume_i, i ∈ 20 bar terakhir)`; gate kalau `ADV20 < ADV_HARD_FLOOR_IDR` |
| Threshold | `ADV_HARD_FLOOR_IDR = 1_000_000_000` (Rp 1 miliar/hari) |
| Sumber | **Konsisten dengan kriteria universe yang sudah dipakai tim** di `scripts/backtest-universe-refresh.mjs`. Tetap **[HYPOTHESIS]** sampai divalidasi (§20). |
| Fallback | Kalau bar < 20, pakai bar yang ada dan tandai di DQ depth. Jangan skip gate. |
| Reason code | `LIQUIDITY_BELOW_FLOOR` |
| User-facing | "Nilai transaksi rata-rata 20 hari Rp {x} juta/hari — di bawah batas Rp 1 miliar. Saham ini sulit dibeli/dijual dalam ukuran wajar, jadi tidak direkomendasikan." |
| Label | [STRUCTURAL] (gate-nya), [HYPOTHESIS] (angkanya) |

#### G5 — `EXTREME_VOLATILITY`

| | |
|---|---|
| Input | `bars` |
| Formula | `atrPct = ATR14/close × 100 > ATR_EXTREME_PCT` **atau** `abs(return20d) > RETURN_20D_EXTREME_PCT` |
| Threshold | `ATR_EXTREME_PCT = 15`, `RETURN_20D_EXTREME_PCT = 100` |
| Sumber | [HYPOTHESIS] |
| Fallback | Butuh ≥ 15 bar; kalau kurang, G1 sudah menangkapnya lebih dulu |
| Reason code | `VOLATILITY_EXTREME` |
| User-facing | "Rentang gerak harian rata-rata {x}% — jauh di atas normal. Angka analisis tetap ditampilkan, tapi tidak dijadikan dasar rekomendasi." |
| Label | [HYPOTHESIS] |

#### G6 — `ABNORMAL_PRICE_MOVEMENT` (kandidat ARA/ARB)

Spesifikasi lengkap di §5.4.

#### G7 — `CORPORATE_ACTION_REVIEW`

| | |
|---|---|
| Input | `corporateActions` (opsional), `bars` |
| Formula (dengan data CA) | Ada aksi korporasi berjenis split/reverse/rights/bonus dengan `effectiveDate` dalam `CA_WINDOW_DAYS` hari bursa terakhir |
| Formula (tanpa data CA — deteksi proxy) | Rasio `close_t / close_{t-1}` di luar `[1/CA_RATIO_TRIGGER, CA_RATIO_TRIGGER]` **tanpa** volume spike yang sepadan ⇒ kandidat split/reverse |
| Threshold | `CA_WINDOW_DAYS = 5`, `CA_RATIO_TRIGGER = 1.6` |
| Sumber | [HYPOTHESIS] |
| Fallback | `corporateActions` null ⇒ jalankan deteksi proxy saja, tandai `detectionMethod: 'proxy'` di details |
| Reason code | `CORPORATE_ACTION_RECENT` \| `CORPORATE_ACTION_SUSPECTED` |
| User-facing | "Terdeteksi kemungkinan aksi korporasi (stock split/rights issue) dalam 5 hari terakhir. Indikator harga bisa terdistorsi." |
| Label | [HYPOTHESIS] + sebagian [DATA BLOCKER] |

### 5.4 ARA/ARB — arsitektur dua lapis

**Prinsip:** deteksi statistik dipisah total dari aturan bursa. Deteksi tidak boleh tahu apa-apa tentang peraturan IDX; konfirmasi tidak boleh menghitung apa pun dari data harga selain apa yang diberikan lapisan pertama.

#### Lapis 1 — deteksi kandidat (murni data, tanpa aturan bursa)

```ts
// modules/eligibility/service/abnormal-movement.service.ts

export interface AbnormalMovementCandidate {
  date: string;
  returnPct: number;
  /** true kalau close == high hari itu (indikasi antrian beli menumpuk di batas atas) */
  closedAtHigh: boolean;
  /** true kalau close == low hari itu */
  closedAtLow: boolean;
  direction: 'UP' | 'DOWN';
}

/** Murni statistik. TIDAK tahu apa pun tentang peraturan IDX. */
export function detectAbnormalMovement(
  bars: OhlcvBar[],
  lookbackDays: number,
  candidateThresholdPct: number,   // default 14 [HYPOTHESIS]
): AbnormalMovementCandidate[];
```

Ambang kandidat `14%` dipilih **konservatif di bawah** batas auto-rejection terendah yang pernah berlaku di IDX, supaya tidak ada kejadian nyata yang terlewat. Ini **bukan** klaim tentang batas ARA/ARB — hanya jaring penangkap.

#### Lapis 2 — konfirmasi menurut peraturan bursa

```ts
// shared/config/idx-exchange-rules.ts

export interface AutoRejectionTier {
  minPrice: number;             // inklusif
  maxPrice: number | null;      // eksklusif; null = tak terbatas
  araPct: number;
  arbPct: number;
}

export interface ExchangeRuleSet {
  id: string;                   // mis. 'idx-ar-2023-09'
  effectiveFrom: string;        // YYYY-MM-DD
  effectiveTo: string | null;   // null = masih berlaku
  tiers: AutoRejectionTier[];
  /** Wajib diisi: dari peraturan/pengumuman IDX mana angka ini disalin.
   *  Baris ini TIDAK boleh kosong. */
  source: string;
  /** Siapa & kapan memverifikasi ke dokumen aslinya. */
  verifiedBy: string;
  verifiedOn: string;
}

/** SENGAJA KOSONG di repo. Wajib diisi manusia dari peraturan IDX yang berlaku.
 *  Array kosong = konfirmasi selalu mengembalikan 'UNKNOWN'. Itu perilaku
 *  yang BENAR — lebih baik "tidak tahu" daripada angka dari ingatan. */
export const IDX_AUTO_REJECTION_RULES: ExchangeRuleSet[] = [];
```

```ts
// modules/eligibility/service/auto-rejection.service.ts

export type AutoRejectionVerdict = 'ARA' | 'ARB' | 'NOT_AUTO_REJECTION' | 'UNKNOWN';

export function confirmAutoRejection(
  candidate: AbnormalMovementCandidate,
  price: number,
  rules: ExchangeRuleSet[],
): AutoRejectionVerdict;
```

**Perilaku wajib:**

| Kondisi | Hasil |
|---|---|
| Tidak ada ruleset yang mencakup tanggal kandidat | `UNKNOWN` |
| Ada ruleset, `returnPct` mencapai `araPct` tier harga itu **dan** `closedAtHigh` | `ARA` |
| Ada ruleset, `returnPct` mencapai `-arbPct` **dan** `closedAtLow` | `ARB` |
| Ada ruleset, tidak mencapai batas | `NOT_AUTO_REJECTION` |

**Perilaku gate G6:**

```
kandidat terdeteksi >= 2 hari dalam 5 hari bursa terakhir
  DAN verdict ∈ {ARA, ARB, UNKNOWN}
    => status ABNORMAL_PRICE_MOVEMENT (non-blocking)

verdict === NOT_AUTO_REJECTION untuk semua kandidat
    => tidak memicu G6 (gerakan besar tapi bukan auto-rejection;
       G5 EXTREME_VOLATILITY mungkin masih memicu)
```

`UNKNOWN` **memicu** gate — sikap konservatif. Selama `IDX_AUTO_REJECTION_RULES` kosong, sistem akan menandai semua kandidat sebagai abnormal. Itu benar dan aman.

**Label:** [STRUCTURAL] untuk arsitekturnya, [DATA BLOCKER] untuk isi tabel aturannya.

**Instruksi ke coding agent:** JANGAN mengisi `IDX_AUTO_REJECTION_RULES` dengan angka apa pun. Biarkan array kosong. Tugas mengisinya adalah tugas manusia yang membuka peraturan IDX. Tulis komentar di file itu yang menyatakan hal ini secara eksplisit.

---

## 6. DATA QUALITY MODEL

### 6.1 Kenapa `coverage_pct` tidak cukup (ringkas dari P0-2)

`coverage_pct` v1 hanya mengukur "berapa bobot poin yang tersedia" — dan bahkan itu pun salah hitung ketika komponen kehilangan sub-metrik sebagian. Data Quality Score menggantikannya dengan ukuran 4 dimensi, dihitung dari **factor registry** (§6.2/§8) supaya "hilang sebagian" tidak bisa lagi tersembunyi — setiap sub-faktor adalah entri individual, bukan bagian tak terlihat dari komponen komposit.

### 6.2 Factor registry — fondasi yang menutup P0-2 secara struktural

```ts
// modules/factor/registry/factor-registry.ts

export interface FactorDefinition {
  id: string;                       // 'roic', 'earnings_yield', ...
  pillar: 'quality'|'valuation'|'growth'|'trend'|'momentum'|'flow';
  /** Bobot DI DALAM pilarnya. Jumlah semua faktor 1 pilar = 1.0. */
  weightInPillar: number;
  /** Sektor mana faktor ini TIDAK berlaku. Kosong = berlaku semua sektor. */
  inapplicableFor: string[];        // kode IDX-IC, mis. ['IDXFIN']
  /** Fungsi murni: data mentah -> nilai faktor (belum dinormalisasi) atau null. */
  compute: (ctx: FactorComputeContext) => number | null;
  /** Populasi pembanding untuk normalisasi (§9). */
  normalizationScope: 'global' | 'sector';
}

export const FACTOR_REGISTRY: FactorDefinition[] = [ /* §8 */ ];
```

Setiap sub-faktor terdaftar **satu kali**. Kelengkapan dihitung dengan menjumlah `weightInPillar × pillarWeight` atas faktor yang `compute() !== null`, dibagi jumlah yang **applicable** untuk sektor emiten itu (`inapplicableFor` dikeluarkan dari penyebut, bukan dihitung sebagai hilang). Ini yang membuat bank tidak dihukum karena tidak punya Current Ratio yang bermakna — faktor itu tidak pernah masuk penyebutnya sama sekali untuk sektor Financials.

### 6.3 Formula Data Quality Score

```
DQ = 100 × ( 0.40×D_complete + 0.25×D_fresh + 0.20×D_depth + 0.15×D_consistent )
```

| Komponen | Formula | Detail |
|---|---|---|
| `D_complete` | `Σ(weightInPillar_i × pillarWeight_i) untuk i applicable & tersedia  /  Σ(weightInPillar_i × pillarWeight_i) untuk i applicable` | Dihitung dari registry §6.2. Ini pengganti langsung `coverage_pct`, dengan bug P0-2 tertutup by construction. |
| `D_fresh` | `1.0` jika bar terakhir = hari bursa terakhir menurut kalender; turun linier ke `0` pada `STALE_FLOOR_DAYS = 5` hari bursa | Dipakai bersama gate G2, tapi G2 biner (blocking), ini kontinu (skor). |
| `D_depth` | `min(1, bar_tersedia / DEPTH_TARGET_BARS)` | `DEPTH_TARGET_BARS = 500` — cukup untuk pilar Growth (butuh 3 tahun ≈ 750 bar) dapat penalti wajar kalau cuma 250. |
| `D_consistent` | `1 − 0.25 × jumlah_pelanggaran_identitas` (dasar 0) | Lihat §6.4 |

**Label bobot 0.40/0.25/0.20/0.15: [HYPOTHESIS].**

### 6.4 Uji konsistensi (`D_consistent`)

Nilai tambah paling konkret dari DQ v2 dibanding v1: mengubah audit manual (yang menemukan bug PBV USD/IDR) menjadi pemeriksaan otomatis tiap request.

| Uji | Formula | Toleransi | Menangkap |
|---|---|---|---|
| Identitas PBV | `abs(pbv − price/bvps)/pbv > 0.10` | 10% | Mismatch mata uang, data BVPS basi |
| Identitas PER | `abs(per − price/eps)/per > 0.10` | 10% | EPS salah unit/mata uang |
| Identitas ROE | `abs(roe − eps/bvps×100)/roe > 0.15` | 15% (lebih longgar — ROE Yahoo kadang dari basis beda) | Data ROE tidak konsisten dengan EPS/BVPS yang dikirim bersamaan |
| Harga wajar (sanity) | `fairValue > price × 10 OR fairValue < price × 0.1` | — | Model valuasi meledak (lihat P1-12/P1-13) |

Setiap pelanggaran ⇒ `−0.25` dari basis 1.0 (floor 0), **dan** ditambahkan ke `inconsistencies[]` di `StockDecision.dataQuality` supaya bisa diperiksa manusia — bukan cuma menurunkan angka diam-diam.

**Label:** [BUG FIX] (konsep ini langsung mengotomasi kelas bug yang sudah ditemukan manual — C-07 USD/IDR — jadi bukan hipotesis, tapi instrumentasi atas pola yang sudah terbukti terjadi).

### 6.5 Aturan pemakaian DQ

```
DQ < DQ_MIN_SCORING (default 50)         => eligibility.status = INSUFFICIENT_DATA (blocking)
DQ_MIN_SCORING <= DQ < DQ_MIN_RECOMMENDATION (default 65)
                                          => lensScore dihitung, decision.advisory = false
DQ >= DQ_MIN_RECOMMENDATION               => normal
```

**DQ TIDAK mengalikan atau menjumlah ke LensScore.** Ia mempengaruhi (a) gate di atas, dan (b) `Confidence` (§14) sebagai salah satu komponennya. Ini menghindari **double punishment**: sub-faktor yang hilang sudah otomatis mengecilkan bobotnya sendiri di komposisi pilar (§7.3); menghukum lagi lewat perkalian DQ×LensScore akan menghukum data yang sama dua kali.

**Label:** [STRUCTURAL] untuk arsitektur, [HYPOTHESIS] untuk `DQ_MIN_SCORING=50` dan `DQ_MIN_RECOMMENDATION=65`.

### 6.6 Pembedaan wajib: hilang seluruh komponen vs hilang sebagian

| Kasus | v1 | v2 |
|---|---|---|
| Seluruh blok Valuasi hilang (PER & PBV null) | Komponen `NA()`, dikeluarkan penuh, `max` tetap 10 di `declaredMax` — **konsisten** | Kedua faktor `earnings_yield`/`pbv_vs_implied` bernilai null, bobotnya 0 di pembilang **dan** penyebut pilar Valuation direnormalisasi dari faktor yang tersisa (EV/EBITDA, FCF Yield) |
| Hanya PER hilang (PBV ada) | `max` komponen valuasi mengecil ke 5 tanpa terlihat di `declaredMax` — **inilah bug P0-2** | `earnings_yield` = null, tidak masuk pembilang; penyebut pilar tetap penuh (constant per pilar, ditentukan di registry, bukan dihitung ulang per saham) — sehingga `D_complete` turun secara proporsional dan **terlihat** |

Perbedaan kuncinya: di v2, "penyebut" (`Σ weightInPillar × pillarWeight untuk faktor applicable`) adalah **properti registry**, dihitung sekali secara statis — bukan dihitung ulang dari objek `Component` yang bisa mengecil sendiri. Sumber bug P0-2 hilang by construction.

---

## 7. LENSSCORE V2 SPECIFICATION

### 7.1 Formula komposit

```
rawLensScore = Σ_p (weightPillar_p × pillarScore_p)   untuk p yang tersedia,
               bobot p yang hilang direnormalisasi ke p yang tersisa

lensScore = clamp( rawLensScore × riskAdj × liqAdj , 0, 100 )
```

```ts
// modules/decision/constants/lensscore.config.ts   -- SEMUA [HYPOTHESIS]

export const PILLAR_WEIGHTS_DEFAULT = {
  quality: 0.20,
  valuation: 0.20,
  growth: 0.10,
  trend: 0.20,
  momentum: 0.15,
  flow: 0.15,
} as const;   // total harus = 1.0, diverifikasi test statis
```

### 7.2 Renormalisasi pilar hilang

```
pillar p tersedia jika  D_complete_p >= PILLAR_MIN_COMPLETENESS (default 0.40)

rawLensScore = Σ_{p tersedia} (w_p × score_p) / Σ_{p tersedia} w_p
```

Kalau **kurang dari 3 pilar** tersedia ⇒ `rawLensScore = null` ⇒ `eligibility.status = INSUFFICIENT_DATA`. Rasionalnya: skor dari 2 pilar bukan lagi versi "lebih tipis" dari model 6 pilar, ia model yang berbeda sama sekali dan tidak boleh disamakan tampilannya.

**Label:** [HYPOTHESIS] untuk `PILLAR_MIN_COMPLETENESS=0.40` dan ambang "3 pilar".

### 7.3 Komposisi di dalam pilar

```
pillarScore_p = Σ_{f applicable & tersedia} (weightInPillar_f × factorScore_f)
                / Σ_{f applicable & tersedia} weightInPillar_f
```

Sama persis prinsipnya dengan §7.2, level lebih dalam. `factorScore_f` sudah dalam skala 0-100 (hasil normalisasi §9), bukan nilai mentah.

### 7.4 Perubahan terhadap usulan Tahap 1

Audit Tahap 1 mengusulkan 6 pilar dengan bobot 20/20/10/20/15/15. Blueprint ini **mempertahankan struktur itu** tapi mengubah dua hal signifikan berdasarkan tinjauan ulang:

| Perubahan | Alasan |
|---|---|
| Pilar hilang direnormalisasi, bukan diberi 0 | Konsisten dengan prinsip yang sudah dipakai `combine()` v1 — jangan menghukum ketiadaan data sebagai skor buruk |
| Ambang minimum 3 pilar untuk skor valid | Tahap 1 tidak menetapkan ini eksplisit; tanpanya, skor dari 1 pilar (mis. hanya Trend) bisa tampil dengan confidence tinggi padahal cakupannya sangat sempit |

**Bobot itu sendiri TETAP [HYPOTHESIS] — tidak ada perubahan pada klaim itu.** Reviewer diminta secara eksplisit untuk tidak menganggap usulan Tahap 1 benar hanya karena terlihat akademis; setelah ditinjau ulang, strukturnya bertahan tapi angkanya tetap tidak berdasar sampai backtest.

---

## 8. FACTOR DEFINITIONS

### 8.1 QUALITY

| factorId | weightInPillar | Formula | inapplicableFor | Fallback |
|---|---|---|---|---|
| `roic` | 0.30 | `EBIT×(1−0.22) / (totalDebt+totalEquity−cash)` | `IDXFIN` | Bank: diganti bobotnya oleh `roe_stability` di bawah lewat renormalisasi otomatis §7.3 |
| `earnings_quality` | 0.25 | `operatingCashflow / netIncome` , di-cap `[−2, 3]` sebelum normalisasi | — | null kalau `netIncome <= 0` (rasio tidak bermakna untuk laba negatif) |
| `margin_stability` | 0.20 | `−stdev(netMargin_5y)` (dibalik tanda sebelum normalisasi: makin stabil makin tinggi) | — | butuh ≥ 3 tahun data; < 3 ⇒ null |
| `interest_coverage` | 0.15 | `EBIT / interestExpense` | `IDXFIN` | Bank: idem `roic` |
| `profit_consistency` | 0.10 | `tahun_laba_positif / 5` | — | butuh ≥ 3 tahun; < 3 ⇒ null |

Pajak korporasi 22% di `roic` — **[HYPOTHESIS]**, tarif PPh Badan Indonesia saat ini tapi tidak semua emiten efektif membayar tarif itu (insentif, kompensasi rugi).

Semua di atas kecuali `earnings_quality` dan `profit_consistency` **butuh data multi-tahun yang saat ini tidak tersedia dari Yahoo `quoteSummary` snapshot TTM** — lihat §17 (Data Limitation) dan §8.7 (interim fallback).

### 8.2 VALUATION — normalizationScope: `sector`

| factorId | weightInPillar | Formula | inapplicableFor | Catatan |
|---|---|---|---|---|
| `earnings_yield` | 0.30 | `EPS_ttm / price`; **untuk `IDXENERGY`, `IDXBASIC`: `medianEPS_5y / price`** | — | Menutup P1-10 (value trap siklikal) langsung di level faktor |
| `fcf_yield` | 0.25 | `FCF / marketCap` | `IDXFIN` | |
| `pbv_vs_implied` | 0.25 | `implied = (ROE−g)/(r−g)`, `r = SBN10Y + β×ERP`, `g = min(sustainableGrowth, 0.05)`; `factorRaw = implied / pbvActual` | — | `β` dari `beta.service.ts` yang **sudah ada** |
| `ev_ebitda_inv` | 0.20 | `1 / enterpriseToEbitda` | `IDXFIN` | |

Bank: bobot `fcf_yield` + `ev_ebitda_inv` direnormalisasi ke `earnings_yield` + `pbv_vs_implied` otomatis lewat §7.3 — **tidak perlu cabang kode khusus bank**, cukup `inapplicableFor: ['IDXFIN']` di registry.

**Dihapus dari daftar kandidat Tahap 1:** PEG (redundant dengan kombinasi `earnings_yield` + faktor Growth — memasukkannya berarti menilai growth dua kali), Price/Sales (kalah informatif dibanding EV/Sales dan tidak dipakai karena EV/EBITDA sudah menangkap struktur modal), forward PER murni (dipertahankan hanya sebagai fallback `earnings_yield` kalau trailing EPS negatif — lihat §8.6).

### 8.3 GROWTH — normalizationScope: `sector`

| factorId | weightInPillar | Formula | Fallback |
|---|---|---|---|
| `revenue_cagr_3y` | 0.35 | `(rev_t/rev_t−3)^(1/3) − 1`, di-winsorize §9.5 | butuh 3 tahun; kurang ⇒ null |
| `eps_cagr_3y` | 0.35 | `(eps_t/eps_t−3)^(1/3) − 1`, di-winsorize; null kalau `eps_t−3 <= 0` (basis negatif membuat CAGR tidak bermakna) | idem |
| `growth_consistency` | 0.30 | `kuartal_YoY_positif / 8` | butuh 8 kuartal; kurang ⇒ null |

**Seluruh pilar Growth adalah [DATA BLOCKER] dengan sumber data saat ini** — lihat §8.7.

### 8.4 TREND — normalizationScope: `global`

| factorId | weightInPillar | Formula | Menggantikan (v1) |
|---|---|---|---|
| `ma_position` | 0.30 | `0.5×(P−MA50)/ATR14 + 0.5×(P−MA200)/ATR14`, di-clamp `[−5,5]` sebelum normalisasi | `ma_trend` (biner) |
| `ma50_slope` | 0.25 | `(MA50_t − MA50_{t−20}) / MA50_{t−20}` | — (baru) |
| `adx14` | 0.25 | Wilder DI+/DI−/DX standar, smoothing 14 | — (baru, mengisi kekosongan "kekuatan tren") |
| `market_structure` | 0.20 | Skor dari fractal 5-bar: +1 tiap HH, +1 tiap HL, −1 tiap LH, −1 tiap LL, atas 5 swing terakhir, dinormalisasi ke rentang tetap | — (baru) |

**Redundansi dihapus** (menjawab instruksi eksplisit §6 Tahap 2 prompt): `EMA 20/50 Cross`, `SMA Score 5/10/20`, dan `MACD` v1 semuanya **turunan arah rata-rata bergerak harga** — di v2 ini diwakili **satu kali** oleh `ma_position` + `ma50_slope`. `adx14` menambahkan dimensi yang v1 **tidak punya sama sekali** (kekuatan, bukan arah) — bukan duplikat, pelengkap yang hilang.

`MACD` dihapus total dari faktor Trend (informasinya sudah tercakup `ma50_slope` pada horizon yang sebanding — EMA12/26 vs EMA9 adalah rata-rata bergerak dengan periode lebih pendek, korelasinya dengan `ma_position` tinggi). Kalau backtest §16 menunjukkan MACD punya IC independen yang tidak tertangkap 4 faktor di atas, boleh ditambahkan kembali — bukan default.

### 8.5 MOMENTUM & RELATIVE STRENGTH — normalizationScope: `global` (kecuali RS sektor)

| factorId | weightInPillar | Formula | Catatan |
|---|---|---|---|
| `momentum_12_1` | 0.30 | `P_{t−21}/P_{t−252} − 1` | Butuh 252 bar. Menggantikan 1D/5D — lihat §8.6 |
| `rs_vs_ihsg_3m` | 0.30 | `ret_saham_63d − ret_IHSG_63d` | `^JKSE` sudah di-fetch di `precompute.service.ts`, tinggal disalurkan |
| `rs_vs_sector_3m` | 0.25 | `ret_saham_63d − ret_sektorIndex_63d` | **[DATA BLOCKER] sebagian** — lihat §8.7, indeks sektor IDX resmi tidak tersedia; fallback: rata-rata equal-weight universe eligible sektor yang sama |
| `rsi_regime_aware` | 0.15 | Uptrend (dari `ma_position`>0 & `adx14`>20): `RSI∈[50,80]→tinggi`, `>80→menurun linier`. Downtrend: `RSI<30` **tidak** dinaikkan (dipetakan datar/rendah), `RSI∈[20,40]` netral | Menutup P1-7: satu definisi, bukan dua bertentangan |

### 8.6 Keputusan eksplisit: momentum 1D/5D DIHAPUS dari LensScore utama

**Jawaban langsung atas instruksi §6 Tahap 2 prompt.**

Momentum 1D/5D (`analyzeMomentum` v1) dihapus dari LensScore v2 karena:
1. Horizon terlalu pendek untuk literatur momentum manapun yang relevan (Jegadeesh-Titman & turunannya: efek pada 6-12 bulan, skip 1 bulan).
2. Reversal jangka pendek justru dominan pada horizon ini — sinyalnya kemungkinan **berlawanan arah** dengan yang dimaksud.
3. Ia murni noise harian yang tidak lolos uji "punya alasan ekonomi tertulis" (§20 disiplin anti-overfitting Tahap 1).

Momentum 1D/5D **tidak dihapus dari aplikasi** — tetap berguna sebagai info tampilan murni ("saham ini naik 3% hari ini") di halaman detail, di luar `FACTOR_REGISTRY`. Yang dihapus adalah perannya sebagai input keputusan.

### 8.7 FLOW & PARTICIPATION — normalizationScope: `global`

| factorId | weightInPillar | Formula | Catatan |
|---|---|---|---|
| `cmf20` | 0.35 | `Σ(MFM×Vol)/ΣVol`, 20 hari — **fungsi yang sama persis dengan v1** (`foreign-flow-proxy.ts:chaikinMoneyFlow20`) | Dipertahankan tanpa perubahan — sudah benar |
| `obv_slope` | 0.30 | Regresi linier OBV kumulatif 20 hari, dinormalisasi terhadap harga | Baru — OBV kumulatif, **bukan** rasio 14 hari seperti `market-flow.ts` v1 |
| `vol_direction_corr` | 0.20 | `corr(return_harian, volumeRelatif20)` , 20 hari | Baru — mengukur apakah volume mengkonfirmasi arah, dipakai untuk menutup P1-8 (volume dinilai tanpa arah) |
| `flow_persistence` | 0.15 | `hari_dengan_MFM>0 / 20` (rasio atas jendela, **bukan streak** yang digerbangi volume hari terakhir) | Menutup P1-9 |

**Dihapus dari v1 dan tidak dibawa ke v2:** analyzer `LensFlow` dan `Bandarmology` terpisah yang keduanya turunan CMF yang sama (`app/api/stock/[ticker]/route.ts` push dua analyzer tambahan) — di v2 hanya **satu** entri `cmf20` di registry. `scoreVolume` v1 (poin volume tanpa arah, P1-8) juga dihapus, digantikan `vol_direction_corr` yang eksplisit mengukur konfirmasi arah.

**Peringatan metodologis wajib dibawa ke v2:** seluruh pilar Flow adalah **proxy dari harga+volume**, bukan data broker/asing sungguhan. Setiap kali pilar ini ditampilkan, label "estimasi dari data harga, bukan data broker" wajib menyertainya — persis disiplin yang sudah konsisten di v1 (`foreign-flow-proxy.ts` komentarnya sudah benar, pertahankan bahasanya).

---

## 9. NORMALIZATION

### 9.1 Perbandingan metode

| Metode | Kalibrasi otomatis ke IDX? | Tahan outlier? | Bisa sektor-neutral? | Kompleksitas | Dipakai untuk |
|---|---|---|---|---|---|
| **A. Absolute threshold** (v1) | Tidak | Tidak | Tidak (butuh cabang manual per sektor) | Rendah | **Tidak dipakai di v2** — ini sumber P1-10/P1-11 |
| **B. Cross-sectional percentile** | Ya | Ya (rank tidak peka magnitude outlier) | Ya (ganti populasi) | Sedang | **Faktor Trend, Momentum, Flow, Quality** |
| **C. Sector percentile** | Ya | Ya | By definition | Sedang | **Faktor Valuation, Growth** |
| **D. Z-score / robust z-score** | Ya | Robust z (pakai median/MAD) tahan; z biasa tidak | Ya (per sektor) | Sedang-tinggi | Tidak dipakai sebagai output akhir (skala tak terbatas, sulit dijelaskan ke pengguna) — **dipakai sebagai langkah antara** sebelum winsorizing (§9.5) |
| **E. Winsorized percentile** | Ya | Ya (eksplisit) | Ya | Sedang | **Metode final untuk semua faktor** — B dan C keduanya diimplementasikan sebagai winsorized percentile |

### 9.2 Keputusan metode final

**Setiap faktor dinormalisasi sebagai winsorized percentile rank (0-100) atas populasi pembandingnya**, di mana populasi ditentukan oleh `normalizationScope`:

```ts
// modules/factor/normalize/percentile.ts

export function normalizeToPercentile(
  value: number,
  population: number[],       // nilai faktor yang sama, saham lain, hari yang sama
  winsorizeLowerPct: number,  // default 0.05
  winsorizeUpperPct: number,  // default 0.95
): number {
  const clipped = winsorize(population, winsorizeLowerPct, winsorizeUpperPct);
  const rank = clipped.filter(v => v <= value).length;
  return Math.round((rank / clipped.length) * 100);
}
```

**Kenapa bukan Z-score sebagai output akhir:** Z-score tak terbatas dan berat ekornya bergantung distribusi — dua saham dengan Z=3 di faktor berbeda tidak sebanding tanpa asumsi normalitas yang tidak berlaku untuk rasio keuangan IDX (ROE, growth, PER semuanya condong/skewed). Percentile tidak butuh asumsi distribusi apa pun dan langsung terbaca ("lebih murah dari 80% peer") — memenuhi prinsip explainability §1.

### 9.3 Populasi pembanding

| `normalizationScope` | Populasi |
|---|---|
| `global` | Seluruh universe eligible (lolos gate §5), hari yang sama |
| `sector` | Subset universe eligible dengan `idxIc` sama, hari yang sama |

**Syarat minimum populasi:** kalau populasi sektor < `MIN_SECTOR_POPULATION` (default **8** saham), fallback ke populasi global untuk faktor itu, dan tandai `normalizationFallback: true` di trace. Sektor kecil (mis. Transportation di IDX) sering tidak punya 8 emiten eligible — percentile dari 3 saham tidak bermakna statistik.

**Label:** [HYPOTHESIS] untuk `MIN_SECTOR_POPULATION=8`, [STRUCTURAL] untuk mekanisme fallback-nya.

### 9.4 Penanganan outlier IDX spesifik

| Kasus | Penanganan |
|---|---|
| PER negatif (emiten rugi) | `earnings_yield` tetap terdefinisi & bertanda negatif secara alami (EPS negatif ⇒ EY negatif) — **tidak butuh cabang khusus**, ini keunggulan EY dibanding PER (P1-13 di Tahap 1) |
| ROE ekstrem (mis. ekuitas mendekati nol karena rugi berturut) | Winsorize ke persentil 5/95 sebelum ranking — nilai ROE 8000% dari ekuitas Rp 1 juta tidak mendominasi distribusi |
| Growth +1000% karena low-base (mis. laba pulih dari rugi tipis) | `eps_cagr_3y` di-null-kan kalau `eps_t−3 <= 0` (§8.3) — CAGR dari basis negatif/nol secara matematis tidak bermakna, bukan sekadar outlier untuk di-cap |
| FCF ekstrem (capex lumpy: tahun ini nol, tahun lalu triliunan) | `fcf_yield` dihitung dari FCF TTM tunggal (keterbatasan data yang sama seperti v1) — winsorize 5/95 meredam, tapi tidak menghilangkan noise capex lumpy. Dicatat sebagai keterbatasan, bukan diselesaikan sepenuhnya |
| Saham baru IPO | Gate G1 (`INSUFFICIENT_HISTORY`, < 200 bar) sudah menyaring ini sebelum sampai normalisasi |
| Emiten turnaround (rugi → untung) | `earnings_quality`, `profit_consistency` secara alami memberi skor rendah untuk histori tidak konsisten — ini **benar**, bukan bug: turnaround yang belum terbukti berlanjut memang berisiko lebih tinggi |

### 9.5 Winsorizing

```
winsorizeLowerPct = 0.05, winsorizeUpperPct = 0.95   [HYPOTHESIS]
```

Diterapkan **sebelum** ranking, atas populasi mentah (bukan setelah dipotong ke faktor lain). Diterapkan per faktor per hari — bukan sekali di awal untuk semua waktu, supaya distribusi mengikuti kondisi pasar terkini (rezim tinggi/rendah growth berbeda tahun ke tahun).

---

## 10. SECTOR MODEL

### 10.1 Klasifikasi

```ts
// modules/sector/service/sector-classifier.service.ts

export function classifySector(ticker: string, yahooSector: string | null): {
  idxIc: string;              // 'IDXFIN' | 'IDXENERGY' | ... | 'UNCLASSIFIED'
  source: 'manual' | 'yahoo-mapped' | 'unclassified';
};
```

**Prioritas sumber:**
1. **Pemetaan manual** `modules/sector/constants/idx-ic-mapping.ts` — tabel `{ ticker: idxIcCode }` untuk universe eligible (~150-200 ticker setelah gate likuiditas). Effort: satu kali kerja manual, tabelnya kecil karena hanya untuk saham yang lolos eligibility.
2. **Fallback**: pemetaan `yahooSector → idxIc` kasar (mis. `"Banks"→IDXFIN`, `"Energy"→IDXENERGY`) untuk ticker yang belum ada di tabel manual.
3. **`UNCLASSIFIED`**: kalau keduanya gagal. Faktor dengan `normalizationScope: 'sector'` fallback ke global (§9.3) untuk saham ini.

**Label:** [STRUCTURAL] arsitektur, [DATA BLOCKER] sebagian (IDX-IC resmi 11 sektor tidak tersedia sebagai feed API gratis — tabel manual adalah satu-satunya jalan realistis).

### 10.2 Perlakuan minimal per sektor

| Sektor (IDX-IC) | Faktor yang di-`inapplicableFor` | Alasan |
|---|---|---|
| **IDXFIN** (Financials/Bank) | `roic`, `interest_coverage` (Quality); `fcf_yield`, `ev_ebitda_inv` (Valuation) | Model bisnis bank: "FCF" dan struktur modal tidak sebanding non-bank |
| **IDXENERGY**, **IDXBASIC** | — (semua faktor applicable) tapi `earnings_yield` pakai EPS median 5 tahun, bukan TTM | Siklus komoditas — lihat §8.2 |
| **IDXPROP** (Property) | — | DER 1.5-2.5x adalah norma industri; **tidak** di-inapplicable-kan karena `pbv_vs_implied` sudah otomatis menyesuaikan lewat ROE-nya sendiri, bukan lewat DER absolut (DER tidak ada di registry faktor sama sekali — lihat §10.3) |
| **IDXTECH** | `fcf_yield` mungkin null untuk emiten pra-profit (bukan di-inapplicable-kan, biarkan null natural dan direnormalisasi §7.3) | — |
| Sektor lain (IDXCYCLIC, IDXNONCYC, IDXHEALTH, IDXINDUST, IDXINFRA, IDXTRANS) | — | Tidak ditemukan alasan kuat untuk pengecualian faktor spesifik dari data yang tersedia. Kalau muncul kebutuhan spesifik (mis. NIM/NPL untuk sub-sektor multifinance), tambahkan sebagai iterasi berikutnya — **jangan** menciptakan aturan sektor tanpa bukti kebutuhan (over-engineering, §27) |

### 10.3 Keputusan penting: DER dan Current Ratio TIDAK masuk factor registry v2

Ini keputusan struktural yang perlu dinyatakan eksplisit karena berbeda dari usulan Tahap 1 yang masih menyebut DER sebagai bagian Quality.

**Alasan:** DER dan Current Ratio absolut (P1-11 Tahap 1) tidak punya ambang yang bermakna lintas sektor — mustahil dibuat "sector-aware" dengan cara yang sama seperti Valuation (persentil dalam sektor tetap tidak menjawab pertanyaan "apakah DER 2.5x ini beresiko", karena jawabannya bergantung pada **jenis arus kas**, bukan hanya sektor peer). `interest_coverage` (§8.1) mengukur risiko solvabilitas yang sama dengan cara yang lebih langsung dan sudah otomatis applicable/inapplicable per sektor.

**Konsekuensi:** metrik solvabilitas murni leverage (DER) dipindah sepenuhnya ke **Risk Score** (§12), bukan Quality — sebagai bagian dari toleransi risiko, bukan kualitas bisnis. Ini juga menutup redundansi Tahap 1 (§11 review lama mencatat ROE/PBV/PER saling terikat identitas; memindah leverage keluar dari Quality mengurangi jumlah faktor yang saling berkorelasi).

**Label:** [STRUCTURAL]

---

## 11. RISK MODEL

### 11.1 Posisi Risk dalam arsitektur: **gate + multiplier**, bukan pilar aditif

**Justifikasi (ditanyakan eksplisit di prompt):**

| Opsi | Kenapa ditolak/diterima |
|---|---|
| Bagian dari LensScore (komponen aditif) | **Ditolak.** Ini kesalahan v1 yang sama pentingnya dengan absolut-threshold: komponen aditif bisa "dibeli" — saham berisiko tinggi tapi Trend/Momentum kuat tetap bisa mencapai skor tinggi, dan justru risiko tinggi paling sering muncul **bersamaan** dengan momentum kuat (euforia sebelum koreksi). Additive membiarkan faktor lain menutupi risiko. |
| Multiplier atas rawLensScore | **Diterima.** Memastikan risiko tinggi **selalu** menekan skor akhir, berapa pun kuatnya pilar lain — sifat yang secara eksplisit diinginkan Tahap 1 (Prinsip 2). |
| Decision gate murni (biner) | **Diterima sebagian** — risiko ekstrem (`EXTREME_VOLATILITY`) sudah jadi eligibility gate non-blocking (§5.3 G5) yang menekan `advisory`. Tapi risiko sedang-tinggi yang belum ekstrem butuh gradasi, bukan on/off — makanya **juga** jadi multiplier kontinu. |
| Informasi terpisah saja (tidak mempengaruhi skor sama sekali) | **Ditolak sebagai satu-satunya peran** — kalau risiko sepenuhnya terpisah, saham 90 skor + risiko sangat tinggi tampil identik dengan saham 90 skor + risiko rendah, dan itu persis kegagalan yang diminta dihindari. Tetap **dilaporkan terpisah** (`decision.risk`) untuk transparansi, di samping perannya sebagai multiplier. |

**Kesimpulan: Risk berperan 3 kali** — (1) gate non-blocking di ekstrem, (2) multiplier kontinu atas rawLensScore, (3) angka terpisah yang dilaporkan. Tidak ada perannya sebagai pilar aditif ke-7.

### 11.2 Formula Risk Score

```
RiskScore = 100 × ( 0.30×R_vol + 0.20×R_beta + 0.20×R_dd + 0.20×R_liq + 0.10×R_gap )
0 = risiko relatif terendah di universe eligible ; 100 = tertinggi
```

| Komponen | Formula | Sumber |
|---|---|---|
| `R_vol` | percentile rank `ATR14/close×100`, global | Sudah dihitung v1 (`atr14Pct`) |
| `R_beta` | percentile rank `abs(beta − 1)`, global | **`modules/market/service/beta.service.ts` sudah ada dan sudah benar** — v1 hanya lupa memakainya untuk skor saham (hanya dipakai di /risk portofolio) |
| `R_dd` | percentile rank `abs(maxDrawdown_12m)` | `maxDrawdown = min((P_t − peak_t)/peak_t)` atas 252 bar — perlu fungsi baru, trivial dari OHLC yang sudah ada |
| `R_liq` | percentile rank `1/ADV20` (invers) | Dihitung sekali, dipakai bersama §12 (Liquidity Model) |
| `R_gap` | percentile rank `hari_gap>3%_dalam_60_hari / 60` | `gap = abs(open_t − close_{t−1})/close_{t−1}` |

**Label:** [HYPOTHESIS] bobot 0.30/0.20/0.20/0.20/0.10.

### 11.3 Pemisahan Stock Risk vs Portfolio Risk

| | Stock Risk (di atas, §11.2) | Portfolio Risk |
|---|---|---|
| Cakupan | Satu saham, berdiri sendiri | Kombinasi saham yang dipegang pengguna |
| Sudah ada di codebase? | Sebagian (`beta.service.ts`) | **Ya, di `/risk` (`app/risk/page.tsx`)** — di luar cakupan LensScore |
| Termasuk blueprint ini? | Ya — §11.2 | **Tidak.** Halaman `/risk` sudah punya mesinnya sendiri (stress testing portofolio) dan **tidak diubah** blueprint ini. `RiskScore` per saham (§11.2) bisa **dipakai sebagai input tambahan** ke `/risk` di iterasi berikutnya (mis. concentration risk terhadap saham berisiko tinggi), tapi itu **DO_NEXT**, bukan bagian LensScore v2 (§27). |

### 11.4 Risk adjustment multiplier

```ts
riskAdj = 1.00 − RISK_ADJ_MAX_PENALTY × (riskScore / 100)
```

`RISK_ADJ_MAX_PENALTY = 0.30` ⇒ rentang `riskAdj ∈ [0.70, 1.00]`. **[HYPOTHESIS]**, sama seperti diusulkan Tahap 1 — dipertahankan karena tidak ditemukan alasan mengubahnya di tinjauan ulang, tapi validitasnya tidak berubah statusnya: tetap harus diuji (§19 sensitivity test).

---

## 12. LIQUIDITY MODEL

### 12.1 Posisi dalam arsitektur

Sama seperti Risk: **hard gate (§5.3 G4) + skor kontinu + multiplier**. Tidak jadi pilar aditif — likuiditas rendah harus **selalu** menekan skor, bukan sesuatu yang bisa dikompensasi faktor lain.

### 12.2 Model runtime

```ts
// modules/decision/service/liquidity.service.ts

export interface LiquidityAssessment {
  adv20Idr: number;
  score: number;              // 0-100, percentile rank ADV20 global
  adjustment: number;         // 0.60 - 1.00
  turnoverRatio: number | null;      // ADV20 shares / sharesOutstanding
  zeroVolumeDays20: number;
}

export function assessLiquidity(bars: OhlcvBar[], sharesOutstanding: number | null): LiquidityAssessment;
```

| Metrik | Formula | Status |
|---|---|---|
| `ADV20` | `mean(close_i × volume_i, 20 bar)` | **Wajib**, sudah bisa dihitung dari data yang ada |
| `turnover` | `mean(volume_i, 20) / sharesOutstanding` | Opsional — `sharesOutstanding` tersedia di `defaultKeyStatistics`, tapi tidak selalu fresh; kalau null, `turnoverRatio: null`, tidak memblokir |
| `zeroVolumeDays20` | jumlah bar dengan `volume === 0` dalam 20 bar terakhir | Sudah cukup untuk G3 |
| Bid-ask spread | — | **[DATA BLOCKER]** — Yahoo tidak menyediakan order book. Tidak diimplementasikan. |
| Trading frequency (jumlah transaksi/hari) | — | **[DATA BLOCKER]** — butuh data tick/trade count, tidak tersedia dari Yahoo daily bars. |

### 12.3 Skor & multiplier

```
liquidityScore = percentileRank(ADV20, populasi global)

liqAdj = LIQ_ADJ_FLOOR                                         jika ADV20 < ADV_HARD_FLOOR_IDR  (G4 sudah blocking di titik ini, liqAdj tidak relevan lagi)
       = LIQ_ADJ_FLOOR + (1−LIQ_ADJ_FLOOR) × (ADV20−ADV_HARD_FLOOR_IDR)/(ADV_FULL_SCORE_IDR−ADV_HARD_FLOOR_IDR)
                                                                 jika ADV_HARD_FLOOR_IDR <= ADV20 < ADV_FULL_SCORE_IDR
       = 1.00                                                   jika ADV20 >= ADV_FULL_SCORE_IDR
```

```ts
export const ADV_HARD_FLOOR_IDR = 1_000_000_000;   // [HYPOTHESIS] Rp 1 M/hari — konsisten dgn universe filter existing
export const ADV_FULL_SCORE_IDR = 5_000_000_000;   // [HYPOTHESIS] Rp 5 M/hari
export const LIQ_ADJ_FLOOR = 0.60;                 // [HYPOTHESIS]
```

**Wajib ditandai `[HYPOTHESIS] — MUST BE VALIDATED`, secara eksplisit sesuai instruksi prompt.** Ketiga angka ini belum diuji — hanya konsisten dengan keputusan yang **sudah** diambil tim di `scripts/backtest-universe-refresh.mjs`, yang sendiri juga tidak pernah divalidasi secara statistik, hanya heuristik operasional ("saham di bawah ini sulit dieksekusi ritel").

---

## 13. MARKET REGIME

### 13.1 Keputusan: regime menggeser AMBANG KEPUTUSAN, bukan raw LensScore

**Jawaban langsung atas pertanyaan §11 Tahap 2 prompt.**

| Opsi | Keputusan |
|---|---|
| Regime mengalikan/menambah raw LensScore | **DITOLAK.** Tidak ada alasan statistik untuk ini yang sudah terbukti, dan ini mencampur "kualitas relatif saham hari ini" (yang sudah cross-sectional, jadi *otomatis* agak ternormalisasi terhadap kondisi pasar) dengan "apakah sekarang waktu yang tepat untuk membeli apa pun". Dua pertanyaan berbeda tidak boleh dilebur ke satu angka — prinsip yang sama yang membenarkan penghapusan lapisan bonus AI Pick v1 (dipuji di Tahap 1 §13). |
| Regime menggeser ambang Decision Matrix | **DITERIMA.** LensScore tetap murni relatif-terhadap-peer-hari-itu (bisa dibandingkan antar waktu untuk backtest bucket §16). Yang berubah karena regime adalah **tindakan** yang direkomendasikan pada skor tertentu — lebih ketat di bear market, sama di bull market. Ini konsisten dengan disiplin "skor tidak boleh tercemar oleh apa yang seharusnya jadi keputusan terpisah". |
| Regime sebagai position/risk guidance saja (tidak menyentuh threshold maupun skor) | Bagian dari solusi — lihat §13.3, digabung dengan opsi kedua. |

### 13.2 Klasifikasi

```ts
// modules/decision/service/market-regime.service.ts

export type MarketRegimeState = 'STRONG_BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'STRONG_BEAR';

export function classifyMarketRegime(ihsg: OhlcvBar[], breadth: BreadthSnapshot): {
  state: MarketRegimeState;
  score: number;          // -100..100, kontinu, untuk trace/debugging
  components: { trendComponent: number; breadthComponent: number; volComponent: number };
};
```

| Input | Formula |
|---|---|
| Trend IHSG | `(IHSG_close − MA200) / MA200`, dan `slope MA200 = (MA200_t − MA200_{t-20})/MA200_{t-20}` |
| Breadth | `advancing / (advancing + declining)` dari `market-pulse.service.ts` yang **sudah dihitung**, tinggal disalurkan |
| Volatilitas rezim | percentile ATR% IHSG 2 tahun terakhir |

```
regimeScore = 40×sign(trend)×min(1,abs(trend)×10) + 30×(breadthRatio×2−1) + 30×(1 − 2×volPercentile)

STRONG_BULL : regimeScore >= 60
BULL        : 20 <= regimeScore < 60
NEUTRAL     : −20 <= regimeScore < 20
BEAR        : −60 <= regimeScore < −20
STRONG_BEAR : regimeScore < −60
```

**Label:** [HYPOTHESIS] seluruh bobot 40/30/30 dan ambang 60/20/-20/-60.

### 13.3 Penerapan ke Decision Matrix

Lihat §15.2. Ringkas:

```
STRONG_BULL / BULL : ambang normal
NEUTRAL             : ambang BUY +5
BEAR                : ambang BUY +10, STRONG BUY dinonaktifkan (maksimal BUY)
STRONG_BEAR         : ambang BUY +15, STRONG BUY dinonaktifkan, REDUCE/SELL ambang diturunkan 5 (lebih mudah tersentuh)
```

**Label:** [HYPOTHESIS] seluruh pergeseran +5/+10/+15.

---

## 14. CONFIDENCE MODEL

### 14.1 Prinsip: Confidence bukan probabilitas sampai dikalibrasi

Ditegaskan eksplisit sesuai instruksi prompt. `ConfidenceScore` v2 di rilis awal adalah **indeks komposit 0-100**, bukan probabilitas hit-rate. Ia menjadi probabilitas terkalibrasi hanya setelah backtest §16 menghasilkan hit rate historis per bucket confidence — sampai saat itu, UI wajib menampilkannya sebagai "tingkat keyakinan model" bukan "probabilitas benar".

### 14.2 Formula rilis awal (belum dikalibrasi)

```
ConfidenceScore = 100 × ( 0.35×C_dataQuality + 0.25×C_agreement + 0.20×C_history + 0.20×C_stability )
```

| Komponen | Formula | Sumber |
|---|---|---|
| `C_dataQuality` | `dataQuality.score / 100` | §6 — langsung dari DQ, bukan dihitung ulang |
| `C_agreement` | `1 − stdev(pillarScores_tersedia)/50`, clamp `[0,1]` | Enam pilar sepakat ⇒ tinggi; pilar saling bertentangan ⇒ rendah |
| `C_history` | `min(1, bar_tersedia/500)` | Sama dengan `D_depth` di §6.3 — **catatan duplikasi di bawah** |
| `C_stability` | `1 − abs(lensScore_t − lensScore_{t−5}) / 50`, clamp `[0,1]` | Baru — mengukur seberapa stabil skor 5 hari terakhir (skor yang melompat-lompat kurang bisa dipercaya) |

**Catatan penting — koreksi atas draft awal:** `C_history` tumpang-tindih persis dengan `D_depth` (§6.3) — keduanya `bar/500`. Ini **double counting yang sama persis dengan yang dikritik di seluruh dokumen ini**. Diperbaiki: `C_history` di formula final **dihapus**, diganti `C_stability` (di atas), dan bobotnya didistribusikan ulang: `0.35×C_dataQuality + 0.30×C_agreement + 0.35×C_stability`. `dataQuality` sudah membawa informasi depth lewat `D_depth` di dalamnya — tidak perlu diulang di Confidence.

```
ConfidenceScore (FINAL) = 100 × ( 0.35×C_dataQuality + 0.30×C_agreement + 0.35×C_stability )
```

**Label:** [HYPOTHESIS] untuk bobot 0.35/0.30/0.35 dan seluruh konstanta di dalam komponen.

### 14.3 Distance from decision boundary — ditolak untuk rilis awal

Prompt menyarankan "distance from decision boundary" sebagai komponen. **Ditolak untuk v2.0**, dengan alasan: skor 78 pada ambang BUY 65 "jauh" dari batas 65, tapi jarak itu sendiri **bukan** ukuran keyakinan — ia bisa jadi jauh karena datanya benar-benar kuat, atau jauh karena satu pilar ekstrem menutupi ketidaksepakatan pilar lain (kasus yang justru sudah ditangani `C_agreement`). Menambahkannya berisiko double-counting arah yang sama dengan `C_agreement` tanpa menambah informasi baru. Dicatat sebagai kandidat `DO_NEXT` (§27) untuk diuji terpisah setelah backtest berjalan.

### 14.4 Konstanta arbitrer yang WAJIB dihapus dari analyzer lama

Sesuai instruksi eksplisit prompt: konstanta seperti `60 + x×1000` (MACD confidence), `50 + x×500` (EMA confidence), `60 + x×2` (Momentum 1D/5D confidence) di `modules/technical/service/analyzers/*.ts` **tidak diwarisi ke v2 dalam bentuk apa pun**. Analyzer-analyzer itu sendiri dipertahankan hidup untuk explainability (kartu individual di UI, §4.1), tetapi field `confidence`-nya **tidak lagi disalurkan ke Decision Engine v2**. `ConfidenceScore` v2 dihitung murni dari §14.2, independen dari confidence internal tiap analyzer.

### 14.5 Jalur kalibrasi masa depan (setelah backtest tersedia)

```
Setelah bucket test §16 punya >= 2 tahun observasi:

1. Kelompokkan histori (lensScore, confidence, forwardReturn20d) ke bucket confidence
   (0-20, 20-40, ..., 80-100)
2. Hitung hit rate empiris tiap bucket: proporsi forwardReturn20d > 0 (atau > alpha IHSG)
3. Fit fungsi monoton (isotonic regression) confidence_mentah -> hit_rate_empiris
4. Ganti C_agreement/C_stability manual dengan kalibrasi ini SEBAGAI KOMPONEN TAMBAHAN,
   bukan pengganti total (data terbatas di awal membuat kalibrasi hanya reliable
   untuk bucket dengan observasi >= 30)
```

Ini bukan pekerjaan Phase 2 — dicatat di sini supaya arsitekturnya (khususnya §24 model versioning) sejak awal menyimpan data yang dibutuhkan untuk kalibrasi ini nanti.

---

## 15. DECISION MATRIX

### 15.1 Spesifikasi final

```ts
// modules/decision/constants/lensscore.config.ts  -- SEMUA [HYPOTHESIS] UNVALIDATED

export const DECISION_MATRIX_BASE = {
  STRONG_BUY: { minScore: 80, minConfidence: 70 },
  BUY:        { minScore: 65, minConfidence: 50 },
  HOLD:       { minScore: 50, minConfidence: 0  },
  REDUCE:     { minScore: 35, minConfidence: 0  },
  SELL:       { minScore: 0,  minConfidence: 0  },
} as const;

export const REGIME_THRESHOLD_SHIFT: Record<MarketRegimeState, number> = {
  STRONG_BULL: 0,
  BULL: 0,
  NEUTRAL: 5,
  BEAR: 10,
  STRONG_BEAR: 15,
};
```

### 15.2 Algoritma keputusan

```
function decide(lensScore, confidence, riskScore, eligibility, regime):

  if eligibility.blocking:
      return { action: null, advisory: false, status: eligibility.status }

  if lensScore is null:                      // < 3 pilar tersedia, §7.2
      return { action: null, advisory: false, status: 'INSUFFICIENT_DATA' }

  shift = REGIME_THRESHOLD_SHIFT[regime.state]
  strongBuyDisabled = regime.state in {BEAR, STRONG_BEAR}

  effectiveScore = lensScore   // TIDAK digeser oleh regime, hanya ambangnya

  if not eligibility.eligible (non-blocking: LOW_LIQUIDITY / EXTREME_VOLATILITY /
     ABNORMAL_PRICE_MOVEMENT / CORPORATE_ACTION_REVIEW):
      action = classify(effectiveScore, shift, strongBuyDisabled)   // dihitung tetap
      return { action, advisory: false, status: eligibility.status,
               note: 'skor dihitung, TIDAK direkomendasikan karena ' + eligibility.status }

  action = classify(effectiveScore, shift, strongBuyDisabled)

  # Confidence override -- WAJIB, sesuai instruksi eksplisit prompt §13
  if action in {STRONG_BUY, BUY} and confidence < DECISION_MATRIX_BASE[action].minConfidence:
      action = downgrade(action)     # STRONG_BUY -> BUY -> HOLD, satu tingkat

  return { action, advisory: true, status: 'ELIGIBLE' }


function classify(score, shift, strongBuyDisabled):
  if score >= DECISION_MATRIX_BASE.STRONG_BUY.minScore + shift and not strongBuyDisabled:
      return STRONG_BUY
  if score >= DECISION_MATRIX_BASE.BUY.minScore + shift:
      return BUY
  if score >= DECISION_MATRIX_BASE.HOLD.minScore:
      return HOLD
  if score >= DECISION_MATRIX_BASE.REDUCE.minScore:
      return REDUCE
  return SELL
```

### 15.3 Verifikasi eksplisit atas dua syarat wajib dari prompt

| Syarat | Bagaimana ditegakkan |
|---|---|
| "Score tinggi + Confidence rendah ≠ Score tinggi + Confidence tinggi" | Confidence override di §15.2: `action` diturunkan satu tingkat kalau confidence di bawah ambang minimum untuk action itu. Skor 85 + confidence 30 menghasilkan **BUY**, bukan **STRONG BUY**; skor 85 + confidence 80 menghasilkan **STRONG BUY**. Diuji lewat unit test parametrik atas seluruh kombinasi (score bucket × confidence bucket). |
| "Score tinggi + NOT_ELIGIBLE ≠ BUY" | `if eligibility.blocking: return { action: null }` dieksekusi **sebelum** perhitungan action apa pun — score bahkan tidak pernah sampai ke `classify()`. Untuk gate non-blocking, `advisory: false` mencegah UI menampilkannya sebagai rekomendasi meskipun `action` field terisi. Diuji: fixture skor 95 + `LOW_LIQUIDITY` ⇒ `advisory === false`, dan UI-level test memverifikasi field `advisory` menentukan apakah badge BUY dirender. |

### 15.4 Kategori dipertahankan 5, bukan ditambah

Konsisten dengan keputusan Tahap 1 (§16.2 laporan lama): 5 kategori (STRONG BUY/BUY/HOLD/REDUCE/SELL), tidak ditambah "ACCUMULATE" atau sejenisnya. Presisi model saat ini (belum divalidasi sama sekali) tidak menjustifikasi granularitas lebih halus.

---

## 16. TARGET PRICE & RISK/REWARD

### 16.1 Empat konsep dipisah tegas

| Field lama (v1, campur aduk) | Field baru (v2, terpisah) | Sumber | Makna |
|---|---|---|---|
| `fair_value` (DCF/blend) | `fairValue.blended` | `calculateIntrinsicValue()` — dipertahankan | Estimasi nilai intrinsik dari model fundamental, asumsi tetap dinyatakan |
| `tp1/tp2` (ATR-based) | `volatilityBand.upper1/upper2` | `atr14Pct()` — dipertahankan, **direname** | Pita pergerakan wajar berbasis volatilitas historis. **Bukan target harga, bukan prediksi.** |
| — (tidak ada di v1) | `tradingSetup.target` | Baru, §16.3 | Level teknikal yang jadi acuan take-profit **jika** pengguna membuka posisi trading — turunan struktur harga (swing high), bukan sekadar ATR × 2 |
| `rr` (Breakout, bisa meledak) | `tradingSetup.riskRewardRatio` | Baru, §16.3 | RR sesungguhnya dari entry/stop/target yang punya dasar berbeda masing-masing |
| — | `tradingSetup.stopLoss` | Baru | Level invalidasi — kombinasi struktur (swing low) + volatilitas (ATR), bukan salah satu saja |

**Aturan penamaan wajib:** UI **dilarang** menyebut `volatilityBand` sebagai "target harga" atau "target price". Label yang benar: "Rentang Pergerakan Wajar (berbasis ATR)". Ini bug penamaan langsung, bukan hipotesis — v1 sudah salah menamainya (P2-17 Tahap 1).

### 16.2 `fairValue` — perubahan minimal

Dipertahankan strukturnya (blend 5 metode + `SECTOR_RULES`), **tapi** `pbv_vs_implied` yang sudah dihitung untuk faktor Valuation (§8.2) dipakai ulang sebagai salah satu komponen — bukan dihitung dua kali dengan formula berbeda (`NON_BANK_PBV_DIVISOR/MULTIPLIER` v1 vs Gordon formula v2). **Migrasi:** ganti isi `intrinsic_pbv` di `dcf-valuation.service.ts` untuk memakai formula Gordon `(ROE−g)/(r−g)` yang sama dengan §8.2, bukan `ROE/12×0.85`. Ini **menyatukan** dua rumus PBV wajar berbeda yang sekarang hidup terpisah (`dcf-valuation.service.ts` vs faktor registry v2 usulan) — kalau tidak disatukan, aplikasi akan punya **dua** "PBV wajar" berbeda untuk saham yang sama, mengulang persis pola double-engine yang sedang diperbaiki.

**Label:** [BUG FIX] (menyatukan formula yang seharusnya sama) + [STRUCTURAL].

### 16.3 Trading setup

```
entry      = harga terakhir
             (opsional: entry = pullback ke MA20 jika RSI regime-aware > 75 -- DO_NEXT, bukan wajib v2.0)

stopLoss   = min( nearestSwingLow − 0.5×ATR14 , entry − STOP_ATR_MULTIPLE×ATR14 )
             STOP_ATR_MULTIPLE = 2.0   [HYPOTHESIS]

risk       = entry − stopLoss

target     = entry + TARGET_RR_MULTIPLE × risk
             TARGET_RR_MULTIPLE = 2.0   [HYPOTHESIS]  -> RR dasar 2:1

target2    = nearestSwingHigh_di_atas_target   (jika ada; kalau tidak ada, null)

riskRewardRatio = (target − entry) / risk

RULE: jika riskRewardRatio < MIN_ACCEPTABLE_RR (1.5) [HYPOTHESIS]:
      tradingSetup = null
      UI menampilkan: "Tidak ada setup risk/reward memadai saat ini."
```

`nearestSwingLow`/`nearestSwingHigh` dari fungsi fractal yang sama dipakai `market_structure` faktor (§8.4) — **bukan** implementasi kedua, dipakai ulang.

### 16.4 Breakout `rr` — dihapus

`(high20−P)/(P−low20)` (§P2-18 Tahap 1, bisa meledak tak hingga) **dihapus sepenuhnya**, tidak dimigrasi dalam bentuk apa pun. Breakout Radar menampilkan sinyal (`GOLDEN CROSS`, `VOL SPIKE`) sebagai tag, dan `tradingSetup` (§16.3) dipakai kalau pengguna ingin lihat RR — satu sumber RR untuk seluruh aplikasi.

**Label:** [BUG FIX]

---

## 17. DATA LIMITATIONS — FUNDAMENTAL POINT-IN-TIME

### 17.1 Tiga opsi (evaluasi lengkap)

| | **Option A**: Technical-only historical backtest | **Option B**: Bangun arsip sendiri | **Option C**: Provider pihak ketiga point-in-time |
|---|---|---|---|
| **Accuracy** | Tinggi untuk pilar T/M/F (data harga selalu historis akurat). Nol untuk Q/V/G — tidak divalidasi sama sekali, statusnya tetap **BELUM TERBUKTI** selamanya kecuali dikombinasi opsi lain | Sedang → Tinggi, membaik seiring waktu. Mulai dari 0 hari data historis, linear bertambah | Tinggi dari hari pertama (asumsi provider correct) |
| **Complexity** | Rendah — infrastruktur backtest v1 sudah mendukung ini | Sedang — satu tabel, satu cron tambahan (§2 P0-5), sudah punya fondasinya | Tinggi — integrasi API baru, mapping ticker IDX ke provider, kemungkinan beda konvensi field |
| **Cost** | Rp 0 | Rp 0 (infrastruktur Postgres & cron sudah ada & sudah dibayar) | Signifikan — provider point-in-time fundamentals (mis. Refinitiv, Bloomberg, atau vendor lokal) berbayar, dan cakupan IDX sering tidak selengkap AS/global di provider besar |
| **Implementation effort** | Sudah ada | **~1 hari kerja** (§2 P0-5: tabel + insert ke cron eksisting) | Berminggu-minggu (riset vendor, kontrak, integrasi, validasi kecocokan data) |
| **Look-ahead risk** | Tidak ada (tidak memakai data fundamental sama sekali dalam backtest) | Tidak ada **setelah** arsip terkumpul cukup panjang; **selama masa pengumpulan, backtest fundamental tetap tidak bisa dijalankan atas periode sebelum arsip dimulai** | Tidak ada, jika provider benar-benar point-in-time (perlu diverifikasi, bukan diasumsikan) |

### 17.2 Rekomendasi

**Kombinasi A + B, dijalankan bersamaan, tidak berurutan.**

1. **Mulai P0-5 (§2) hari ini** — arsip mulai terkumpul dari titik ini.
2. **Backtest pilar T/M/F segera** dengan Option A — ini valid **sekarang juga**, tidak perlu menunggu apa pun, dan mencakup 3 dari 6 pilar (50% bobot default §7.1: Trend 20 + Momentum 15 + Flow 15 = 50 dari 100).
3. **Backtest pilar Q/V/G ditunda** sampai arsip §17.1-B punya cukup histori. Estimasi realistis: minimal **12 bulan** arsip untuk mendapat variasi kuartal yang berarti (4 laporan kuartalan per emiten), idealnya **24 bulan** untuk melihat lebih dari satu siklus laporan.
4. **Option C ditolak untuk saat ini** — rasio biaya/manfaat tidak masuk akal untuk aplikasi beta. Dicatat sebagai `LATER` (§27), dipertimbangkan ulang hanya jika Option B terbukti menghasilkan sinyal (Q/V/G punya IC positif) dan produk sudah punya basis pengguna yang menjustifikasi biaya vendor.

**Larangan tegas (instruksi eksplisit prompt):** **JANGAN** membuat backtest fundamental yang memakai snapshot Yahoo hari ini untuk mensimulasikan "seolah-olah" data itu tersedia di masa lalu. Kalau tim coding menemukan dirinya menulis kode yang mengambil `quoteSummary()` sekarang dan menerapkannya ke tanggal backtest yang lebih lama dari `writeFundamentalSnapshot()` pertama kali dijalankan, **itu adalah look-ahead bias, hentikan.**

**Label:** [DATA BLOCKER] untuk Q/V/G sampai §17.2 langkah 3 selesai. [STRUCTURAL] untuk keputusan kombinasi A+B.

---

## 18. BACKTEST ARCHITECTURE (v2)

### 18.1 Perbedaan mendasar dari `modules/backtest/` v1

v1 menguji **kombinasi filter indikator biner** (`allBullish(day, filters)`) sebagai sinyal beli/jual dalam simulasi portofolio. v2 menambahkan lapisan baru yang menguji **LensScore sebagai peringkat prediktif**, secara independen dari apakah ia dipakai untuk strategi apa pun. Dua hal berbeda, keduanya dipertahankan:

```
modules/backtest/
  service/simulate.service.ts         [DIPERTAHANKAN, tidak diubah — mesin eksekusi
                                        open D+1 + fee/slippage sudah benar]
  service/precompute.service.ts       [DIPERLUAS — lihat §18.2]
  service/factor-validation.service.ts [BARU — §18.3, bucket test + rank IC]
  service/score-history.service.ts     [BARU — §18.2, penyimpanan skor historis]
  service/strategy-backtest.service.ts [BARU — §18.4, wraps simulate.service.ts
                                        dengan sinyal dari LensScore, bukan filter]
```

### 18.2 Penyimpanan skor historis (prasyarat semua uji)

```ts
// modules/backtest/service/score-history.service.ts

export interface DailyScoreSnapshot {
  ticker: string;
  date: string;
  modelVersion: string;              // §25
  lensScore: number | null;
  pillars: { quality: number|null; valuation: number|null; growth: number|null;
             trend: number|null; momentum: number|null; flow: number|null };
  eligibilityStatus: EligibilityStatus;
  dataQualityScore: number;
  forwardReturn: { d1: number|null; d5: number|null; d20: number|null;
                    d60: number|null; d120: number|null };   // diisi belakangan, lihat catatan
}
```

**Catatan penting soal `forwardReturn`:** tidak bisa diisi saat skor dihitung (masa depannya belum terjadi). Diisi lewat **job terpisah** yang berjalan mundur: setiap hari, cari snapshot 120 hari bursa lalu yang `forwardReturn.d120` masih null, isi dari harga yang sekarang sudah diketahui. Ini bukan look-ahead — job ini murni mengisi kolom retrospektif dari data historis yang sekarang sudah tersedia, tidak dipakai untuk keputusan apa pun secara real-time.

Disimpan di Postgres (tabel baru `lens_score_history`), bukan Redis — butuh query historis rentang tanggal, bukan cache TTL.

### 18.3 Bucket test & Rank IC

```ts
// modules/backtest/service/factor-validation.service.ts

export interface BucketTestResult {
  bucket: string;                    // '90-100', '80-89', ...
  horizon: '1D'|'5D'|'20D'|'60D'|'120D';
  n: number;
  meanReturn: number;
  medianReturn: number;
  meanAlphaVsIhsg: number;
  stdevReturn: number;
  winRate: number;
  maxDrawdownWithinBucket: number;
  tStatVsZero: number;
}

export function runBucketTest(
  snapshots: DailyScoreSnapshot[],
  buckets: [number, number][],       // [[90,100],[80,89],...]
  horizons: Horizon[],
): BucketTestResult[];

export interface RankIcResult {
  factor: 'lensScore' | 'quality' | 'valuation' | 'growth' | 'trend' | 'momentum' | 'flow';
  horizon: Horizon;
  meanIc: number;                    // rata-rata Spearman IC bulanan
  icStdev: number;
  informationRatio: number;          // meanIc / icStdev
  monthsPositive: number;            // dari total bulan
  totalMonths: number;
}

export function runRankIc(snapshots: DailyScoreSnapshot[], horizon: Horizon): RankIcResult[];
```

Rank IC dihitung **per bulan** lalu dirata-rata (bukan sekali atas seluruh periode) — ini standar (Grinold & Kahn) supaya IR bisa dihitung dan konsistensi waktu (§20.1 Tahap 1) bisa diukur, bukan hanya satu angka gabungan yang bisa menyembunyikan periode buruk.

### 18.4 Strategy backtest

```ts
// modules/backtest/service/strategy-backtest.service.ts

export interface LensScoreStrategyConfig {
  topN: number;                      // default 20  [HYPOTHESIS]
  rebalanceFrequency: 'weekly' | 'monthly';
  exitRule: 'below-2N' | 'atr-stop' | 'below-2N-or-atr-stop';
  atrStopMultiple: number;           // default 2.0, dipakai kalau exitRule pakai atr-stop
  minRR: number;                     // dari §16.3, default 1.5
}

export function backtestLensScoreStrategy(
  scoreHistory: DailyScoreSnapshot[],
  cache: BacktestIndicatorCache,           // v1, untuk harga open/close & fee/slippage
  config: LensScoreStrategyConfig,
): StrategyBacktestResult;
```

Mesin eksekusi (`simulateBacktest` dari `modules/backtest/service/simulate.service.ts`) **dipakai ulang tanpa modifikasi** — hanya sumber sinyalnya diganti dari `allBullish(filters)` menjadi `lensScore rank <= topN`. Fee, slippage, eksekusi open D+1 semuanya tetap sama persis (§21.3 Tahap 1: bagian terkuat sistem, tidak disentuh).

**Benchmark wajib (instruksi eksplisit prompt):** IHSG, LQ45 (kalau data tersedia — perlu dicek: Yahoo `^JKLQ45` sudah dipakai `market-pulse.service.ts`, historinya kemungkinan bisa ditarik sama), **dan equal-weight universe eligible** — yang terakhir paling penting untuk memisahkan "skor bekerja" dari "efek small-cap generik".

---

## 19. VALIDATION METHODOLOGY

### 19.1 Split waktu

```
Data tersedia: OHLCV 5 tahun (sudah ada, fetchYahooHistory '5y')
                Fundamental point-in-time: mulai terkumpul dari tanggal P0-5 dijalankan

UNTUK PILAR T/M/F (bisa mulai sekarang):
  TRAINING     : 36 bulan pertama data tersedia
  VALIDATION   : 12 bulan berikutnya
  OUT-OF-SAMPLE: 12-20 bulan terakhir  <- DISENTUH SATU KALI

UNTUK PILAR Q/V/G (menunggu arsip §17):
  Split yang sama diterapkan HANYA atas rentang tanggal >= mulai arsip fundamental.
  Kalau arsip baru 12 bulan, TIDAK ADA split yang valid -- laporkan
  "Q/V/G belum bisa divalidasi, arsip baru N bulan" secara eksplisit,
  JANGAN memaksakan split dari data yang tidak cukup.
```

### 19.2 Walk-forward

```
window: train 24 bulan -> test 6 bulan -> geser 6 bulan -> ulang
menghasilkan ~6 periode uji independen dari 5 tahun data OHLCV

output per window: bobot pilar "optimal" (dari regresi IC atau grid search sederhana),
                    rank IC out-of-window, decision matrix hit rate

METRIK STABILITAS: stdev(bobot_optimal antar window) / mean(bobot_optimal)
  -> tinggi (>50%) berarti model OVERFIT terhadap satu window tertentu,
     sederhanakan (kurangi jumlah faktor) sebelum lanjut kalibrasi
```

### 19.3 Daftar bias & mitigasi konkret

| Bias | Mitigasi di arsitektur ini |
|---|---|
| Look-ahead | `asOf` eksplisit di setiap `StockDecision` (§3.3); fundamental point-in-time (§17); AdjClose restatement dicatat sebagai keterbatasan residual (Tahap 1 P1-15), tidak diperbaiki sepenuhnya di v2.0 — **[HYPOTHESIS]** dampaknya kecil, tapi harus dinyatakan di `backtest-limitations.ts` yang diperluas |
| Survivorship | Universe eligible dihitung **per hari** dari `evaluateEligibility()` atas data historis hari itu (bukan daftar ticker hari ini diterapkan mundur) — ini **memperbaiki sebagian** survivorship v1 karena saham yang baru delisting akan otomatis gagal G2 (`STALE_DATA`) di hari-hari setelah delisting dan keluar dari sample forward, tapi **tidak** menyelesaikan cakupan constituent historis yang hilang total dari data (kalau ticker sudah delisting dan Yahoo tidak lagi menyediakan datanya sama sekali, ia tidak pernah masuk sample dari awal) — **[DATA BLOCKER]** untuk penyelesaian penuh |
| Selection bias | Kriteria lulus (§19.4) ditulis sebelum melihat hasil bucket test pertama; disimpan sebagai file terpisah yang di-commit **sebelum** menjalankan uji |
| Data snooping | Walk-forward §19.2 + pembatasan jumlah kombinasi diuji dicatat manual di `docs/backtest-runs-log.md` |
| Overfitting | §20 Ablation + §19.5 Sensitivity |
| Parameter mining | Maksimal 6 pilar × ≤5 faktor (sudah dibatasi di registry §8), bobot dibulatkan kelipatan 5% |

### 19.4 Kriteria lulus (ditetapkan sebelum melihat hasil)

```
File: modules/backtest/constants/pass-criteria.ts   -- commit SEBELUM run pertama

MONOTONICITY: mean alpha 20D naik monoton dari bucket <50 ke 90-100,
              maksimal 1 pelanggaran berurutan diperbolehkan
SPREAD:       alpha(90-100) - alpha(<50) > 0 DAN t-stat > 2.0
RANK_IC:      meanIc(lensScore, 20D) > 0.03 DAN informationRatio > 0.3
CONSISTENCY:  rank IC positif di >= 60% bulan periode uji
TURNOVER:     turnover top-decile < 40%/bulan
```

Kalau **satu saja** gagal: LensScore v2 **tidak** boleh diklaim tervalidasi, dan **tidak** boleh menggantikan v1 sebagai default (§21 Phase 6 tertahan).

---

## 20. SENSITIVITY & ABLATION TESTING

### 20.1 Sensitivity test

```
Untuk SETIAP bobot pilar (Q,V,G,T,M,F):
  geser individual: base -5pp, base, base +5pp (jaga total=100% dgn redistribusi proporsional
  ke pilar lain)
  ukur: perubahan rank IC, perubahan hasil strategy backtest (CAGR, Sharpe)

Untuk liquidity threshold (ADV_HARD_FLOOR_IDR):
  uji: Rp 500jt, Rp 1M, Rp 2M, Rp 5M
  ukur: n saham eligible, rank IC pada tiap ambang, hasil strategy backtest

Untuk decision threshold (BUY minScore):
  uji: 55, 60, 65, 70, 75
  ukur: n rekomendasi/bulan, win rate, hasil strategy backtest

Untuk risk multiplier (RISK_ADJ_MAX_PENALTY):
  uji: 0.15, 0.30, 0.45
  ukur: hasil strategy backtest dgn/tanpa risk adjustment

Untuk rebalance frequency:
  uji: weekly vs monthly
  ukur: turnover, net return setelah fee
```

**Kriteria "stabil":** perubahan ±5pp bobot pilar menghasilkan perubahan rank IC < 20% relatif dan perubahan Sharpe strategy backtest < 0.3 absolut. Kalau lebih besar dari itu ⇒ model **fragile**, kurangi jumlah pilar/faktor sebelum lanjut ke kalibrasi final.

### 20.2 Ablation test — WAJIB (instruksi eksplisit prompt)

```
Baseline: Full Model (6 pilar + risk adj + liquidity adj + regime)

Bandingkan terhadap:
  A1: tanpa Quality        (bobot direalokasi proporsional ke 5 pilar sisa)
  A2: tanpa Valuation
  A3: tanpa Growth
  A4: tanpa Trend
  A5: tanpa Momentum
  A6: tanpa Flow
  A7: tanpa Risk Adjustment (riskAdj = 1.00 selalu)
  A8: tanpa Liquidity Adjustment (liqAdj = 1.00 selalu, gate G4 tetap aktif)
  A9: tanpa Regime (ambang selalu BASE, tidak digeser)

Metrik pembanding: rank IC 20D, Sharpe strategy backtest, max drawdown

ATURAN: jika A_i mengungguli Baseline secara KONSISTEN (menang di >=4 dari 6
window walk-forward), pilar/adjustment ke-i adalah KANDIDAT DIHAPUS, bukan
otomatis dihapus -- tinjau ulang alasan ekonominya sebelum keputusan final.
```

Ablation dijalankan **setelah** §17 mengumpulkan cukup data untuk Q/V/G — sebelum itu, A1/A2/A3 tidak bisa dijalankan bermakna dan **jangan dipaksakan** dengan data tidak lengkap (sama seperti larangan §17.2).

---

## 21. MIGRATION PLAN

### PHASE 0 — Safety Fixes (P0)

| | |
|---|---|
| Tujuan | Menutup 4+1 temuan P0 dari §2 **tanpa** menyentuh arsitektur v2 |
| File berubah | `ai-pick.service.ts`, `ai-pick-scan.service.ts`, `scoring.service.ts`, `app/api/stock/[ticker]/route.ts` (tambah pemanggilan gate sementara/minimal — lihat catatan), `screener.service.ts` (hapus fallback RSI=50/MACD=0, P1-14 Tahap 1) |
| File baru | `shared/database/schema.service.ts` (tabel `fundamental_history`), `modules/fundamental/repository/fundamental-history.repository.ts` |
| Dependency | Tidak ada — semua di atas modul v1 yang sudah ada |
| Test | Unit test per P0 seperti tercantum di §2 |
| Acceptance | Seperti tercantum di §2 per item |
| Rollback | Setiap fix P0 adalah perubahan lokal, dapat di-revert per-commit tanpa menyentuh modul lain |

**Catatan penting:** P0-3 (eligibility) di Phase 0 diimplementasikan sebagai **versi minimal** — cukup untuk menutup skenario paling berbahaya (saham tidak likuid & suspensi mendapat rekomendasi), **belum** modul `modules/eligibility/` penuh dari §5. Modul penuh menyusul di Phase 1. Ini supaya P0 bisa selesai dalam hitungan hari, bukan menunggu seluruh Phase 1.

### PHASE 1 — Infrastructure

| | |
|---|---|
| Tujuan | Bangun `modules/eligibility/`, `modules/sector/`, `modules/factor/registry/` (kontrak tipe saja, compute function masih bisa stub) |
| File baru | Seluruh struktur §3.1 kecuali `modules/decision/service/lensscore.service.ts` dan turunannya |
| Dependency | Phase 0 selesai |
| Test | Unit test per gate (§5), per sector classifier (§10), integration test pipeline A→B→C→D (tanpa E-M) |
| Acceptance | `evaluateEligibility()` dipanggil dari **semua** entry point scoring existing (v1 tetap jalan, hanya "dibungkus" gate ini di depannya) |
| Rollback | Gate bisa di-bypass lewat feature flag `ELIGIBILITY_ENFORCEMENT=shadow` (log tapi tidak blocking) sebelum `=enforce` |

### PHASE 2 — LensScore v2 (factor engine)

| | |
|---|---|
| Tujuan | Implementasi §6-13 penuh: semua faktor, normalisasi, komposisi pilar, risk, liquidity, confidence |
| File baru | Seluruh `modules/factor/compute/*`, `modules/decision/service/*` |
| Dependency | Phase 1 |
| Test | Unit test per faktor (fixture data dengan nilai diketahui), unit test normalisasi (winsorize + percentile atas populasi sintetis), integration test pipeline penuh A→M |
| Acceptance | `evaluateStock()` mengembalikan `StockDecision` lengkap untuk minimal 20 ticker fixture beragam sektor (termasuk bank, siklikal, teknologi pra-profit) tanpa exception, dengan nilai yang bisa diverifikasi manual |
| Rollback | v2 berjalan **paralel**, tidak menggantikan endpoint mana pun — flag `LENSSCORE_V2_ENABLED` per environment |

### PHASE 3 — Backtest & Calibration

| | |
|---|---|
| Tujuan | §18-20: bucket test, rank IC, walk-forward, sensitivity, ablation |
| File baru | `modules/backtest/service/factor-validation.service.ts`, `score-history.service.ts`, `strategy-backtest.service.ts`, tabel `lens_score_history` |
| Dependency | Phase 2 selesai DAN (untuk T/M/F) minimal 6 bulan OHLCV historis tersedia (sudah ada, 5 tahun) DAN (untuk Q/V/G) arsip §17 cukup panjang |
| Test | Harness test dengan data sintetis berkorelasi diketahui (§2 P0-4 unit test) |
| Acceptance | Kriteria lulus §19.4 dievaluasi dan **hasilnya dilaporkan apa adanya** — lulus atau tidak, keduanya adalah output valid dari fase ini |
| Rollback | N/A — fase ini murni analisis, tidak mengubah production behavior |

### PHASE 4 — Decision Engine (kalibrasi)

| | |
|---|---|
| Tujuan | Kalibrasi ulang bobot/ambang §15 berdasarkan hasil Phase 3, **hanya jika** kriteria lulus §19.4 terpenuhi |
| File berubah | `modules/decision/constants/lensscore.config.ts` — nilai `[HYPOTHESIS]` diganti nilai terkalibrasi, label diubah menjadi `[VALIDATED vX — lihat backtest run <id>]` |
| Dependency | Phase 3 lulus |
| Test | Regression test: hasil Decision Engine dengan config baru dibandingkan config lama atas fixture yang sama, perubahan harus bisa dijelaskan |
| Acceptance | Setiap perubahan konstanta punya sitasi ke backtest run yang memproduksinya (§25) |
| Rollback | Config lama tetap tersimpan sebagai versi terpisah (§25), rollback = ganti pointer versi aktif |

### PHASE 5 — UI Integration

| | |
|---|---|
| Tujuan | Seluruh halaman (§22 daftar lengkap) membaca `StockDecision` dari Decision Engine, bukan lagi dari `calculateScore()`/`runMultiAgentOrchestrator()`/dst secara langsung |
| File berubah | Setiap route di §29 (file-by-file map) |
| Dependency | Phase 4 (atau Phase 2 kalau tim memutuskan rilis "v2 experimental, belum terkalibrasi" — lihat Final Question #6) |
| Test | Snapshot test per halaman: response shape lama vs baru, UI rendering test untuk field baru (eligibility badge, confidence, regime) |
| Acceptance | INVARIAN 1 (§4.4): ticker+asOf sama ⇒ decision sama di semua halaman, diverifikasi integration test lintas-route |
| Rollback | Backward compatibility layer §22 memastikan field lama tetap ada selama masa transisi; UI bisa di-flag mundur ke v1 per halaman independen |

### PHASE 6 — Deprecation

| | |
|---|---|
| Tujuan | Hapus `calculateScore()` v1, `runMultiAgentOrchestrator()` decision logic, `scoreStock()` Screener, ambang duplikat |
| Syarat wajib SEBELUM fase ini dimulai | (a) Phase 5 selesai & stabil di production minimal 30 hari, (b) tidak ada regresi dilaporkan, (c) `score_v1` (§22) tidak lagi diakses oleh consumer manapun (diverifikasi lewat access log / telemetry) |
| File dihapus | `modules/technical/service/scoring.service.ts` (fungsi `calculateScore`, `combine`, `scoreValuasi/Profitabilitas/Kesehatan`, `scoreMATrend/Rsi/Macd/Volume`, `scoreFlowTekanan/Persistensi`), `decisionFromScore()` di `orchestrator.service.ts`, `scoreStock()` di `screener.service.ts`, `ORCHESTRATOR_SCORE_THRESHOLDS`/`SCORING_KATEGORI_THRESHOLDS` di `decision-thresholds.ts` |
| Rollback | **Tidak ada** — ini fase penghapusan permanen. Karena itu syarat di atas wajib, bukan opsional. |

---

## 22. BACKWARD COMPATIBILITY

### 22.1 Consumer yang bergantung pada struktur lama

| Field lama | Dipakai di | Strategi |
|---|---|---|
| `scoring.total_score` | `app/dashboard/page.tsx`, `app/watchlist/page.tsx`, `app/portfolio/page.tsx` | Tetap dikembalikan API sebagai **alias** dari `lensScore.final` (v2) di belakang flag, atau tetap `calculateScore()` v1 murni selama Phase 0-4 |
| `scoring.kategori` | Sama + `alert-evaluation.service.ts` | Alias dari `decision.action` v2 (mapping `STRONG_BUY→'STRONG BUY'` dst.) setelah Phase 5 |
| `consensusData.kategori` | `alert-evaluation.service.ts` (`CONSENSUS_STRONG_BUY` alert type) | **Perlu keputusan produk eksplisit** — lihat catatan di bawah |
| `finalScore`/`baseScore` (AI Pick) | `app/breakout-radar/page.tsx`, `app/home/page.tsx` | Alias dari `lensScore.final` |
| `quant.final_score` (`/multi-agent`) | `app/multi-agent/page.tsx` | Alias, `agent_breakdown` diisi dari pilar v2 (§4.2) |
| `coverage`/`coverage_pct` | Berbagai UI | Diganti `dataQuality.score`, field lama dipertahankan sebagai alias bernilai sama selama masa transisi |

**Catatan tentang `CONSENSUS_STRONG_BUY` alert type:** ini mengandalkan `calculateConsensus()` menghasilkan kata "STRONG BUY" — yang menurut §4.2 justru **dihapus** dari `calculateConsensus()` (diubah jadi label deskriptif). Ini titik gesekan nyata yang perlu keputusan produk: opsi (a) alert type ini diubah untuk membaca `decision.action` dari Decision Engine v2 langsung, bukan dari consensus lama, atau (b) `calculateConsensus()` tetap mengeluarkan kategori vote-nya untuk **keperluan internal alert saja**, tidak ditampilkan ke UI sebagai rekomendasi. **Rekomendasi: opsi (a)** — lebih konsisten dengan Prinsip 3 (satu mesin keputusan), tapi memerlukan migrasi data existing alert users (`condition_type`). Dicatat sebagai keputusan terbuka untuk Phase 5, bukan diputuskan di sini.

### 22.2 Versioning skema respons API

```ts
// Setiap route yang mengekspos skor menambahkan field baru TANPA menghapus lama:

{
  // --- v1 fields, DIPERTAHANKAN selama masa transisi ---
  scoring: { total_score, kategori, technical_score, fundamental_score, flow_score, ... },

  // --- v2 fields, BARU ---
  decision: StockDecision,   // §3.3, lengkap

  // --- metadata versi ---
  _scoreVersions: { active: 'v1' | 'v2', available: ['v1', 'v2'] }
}
```

Konsumen lama (kode UI yang belum dimigrasi) terus membaca `scoring.*` tanpa berubah. Konsumen baru membaca `decision.*`. `_scoreVersions.active` menandai versi mana yang dipakai untuk **keputusan tampilan default** hari itu (dikontrol server-side flag, bukan per-request).

**Label:** [STRUCTURAL]

---

## 23. OBSERVABILITY

### 23.1 `ScoreTrace` — jawaban langsung atas kebutuhan "BBCA BUY — LensScore 78, dari mana asalnya"

```ts
// modules/decision/types/decision.types.ts

export interface ScoreTrace {
  ticker: string;
  timestamp: string;
  asOf: string;
  modelVersion: string;                 // §25

  eligibility: EligibilityResult;
  dataQuality: { score: number; components: Record<string, number>; missingFactors: string[] };

  factors: {
    [factorId: string]: {
      rawValue: number | null;
      normalizedScore: number | null;    // 0-100 setelah percentile
      populationSize: number;            // n saham dalam populasi normalisasi
      normalizationScope: 'global' | 'sector' | 'sector-fallback-global';
      applicable: boolean;
      weightInPillar: number;
    };
  };

  pillars: {
    [pillarName: string]: {
      score: number | null;
      weightInLensScore: number;         // bobot EFEKTIF setelah renormalisasi §7.2
      contributingFactors: string[];     // factorId yang applicable & tersedia
    };
  };

  lensScore: { raw: number; riskAdjustment: number; liquidityAdjustment: number; final: number };
  risk: { score: number; components: Record<string, number> };
  liquidity: { adv20Idr: number; score: number; adjustment: number };
  confidence: { score: number; components: Record<string, number> };
  marketRegime: { state: string; score: number; thresholdShift: number };

  decision: { action: DecisionAction | null; advisory: boolean; reasonCodes: string[] };
}
```

**Setiap angka di `StockDecision` bisa ditelusuri balik ke baris di `ScoreTrace` yang menghasilkannya** — ini yang menjawab kebutuhan eksplisit di prompt §23.

### 23.2 Penyimpanan & akses

- `ScoreTrace` **tidak** disimpan permanen untuk setiap request (terlalu besar, terlalu sering). Dihitung **on-demand** lewat parameter `?trace=true` di endpoint decision, atau otomatis disertakan di environment non-production.
- Untuk keperluan debugging produksi tanpa membebani payload normal: `ScoreTrace` di-log ke `shared/logger/logger.ts` (yang sudah ada) dengan level `debug`, bukan dikembalikan di response body default.
- `DailyScoreSnapshot` (§18.2) adalah versi **ringkas** dari trace yang memang disimpan permanen untuk keperluan backtest — bukan trace penuh.

**Label:** [STRUCTURAL]

---

## 24. MODEL VERSIONING

### 24.1 Skema versi

```
lensscore-v1                    <- calculateScore() existing, tidak pernah berubah lagi
                                    setelah v2 mulai berjalan (frozen)
lensscore-v2.0-experimental     <- Phase 2 selesai, BELUM lulus backtest
lensscore-v2.1-calibrated       <- Phase 4 selesai, bobot dari hasil backtest
lensscore-v2.2-calibrated       <- rekalibrasi berikutnya (mis. setelah arsip Q/V/G cukup)
```

Format: `lensscore-v{MAJOR}.{MINOR}-{status}`. MAJOR naik untuk perubahan struktur pilar/faktor (butuh backtest ulang dari nol). MINOR naik untuk rekalibrasi bobot/ambang dalam struktur yang sama (bisa pakai backtest incremental).

### 24.2 Manifest wajib per backtest run

```ts
// disimpan di modules/backtest/ hasil run, format JSON, satu file per run
export interface BacktestRunManifest {
  runId: string;                       // uuid
  timestamp: string;
  modelVersion: string;
  weights: typeof PILLAR_WEIGHTS_DEFAULT;
  thresholds: typeof DECISION_MATRIX_BASE;
  factorRegistrySnapshot: FactorDefinition[];   // agar reproducible walau registry berubah nanti
  universe: string[];                  // daftar ticker yang dipakai
  dataRange: { start: string; end: string };
  dataSource: { ohlcv: string; fundamental: string };  // mis. 'yahoo-finance2@X.Y.Z'
  transactionCostAssumptions: { slippagePct: number; feeBuyPct: number; feeSellPct: number };
  gitCommitHash: string | null;
  results: { bucketTest: BucketTestResult[]; rankIc: RankIcResult[]; passCriteria: Record<string, boolean> };
}
```

**Aturan wajib:** setiap kali `runBucketTest()`/`runRankIc()`/`backtestLensScoreStrategy()` dijalankan dengan hasil yang akan dikutip di mana pun (dokumentasi, keputusan kalibrasi §21 Phase 4), manifest ini **wajib** disimpan bersamanya. Hasil backtest tanpa manifest **tidak boleh dikutip** sebagai bukti — tidak reproducible.

**Label:** [STRUCTURAL]

---

## 25. TESTING PLAN

Ringkasan lintas-fase (detail per-item sudah tercantum di §2 dan §21 per fase):

| Level | Cakupan | Tools existing yang dipakai |
|---|---|---|
| Unit | Setiap faktor (`modules/factor/compute/*.test.ts`), setiap gate (`modules/eligibility/**/*.test.ts`), normalisasi, komposisi pilar, confidence, decision matrix | `vitest.config.ts` sudah ada di repo |
| Integration | Pipeline penuh A→M (§3.2) atas fixture ticker beragam; konsistensi lintas-halaman (INVARIAN 1) | Pola sudah ada: `app/api/*/route.test.ts`, `modules/*/service/__tests__/*.test.ts` |
| Harness (backtest) | Bucket test & rank IC atas data sintetis berkorelasi diketahui (menguji harness-nya sendiri, bukan modelnya) | Baru |
| Invariant | Grep test INVARIAN 2 (§4.4), no-synthetic-defaults test (grep `?? 50`, `?? 0` di path faktor baru) | Baru, murah |
| Regression | Snapshot response API sebelum/sesudah tiap fase migrasi | Baru |

---

## 26. ACCEPTANCE CRITERIA

Sebelum LensScore v2 boleh menggantikan v1 sebagai default (transisi Phase 5→6):

| Kriteria | Ambang konkret | Cara verifikasi |
|---|---|---|
| **DATA** | Nol `?? <angka>` di seluruh `modules/factor/`, `modules/decision/`, `modules/eligibility/` untuk field yang bisa `null` secara sah | Grep otomatis di CI |
| **CONSISTENCY** | INVARIAN 1 (§4.4) | Integration test lintas-route |
| **ELIGIBILITY** | Nol item `NOT_ELIGIBLE`/eligibility non-ELIGIBLE blocking di AI Pick BUY list | Unit + integration test (P0-1 pattern) |
| **SCORE VALIDATION** | Kriteria lulus §19.4 (monotonicity, spread, rank IC, consistency, turnover) — **semua lima** | Backtest report + manifest §24.2 |
| **STABILITY** | Sensitivity test §20.1: perubahan ±5pp bobot ⇒ perubahan rank IC < 20% relatif | Sensitivity test report |
| **OOS** | Rank IC out-of-sample (disentuh sekali) tetap positif dengan IR > 0.2 | OOS report, dijalankan **sekali**, hasil dicatat permanen |
| **COST** | CAGR strategy backtest setelah fee+slippage tetap > 0 dan > risk-free rate (SBN 10Y, §12 Tahap 1 = 6.7%) | Strategy backtest report |
| **EXPLAINABILITY** | Setiap `StockDecision` production bisa menghasilkan `ScoreTrace` lengkap tanpa error | Integration test §23 |
| **FALLBACK** | Nol `missing → score 0` atau `missing → score 50` tersembunyi — diverifikasi lewat unit test tiap faktor dengan input null menghasilkan `null`, bukan angka | Unit test per faktor |

**Untuk Q/V/G:** kriteria SCORE VALIDATION & OOS **tidak bisa dipenuhi** sampai §17 menghasilkan cukup arsip. Sampai saat itu, v2 boleh berjalan **paralel** (Phase 5, bukan Phase 6) dengan pilar Q/V/G ditandai `unvalidated: true` di response, sementara T/M/F sudah bisa lulus penuh.

---

## 27. IMPLEMENTATION PRIORITY

| Item | Impact | Complexity | Kategori | Fase |
|---|---|---|---|---|
| P0-1 s/d P0-5 (§2) | Tinggi (menutup risiko nyata) | Rendah-Sedang | **DO NOW** | 0 |
| Eligibility Engine penuh (§5) | Tinggi | Sedang | **DO NOW** | 1 |
| Sector classifier manual (§10.1) | Sedang-Tinggi (prasyarat Valuation/Growth sektor-aware) | Rendah (tabel manual ~150 ticker) | **DO NOW** | 1 |
| Factor registry + faktor T/M/F (§8.4-8.6) | Tinggi | Sedang | **DO NOW** | 2 |
| Factor registry faktor Q/V/G (§8.1-8.3) | Tinggi tapi terkunci data | Sedang | **DO NOW** (implementasi) tapi **DO NOT VALIDATE YET** (klaim) | 2 |
| Risk/Liquidity model (§11-12) | Tinggi | Rendah (beta.service.ts sudah ada) | **DO NOW** | 2 |
| Confidence model (§14) | Sedang | Rendah | **DO NOW** | 2 |
| Market regime (§13) | Sedang | Rendah (breadth sudah dihitung) | **DO NOW** | 2 |
| Backtest harness T/M/F (§18) | Tinggi (satu-satunya cara membuktikan apa pun) | Sedang-Tinggi | **DO NOW** | 3 |
| Backtest harness Q/V/G | Tinggi | Sedang | **DO NEXT** (setelah arsip §17 cukup, ~12-24 bulan) | 3 |
| Sensitivity + Ablation (§19-20) | Tinggi (validasi robustness) | Sedang | **DO NEXT** (setelah bucket test T/M/F pertama) | 3 |
| Kalibrasi & Decision Engine final (§21 Phase 4) | Tinggi | Rendah (mekanik setelah data ada) | **DO NEXT** | 4 |
| UI Integration penuh (§21 Phase 5) | Tinggi (user-facing) | Sedang-Tinggi (banyak halaman) | **DO NEXT** | 5 |
| Deprecation v1 (§21 Phase 6) | Rendah (cleanup) | Rendah | **LATER** | 6 |
| Provider fundamental point-in-time eksternal (Option C, §17.1) | Rendah untuk beta | Tinggi + biaya | **DO NOT BUILD YET** | — |
| Bid-ask spread / trading frequency di Liquidity (§12.2) | Rendah (data tidak tersedia) | — | **DO NOT BUILD YET** | — |
| Konstituen historis penuh untuk survivorship (§19.3) | Sedang | Tinggi | **LATER** | — |
| Portfolio-level risk terintegrasi ke LensScore (§11.3) | Rendah untuk v2.0 | Sedang | **LATER** | — |
| Metrik khusus bank (NIM/NPL/CAR/CASA) | Sedang | Tinggi (sumber data belum ada) | **DO NOT BUILD YET** — dicari dulu apakah sumber datanya bisa ditemukan | — |
| Confidence terkalibrasi hit-rate (§14.5) | Tinggi tapi butuh data historis dulu | Rendah setelah data ada | **DO NEXT** (setelah Phase 3) | 4 |
| Entry pullback ke MA20 di trading setup (§16.3 opsional) | Rendah | Rendah | **LATER** | — |

---

## 28. FILE-BY-FILE CHANGE MAP

### File BARU

```
modules/eligibility/
  index.ts
  constants/eligibility.constants.ts
  service/eligibility.service.ts
  service/abnormal-movement.service.ts
  service/auto-rejection.service.ts
  types/eligibility.types.ts
  __tests__/eligibility.service.test.ts
  __tests__/abnormal-movement.service.test.ts
  __tests__/auto-rejection.service.test.ts

modules/factor/
  index.ts
  registry/factor-registry.ts
  registry/sector-applicability.ts
  compute/quality.factors.ts          + __tests__/
  compute/valuation.factors.ts        + __tests__/
  compute/growth.factors.ts           + __tests__/
  compute/trend.factors.ts            + __tests__/
  compute/momentum.factors.ts         + __tests__/
  compute/flow.factors.ts             + __tests__/
  normalize/percentile.ts             + __tests__/
  types/factor.types.ts

modules/decision/
  index.ts
  constants/lensscore.config.ts
  service/lensscore.service.ts        + __tests__/
  service/data-quality.service.ts     + __tests__/
  service/risk.service.ts             + __tests__/
  service/liquidity.service.ts        + __tests__/
  service/confidence.service.ts       + __tests__/
  service/market-regime.service.ts    + __tests__/
  service/decision-engine.service.ts  + __tests__/
  service/score-trace.service.ts
  types/decision.types.ts

modules/sector/
  constants/idx-ic-mapping.ts
  service/sector-classifier.service.ts + __tests__/

modules/backtest/service/
  factor-validation.service.ts        + __tests__/
  score-history.service.ts            + __tests__/
  strategy-backtest.service.ts        + __tests__/

modules/fundamental/repository/
  fundamental-history.repository.ts   + __tests__/

shared/config/
  idx-exchange-rules.ts               <- KOSONG, isi manual (§5.4)

modules/backtest/constants/
  pass-criteria.ts                    (§19.4)

docs/
  backtest-runs-log.md
  score-versions.md                   (§24, tabel manifest tiap run)
```

### File DIUBAH

```
modules/technical/service/scoring.service.ts
  Phase 0: hapus fallback tersembunyi (tidak ada di file ini secara langsung, sudah bersih)
  Phase 0: perbaiki combine()/coverage (P0-2)
  Phase 6: HAPUS SELURUHNYA

modules/recommendation/service/ai-pick.service.ts
  Phase 0: tambah field `kategori`, perbaiki filter (P0-1)
  Phase 5: baca dari StockDecision, bukan ScoredStock v1

modules/recommendation/service/ai-pick-scan.service.ts
  Phase 0: teruskan `scoring.kategori`
  Phase 5: panggil evaluateStock() bukan calculateScore()

modules/market/service/screener.service.ts
  Phase 0: hapus fallback rsi=50/macd=0/ma=0 (P1-14 Tahap 1)
  Phase 5: hapus scoreStock(), ganti dengan preset bobot pilar (§4.3)

modules/ai/service/orchestrator.service.ts
  Phase 5: decisionFromScore() dihapus, agent_breakdown dirender dari pilar v2

modules/technical/service/consensus.service.ts
  Phase 5: hapus field kategori/konsensus yang berbunyi BUY/SELL,
           ganti label deskriptif vote

modules/recommendation/service/breakout.service.ts
  Phase 5: hapus field `rr`, pertahankan signals sebagai tag saja

modules/fundamental/service/dcf-valuation.service.ts
  Phase 2: ganti formula intrinsic_pbv non-bank ke Gordon (ROE-g)/(r-g),
           satukan dengan pbv_vs_implied faktor (§16.2)

modules/technical/service/decision-thresholds.ts
  Phase 6: SCORING_KATEGORI_THRESHOLDS & ORCHESTRATOR_SCORE_THRESHOLDS dihapus

shared/database/schema.service.ts
  Phase 0: tabel fundamental_history
  Phase 3: tabel lens_score_history

app/api/cron/fundamental-snapshot/route.ts
  Phase 0: tambah insert ke fundamental_history repository

app/api/stock/[ticker]/route.ts
  Phase 0: panggil eligibility minimal
  Phase 5: panggil evaluateStock(), response berisi decision.* + scoring.* (§22.2)

app/api/ai-pick/route.ts, app/api/recommendations/route.ts,
app/api/screener/route.ts, app/api/agents/orchestrator/route.ts,
app/api/council/route.ts
  Phase 5: baca dari Decision Engine, response versioning §22.2

app/dashboard/page.tsx, app/home/page.tsx, app/breakout-radar/page.tsx,
app/watchlist/page.tsx, app/portfolio/page.tsx, app/multi-agent/page.tsx,
app/screener/page.tsx, app/recommendations/page.tsx
  Phase 5: tampilkan field baru (eligibility badge, confidence, regime,
           data quality) di samping field lama (backward compat §22.1)

modules/notification/service/alert-evaluation.service.ts
  Phase 5: keputusan produk §22.1 soal CONSENSUS_STRONG_BUY
```

### File DIHAPUS (Phase 6 saja, setelah syarat §21 terpenuhi)

```
lib/utils/lens-score-breakdown.ts     (momentumScore, riskScore v1)
[fungsi-fungsi di scoring.service.ts yang disebutkan di atas]
[decisionFromScore() di orchestrator.service.ts]
```

---

## 29. FINAL IMPLEMENTATION CHECKLIST

```
PHASE 0
[ ] Tabel fundamental_history dibuat, cron insert berjalan (P0-5)
[ ] coverage_pct diperbaiki + unit test 5 kombinasi (P0-2)
[ ] AI Pick filter kategori DATA TIDAK CUKUP + unit test (P0-1)
[ ] Eligibility minimal (likuiditas + stale) dipasang di /api/stock/[ticker] (P0-3 minimal)
[ ] Fallback rsi=50/macd=0/ma=0 dihapus dari screener.service.ts (P1-14)
[ ] Semua unit test P0 hijau

PHASE 1
[ ] modules/eligibility/ lengkap, 7 gate + 2 lapis ARA/ARB, semua diuji
[ ] IDX_AUTO_REJECTION_RULES kosong dengan komentar eksplisit (BUKAN diisi asal)
[ ] modules/sector/ dengan tabel manual ~150-200 ticker eligible + fallback Yahoo
[ ] Feature flag ELIGIBILITY_ENFORCEMENT shadow->enforce terpasang

PHASE 2
[ ] factor-registry.ts berisi 21 faktor (5+4+3+4+4+4) sesuai §8, masing-masing diuji unit
[ ] normalize/percentile.ts dengan winsorizing, diuji atas populasi sintetis
[ ] lensscore.service.ts: renormalisasi pilar hilang, ambang 3-pilar-minimum
[ ] risk.service.ts memakai beta.service.ts existing (bukan reimplementasi)
[ ] liquidity.service.ts, confidence.service.ts, market-regime.service.ts
[ ] decision-engine.service.ts: evaluateStock() end-to-end, INVARIAN 3 diuji
[ ] ScoreTrace lengkap untuk minimal 20 ticker fixture lintas sektor

PHASE 3
[ ] score-history.service.ts + tabel lens_score_history + job pengisi forwardReturn
[ ] factor-validation.service.ts: bucket test + rank IC, diuji dengan data sintetis dulu
[ ] Bucket test T/M/F dijalankan atas data live, manifest disimpan
[ ] pass-criteria.ts di-commit SEBELUM run pertama dieksekusi
[ ] Sensitivity test §20.1 dijalankan, hasil didokumentasikan
[ ] Ablation test §20.2 dijalankan (T/M/F dulu; Q/V/G menyusul setelah arsip cukup)
[ ] Walk-forward §19.2 dijalankan, stabilitas bobot diukur

PHASE 4
[ ] Kriteria lulus §19.4 dievaluasi, hasil dilaporkan (lulus ATAU tidak, appa adanya)
[ ] Jika lulus: lensscore.config.ts diperbarui, versi -> v2.1-calibrated
[ ] Jika tidak lulus: didokumentasikan kenapa, model disederhanakan, ulang Phase 3

PHASE 5
[ ] Response API semua route berisi decision.* + scoring.* (v1) berdampingan
[ ] Semua halaman di §29 (map) dirender dengan field baru
[ ] INVARIAN 1 diuji lintas-route
[ ] Keputusan CONSENSUS_STRONG_BUY alert diselesaikan (opsi a atau b, §22.1)

PHASE 6 (hanya jika semua syarat §21 terpenuhi)
[ ] 30 hari stabil di production, nol regresi
[ ] Access log menunjukkan score_v1 tidak lagi diakses
[ ] File-file v1 dihapus sesuai §28
```

---

# IMPLEMENTATION HANDOFF

Bagian ini ditulis untuk coding agent yang akan mengeksekusi blueprint ini tanpa akses ke penalaran quant di atas — hanya instruksi presisi.

## Urutan eksekusi wajib

1. **Jangan mulai dari Phase 2.** Phase 0 dulu, selalu. P0-5 (arsip fundamental) adalah commit pertama yang paling mendesak — deploy secepatnya, terlepas dari progres bagian lain.
2. **Setiap konstanta berlabel `[HYPOTHESIS]` di dokumen ini harus menjadi named export di file `constants/*.config.ts`, bukan literal di dalam fungsi.** Alasan: supaya Phase 4 (kalibrasi) hanya perlu mengubah satu file, bukan mencari literal tersebar di puluhan file seperti kondisi v1 sekarang.
3. **Setiap fungsi `compute()` di factor registry adalah fungsi murni**: `(ctx: FactorComputeContext) => number | null`. Tidak boleh melakukan I/O sendiri (fetch, query DB). `FactorComputeContext` disiapkan sepenuhnya oleh pipeline sebelum faktor dipanggil. Ini supaya setiap faktor bisa diuji unit tanpa mock jaringan — pola yang sama seperti `modules/recommendation/service/ai-pick.service.ts` yang sudah dipuji Tahap 1 karena "sengaja tanpa I/O apa pun".
4. **Dilarang menulis `?? 50`, `?? 0`, `?? 15500`, atau default numerik apa pun** untuk data yang bisa hilang, di seluruh modul baru (`eligibility/`, `factor/`, `decision/`, `sector/`). Nilai hilang selalu `null`, mengalir sampai titik komposisi yang secara eksplisit tahu cara merenormalisasi bobot (§7.2/§7.3). Ini bukan gaya penulisan — ini pelanggaran akan mengulang kembali kelas bug C-7/H-2/H-4/H-14 yang dua audit sebelumnya sudah tutup satu per satu.
5. **`IDX_AUTO_REJECTION_RULES` di `shared/config/idx-exchange-rules.ts` HARUS tetap array kosong `[]` setelah implementasi selesai.** Ini bukan TODO yang boleh diisi asal oleh coding agent. Mengisinya dengan angka yang tidak diverifikasi dari dokumen resmi IDX adalah **pelanggaran** terhadap instruksi eksplisit di blueprint ini (§5.4), lebih buruk daripada membiarkannya kosong.
6. **`__tests__` ditulis SEBELUM atau BERSAMAAN dengan implementasi**, bukan setelah. Setiap faktor di registry (§8) punya minimal 3 test: (a) nilai valid menghasilkan skor yang benar secara matematis, (b) input null menghasilkan output null (bukan default), (c) sektor `inapplicableFor` menghasilkan `applicable: false` bukan dihitung sebagai 0.
7. **Jangan implementasikan Phase 3 (backtest) sebelum Phase 2 selesai dan diuji.** Backtest atas factor engine yang belum diuji unit hanya akan mengukur bug, bukan mengukur model.
8. **Setiap kali ragu antara "buat lebih canggih" vs "buat lebih sederhana", pilih sederhana** — lihat §27 DO_NOT_BUILD_YET. Tugas coding agent bukan memaksimalkan kecanggihan.

## Definisi selesai per Phase

Sebuah fase **tidak selesai** hanya karena kodenya sudah menyala tanpa error. Fase selesai ketika **checklist §29 untuk fase itu semua tercentang**, termasuk butir test dan dokumentasi.

## Yang TIDAK boleh dilakukan coding agent tanpa eskalasi ke manusia

- Mengisi `IDX_AUTO_REJECTION_RULES` dengan angka.
- Mengubah kriteria lulus di `pass-criteria.ts` setelah backtest pertama dijalankan.
- Menjalankan out-of-sample test lebih dari sekali dengan parameter berbeda ("coba lagi kalau OOS jelek") — itu p-hacking, dilarang eksplisit (§19.4).
- Menghapus modul v1 sebelum syarat Phase 6 di §21 terpenuhi seluruhnya.
- Mengklaim pilar Q/V/G "tervalidasi" berdasarkan backtest yang memakai data fundamental hari ini diterapkan ke tanggal masa lalu (§17.2 larangan eksplisit).

---

# FINAL QUESTION

### 1. Apa saja yang aman langsung diimplementasikan?

Semua item berlabel `[BUG FIX]` dan `[STRUCTURAL]` di seluruh dokumen ini — termasuk P0-1 s/d P0-5 penuh, Eligibility Engine (arsitekturnya, bukan angka thresholdnya), Factor Registry (strukturnya, bukan bobotnya), Sector classifier, Risk/Liquidity model (strukturnya), Confidence model (strukturnya), penghapusan `rr` Breakout yang bisa meledak, penyatuan formula PBV wajar. Ini semua aman karena benar secara rekayasa perangkat lunak terlepas dari apakah angka di dalamnya nanti terbukti optimal.

### 2. Apa yang harus menunggu backtest?

Setiap angka berlabel `[HYPOTHESIS]`: bobot pilar 20/20/10/20/15/15, ambang Decision Matrix 80/65/50/35, ambang likuiditas Rp1M/Rp5M, `RISK_ADJ_MAX_PENALTY=0.30`, pergeseran ambang rezim +5/+10/+15, bobot Confidence 0.35/0.30/0.35, `STOP_ATR_MULTIPLE=2.0`, `TARGET_RR_MULTIPLE=2.0`. Semua ini **boleh diimplementasikan sebagai nilai default berjalan**, tapi **tidak boleh diklaim benar** sampai §19.4 lulus.

### 3. Apa yang tidak dapat divalidasi dengan sumber data sekarang?

Pilar Quality dan Growth **sepenuhnya** (butuh data multi-tahun yang Yahoo TTM tidak sediakan), pilar Valuation **sebagian** (faktor `pbv_vs_implied` butuh beta yang sudah ada dan bisa jalan, tapi validasi historisnya tetap terkunci fundamental point-in-time). Indeks sektor IDX resmi (dipakai `rs_vs_sector_3m`) — diganti proxy equal-weight universe. Bid-ask spread, trading frequency, status suspensi resmi, NIM/NPL/CAR/CASA bank — **DATA BLOCKER permanen** dengan sumber data yang ada hari ini.

### 4. Apa minimum viable LensScore v2 yang realistis untuk SahamLens beta?

**3 pilar: Trend (bobot dinaikkan sementara ke ~40%), Momentum & RS (~35%), Flow (~25%)** — tanpa Quality/Valuation/Growth. Ditampilkan eksplisit sebagai **"LensScore Teknikal"**, bukan LensScore penuh, sampai arsip fundamental cukup. Ini realistis karena satu-satunya bagian yang bisa dibacktest **sekarang, hari ini**, tanpa menunggu apa pun. Menjual "LensScore 6 pilar" sebelum Q/V/G punya satu observasi backtest pun adalah persis kesalahan yang review Tahap 1 mengkritik pada v1.

### 5. Urutan implementasi paling aman dari commit pertama sampai LensScore v2 production-ready?

```
1. P0-5 (arsip fundamental) — commit hari ini, terpisah dari semua yang lain
2. P0-1, P0-2 (bug fix murni, tidak butuh arsitektur baru)
3. P0-3 minimal (eligibility likuiditas+stale saja, bukan 7 gate penuh)
4. Eligibility Engine penuh + Sector classifier (Phase 1)
5. Factor Registry T/M/F saja dulu (bukan Q/V/G) + Risk/Liquidity/Confidence/Regime (Phase 2 parsial)
6. Backtest harness + bucket test T/M/F (Phase 3 parsial) -- TITIK KEPUTUSAN PERTAMA:
   lulus §19.4 untuk 3-pilar? kalau ya, lanjut; kalau tidak, sederhanakan dulu SEBELUM
   menambah kompleksitas Q/V/G
7. Rilis "LensScore Teknikal" v2.0-experimental paralel dengan v1 (Phase 5 parsial,
   hanya untuk skor teknikal, bukan skor penuh)
8. Paralel dengan 7: mulai Factor Registry Q/V/G (implementasi, bukan validasi)
9. Setelah arsip fundamental >= 12 bulan: backtest Q/V/G, gabung ke LensScore penuh
10. Kalibrasi final (Phase 4), UI integration penuh (Phase 5), lalu baru deprecation v1 (Phase 6)
```

### 6. Apakah LensScore v1 sebaiknya tetap berjalan paralel selama validasi v2?

**Ya, wajib**, sampai Phase 6. Ini bukan preferensi, ini konsekuensi langsung dari §21/§26: v2 tidak boleh menggantikan v1 sebelum lulus acceptance criteria yang butuh data historis yang belum ada. Mematikan v1 lebih awal berarti aplikasi tanpa satu pun mesin skor yang teruji berjalan di production — lebih buruk dari kondisi sekarang, bukan lebih baik.

### 7. Apa kondisi objektif yang harus dipenuhi sebelum v1 boleh dimatikan?

Seluruh baris di §26 (Acceptance Criteria) terpenuhi **dan** seluruh checklist Phase 5 di §29 tercentang **dan** 30 hari stabil di production tanpa regresi **dan** access log membuktikan tidak ada consumer yang masih membaca `score_v1`. Empat syarat, semua wajib, tidak ada yang opsional.

---

## Ringkasan sikap metodologis dokumen ini

`BELUM TERBUKTI`: seluruh bobot pilar, seluruh ambang keputusan, apakah pilar Flow (proxy dari proxy) punya nilai prediktif sama sekali, apakah momentum 12-1 bekerja di IDX, apakah persentil mengalahkan ambang absolut di data IDX nyata.

`JANGAN IMPLEMENTASIKAN SEBELUM DIVALIDASI`: penggunaan LensScore v2 sebagai satu-satunya dasar rekomendasi publik (STRONG BUY/BUY dst ke pengguna akhir) sebelum §19.4 lulus untuk pilar yang bersangkutan.

`DATA BLOCKER`: validasi historis pilar Quality & Growth sebelum arsip §17 cukup panjang; bid-ask spread; trading frequency; status suspensi resmi; metrik bank granular (NIM/NPL/CAR/CASA); indeks sektor IDX resmi; provider fundamental point-in-time eksternal (ditolak untuk beta atas dasar biaya, bukan atas dasar tidak mungkin).

**STOP — TIDAK ADA IMPLEMENTASI SAMPAI ADA PERSETUJUAN EKSPLISIT ATAS BLUEPRINT INI.**


