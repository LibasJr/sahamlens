# SAHAMLENS — PHASE 0 IMPLEMENTATION REPORT

**Tanggal:** 2026-08-05
**Spesifikasi acuan:** `SAHAMLENS_QUANT_IMPLEMENTATION_BLUEPRINT_V2.md` (§2 P0-1 s/d P0-5, §21 Phase 0)
**Cakupan:** SAFETY FIXES ONLY. Phase 1+ tidak disentuh.
**Status:** PHASE 0 IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT AUDIT

---

## 1. EXECUTIVE SUMMARY

Lima temuan P0 ditutup tanpa menyentuh arsitektur v2:

| Item | Status | Inti perubahan |
|---|---|---|
| **P0-1** AI Pick meloloskan `DATA TIDAK CUKUP` | SELESAI | `kategori` + `eligibilityStatus` dibawa sampai `ScoredStock`; penyaringan terjadi **sebelum** pemeringkatan; entri cache lama fail-closed |
| **P0-2** `coverage_pct` melebih-lebihkan kelengkapan | SELESAI | `Component.max` dipecah jadi `availableMax` (pembilang) + `declaredMax` (penyebut, konstan) |
| **P0-3** Belum ada eligibility gate | SELESAI (versi minimal) | Modul baru `modules/eligibility/` — 5 gerbang yang bisa ditegakkan dari data nyata; `decision.action = null` saat tidak layak |
| **P0-4** LensScore belum divalidasi | SENGAJA TIDAK DIKERJAKAN | Hanya prasyaratnya (arsip P0-5) yang dibangun. Tidak ada kalibrasi, tidak ada klaim validasi |
| **P0-5** Arsip fundamental point-in-time | SELESAI | Tabel `fundamental_history` append-only + repository + `asOf()` + INSERT di cron yang sudah jalan |

Ditambah: fallback analitis palsu (`RSI ?? 50`, `MACD ?? 0`, `MA ?? 0`) dihapus dari tiga jalur skor yang masih memakainya.

**Verifikasi:** typecheck PASS (exit 0), unit + integration test PASS (359/359, 42 file), production build PASS (exit 0). `npm run lint` GAGAL — **PRE-EXISTING**, lihat §16.

**Yang harus disadari sebelum rilis:** daftar AI Pick akan MENGECIL, dan `coverage_pct` akan TURUN untuk banyak saham. Keduanya adalah tujuan perbaikan ini, bukan regresi. Setelah deploy, AI Pick kemungkinan **kosong** sampai cron `ai-pick-scan` berikutnya menimpa cache (entri lama belum punya field kelayakan) — API mengembalikan `note` yang menjelaskan ini apa adanya.

---

## 2. BASELINE STATE (kondisi source code sebelum perubahan)

Diverifikasi ulang terhadap kode terbaru, bukan diasumsikan dari blueprint:

| Temuan blueprint | Masih relevan? | Bukti di kode saat audit ulang |
|---|---|---|
| P0-1 `rankAiPicks()` hanya menyaring skor | YA | `ai-pick.service.ts:168` — `.filter((i) => i.finalScore >= MIN_SCORE)`. `ScoredStock` tidak punya field `kategori`; `scoreOne()` membuang `scoring.kategori` |
| P0-2 `combine()` menghitung penyebut dari `c.max` yang menyusut | YA | `scoring.service.ts:319-329` + `scoreValuasi/Profitabilitas/Kesehatan` yang menaikkan `max` per sub-metrik |
| P0-3 tidak ada lapisan kelayakan | YA | Tidak ada file/fungsi kelayakan manapun di repo |
| P0-4 backtest menguji filter biner, bukan skor | YA | `modules/backtest/` tidak berubah |
| P0-5 cron menulis Redis TTL 24 jam, menimpa | YA | `ai-pick-cache.ts:34-36` + `app/api/cron/fundamental-snapshot/route.ts:58` |
| P1-14 fallback RSI 50 / MACD 0 / MA 0 di screener | YA | `screener.service.ts:193-196, 221-223` |

**Perubahan source code setelah blueprint dibuat:** tidak ditemukan. Nomor baris di blueprint masih cocok. Beberapa fallback palsu yang disebut dokumen audit lama (`local-council.service.ts`, `app/api/stock/[ticker]`) SUDAH diperbaiki sebelum tugas ini — diverifikasi ulang, tidak diubah lagi.

**Perbedaan blueprint vs kode yang ditemukan:** satu kontradiksi internal di blueprint sendiri, lihat §17 Deviasi #1.

---

## 3. FILES CHANGED

### File BARU

```
modules/eligibility/
  index.ts
  constants/eligibility.constants.ts
  types/eligibility.types.ts
  service/eligibility.service.ts
  service/advisory.service.ts
  __tests__/eligibility.service.test.ts        (24 test)
  __tests__/advisory.service.test.ts           (10 test)

modules/fundamental/repository/
  fundamental-history.repository.ts
  __tests__/fundamental-history.repository.test.ts   (15 test)

SAHAMLENS_PHASE0_IMPLEMENTATION_REPORT.md      (dokumen ini)
```

### File DIUBAH

| File | Perubahan |
|---|---|
| `shared/database/schema.service.ts` | + tabel `fundamental_history` + index |
| `app/api/cron/fundamental-snapshot/route.ts` | + INSERT arsip (cache Redis TETAP ditulis) |
| `modules/technical/service/scoring.service.ts` | P0-2: `Component.availableMax`/`declaredMax`, `combine()`, `MIN_COVERAGE_PCT` diexport |
| `modules/recommendation/service/ai-pick.service.ts` | P0-1: `kategori`/`eligibilityStatus` di `ScoredStock`, `isEligibleForAdvisory()`, penyaringan sebelum ranking |
| `modules/recommendation/service/ai-pick-scan.service.ts` | P0-1/P0-3: meneruskan `scoring.kategori` + memanggil gerbang kelayakan |
| `modules/recommendation/service/breakout.service.ts` | Hapus `calculateRsi(...) ?? 50` |
| `modules/market/service/screener.service.ts` | Hapus `rsi:50/macd:0/ma:0`; `signal` digerbangi kelayakan; + `eligibility_status`/`eligibility_reasons` |
| `app/api/stock/[ticker]/route.ts` | + `eligibility` + `decision` (aditif; `scoring` v1 tidak diubah) |
| `app/api/ai-pick/route.ts` | + `scanned`/`eligible` + `note` jujur saat cache berbentuk lama |
| `modules/notification/service/alert-evaluation.service.ts` | `CONSENSUS_STRONG_BUY` menghormati `decision.advisory` |
| `app/dashboard/page.tsx` | Badge & PDF menghormati `decision.advisory` |
| `app/portfolio/page.tsx` | `scoreLabel` menghormati `decision.advisory` |
| `app/home/page.tsx`, `app/breakout-radar/page.tsx` | Empty state jujur (menyebut sebabnya) |
| `modules/technical/service/__tests__/scoring.service.test.ts` | +13 test (P0-2 + kompatibilitas v1 + adversarial) |
| `modules/recommendation/service/__tests__/ai-pick.service.test.ts` | +20 test (P0-1 + P0-3 + adversarial) |

---

## 4. DATABASE CHANGES

**FILE** `shared/database/schema.service.ts`
**FUNCTION** `ensureSharedSchema()`

**BEFORE** — tidak ada tabel fundamental historis. Snapshot hanya hidup di satu key Redis ber-TTL 24 jam.

**AFTER**

```sql
CREATE TABLE IF NOT EXISTS fundamental_history (
  ticker TEXT NOT NULL,
  observed_date DATE NOT NULL,
  per NUMERIC, pbv NUMERIC, roe NUMERIC, der NUMERIC,
  current_ratio NUMERIC, revenue_growth NUMERIC,
  source TEXT NOT NULL DEFAULT 'yahoo-quoteSummary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, observed_date)
);
CREATE INDEX IF NOT EXISTS idx_fundamental_history_date
  ON fundamental_history (observed_date);
```

**WHY**
- `PRIMARY KEY (ticker, observed_date)` = uniqueness + index untuk as-of query (`WHERE ticker=$1 AND observed_date <= $2 ORDER BY observed_date DESC LIMIT 1` memakai btree multikolom dengan kolom pertama terikat).
- Index tanggal terpisah untuk query lintas-ticker per tanggal, yang tidak bisa memakai index PK.
- `DATE`, bukan `TIMESTAMPTZ`: yang bermakna adalah harinya; membandingkan timestamp lintas zona waktu justru sumber bug as-of.
- Kolom nilai NULLABLE: "sumber tidak menyediakan angka ini pada hari itu" adalah fakta yang wajib ikut terarsip. Kalau barisnya di-skip, `asOf()` akan mengembalikan angka hari sebelumnya seolah masih berlaku.
- `CREATE TABLE/INDEX IF NOT EXISTS` — idempoten & aditif, konsisten dengan pola tabel lain di file yang sama. Tidak ada FK/migrasi destruktif.

**TEST** `modules/fundamental/repository/__tests__/fundamental-history.repository.test.ts`

---

## 5. P0-1 — AI PICK SAFETY FIX

**FILE** `modules/recommendation/service/ai-pick.service.ts`
**FUNCTION** `rankAiPicks()` (+ fungsi baru `isEligibleForAdvisory()`), tipe `ScoredStock`/`AiPickItem`

**BEFORE**

```ts
return items
  .filter((i) => i.finalScore >= MIN_SCORE)
  .sort(...)
```

`coverage` dibawa sampai item tapi tidak pernah dievaluasi. `kategori` tidak pernah ikut dibawa dari `scoreOne()` — `ScoredStock` tidak punya field-nya. Saham dengan fundamental & flow kosong (hanya teknikal) bisa mendapat `total_score` mendekati 100 karena renormalisasi, lalu menempati peringkat teratas daftar "hari ini beli apa" — padahal `calculateScore()` untuk saham yang sama mengembalikan `kategori: 'DATA TIDAK CUKUP'`.

**AFTER**

```ts
function isEligibleForAdvisory(s: ScoredStock): boolean {
  if (s.eligibilityStatus !== 'ELIGIBLE') return false;          // P0-3
  if (s.kategori != null) return s.kategori !== 'DATA TIDAK CUKUP';
  if (typeof s.coverage === 'number' && Number.isFinite(s.coverage)) {
    return s.coverage >= MIN_COVERAGE_PCT;                        // entri cache lama
  }
  return false;                                                   // fail-closed
}

const eligible = (Array.isArray(scored) ? scored : []).filter(isEligibleForAdvisory);
const items: AiPickItem[] = eligible.map(...)
```

**WHY**
- Penyaringan terjadi **sebelum** pembentukan item & pemeringkatan — saham tidak layak tidak pernah menjadi kandidat, bukan sekadar diberi peringkat rendah. Skornya tidak dikurangi, dan tidak diganti HOLD.
- `MIN_COVERAGE_PCT` diimpor dari `scoring.service.ts` (satu sumber dengan `getKategori()`), bukan angka baru.
- Cache audit: `ai-pick-scores` ber-TTL 3 hari bisa berisi entri yang ditulis sebelum field ini ada. Redis tidak menegakkan tipe TypeScript, jadi bentuk lama itu nyata. Aturannya fail-closed: `kategori` tidak ada → turunkan dari `coverage`; `coverage` juga tidak ada / `NaN` → **keluarkan**.
- Konsumen API (`app/api/ai-pick/route.ts`) hanya memanggil `rankAiPicks()`, jadi tidak ada jalur bypass di route. UI (`/home`, `/breakout-radar`) diberi empty state yang menyebut sebabnya.

**TEST** `ai-pick.service.test.ts` — 11 test baru di blok "P0-1", termasuk ACCEPTANCE test yang membuktikan tidak ada item hasil dengan `coverage < 55` maupun `kategori === 'DATA TIDAK CUKUP'`.

---

## 6. P0-2 — COVERAGE CALCULATION FIX

**FILE** `modules/technical/service/scoring.service.ts`
**FUNCTION** `combine()`, `scoreValuasi()`, `scoreProfitabilitas()`, `scoreKesehatan()`, tipe `Component`

**BEFORE**

```ts
interface Component { key; score; max; available; reason }

// scoreValuasi: max mengecil sendiri saat sub-metrik hilang
if (f.per !== null) { max += 5; ... }
if (f.pbv !== null) { max += 5; ... }

// combine: penyebut dari field yang SAMA
const declaredMax = components.reduce((s, c) => s + c.max, 0);
const availableMax = (rawMax / declaredMax) * groupMax;
```

Pembilang dan penyebut menyusut bersamaan ⇒ rasio tetap 1.0 ⇒ kehilangan sub-faktor tidak terlihat. Emiten rugi (PER null) dilaporkan coverage fundamental 100%.

**AFTER**

```ts
interface Component { key; score; availableMax; declaredMax; available; reason }

// declaredMax KONSTAN (15/8/7/10 | 10/10/10 | 20/10), availableMax mengikuti data
return { key: 'valuasi', availableMax, declaredMax: MAX, ... };

const declaredTotal = components.reduce((s, c) => s + c.declaredMax, 0);
const availableMax = (rawMax / declaredTotal) * groupMax;
```

**WHY** Kelengkapan dan skor adalah dua pertanyaan berbeda dan sekarang dijawab dua angka berbeda. Skor tetap direnormalisasi atas bobot yang tersedia (perilaku lama dipertahankan — data hilang tidak menghukum), tapi kelengkapan diukur terhadap bobot yang dideklarasikan.

**Hasil terverifikasi** (`coverage = Σ bobot tersedia / Σ bobot dideklarasikan × 100`):

| Kondisi | Sebelum | Sesudah |
|---|---|---|
| Semua sub-faktor ada | 100 | 100 |
| PER hilang | 100 | **95** |
| Seluruh blok Valuasi hilang | 90 | 90 |
| PER + ROE + DER hilang | 100 | **85** |
| Seluruh Fundamental hilang | 70 | 70 |
| Hanya Teknikal | 40 | 40 (kategori `DATA TIDAK CUKUP`) |

`missing != zero` dan `missing != neutral`: sub-faktor yang hilang tidak menyumbang 0 poin dan tidak diberi nilai tengah — ia keluar dari pembilang skor, dan hilangnya terlihat di coverage. Diuji eksplisit ("sub-faktor hilang TIDAK diperlakukan sebagai nol maupun nilai netral").

**Efek samping yang disadari:** `total_score` bisa bergeser ±1 poin untuk saham berdata parsial, karena bobot relatif antar kelompok kini mencerminkan kelengkapan sebenarnya (mis. fundamental 25/95 alih-alih 30/100). Ini konsekuensi aritmetis langsung dari perbaikan, bukan perubahan formula.

**TEST** `scoring.service.test.ts` blok "coverage_pct = bobot tersedia / bobot dideklarasikan (P0-2)" — 11 test, nilai harapannya diturunkan dari aritmetika bobot, bukan dicocokkan ke implementasi.

---

## 7. P0-3 — MINIMAL ELIGIBILITY GATE

**FILE BARU** `modules/eligibility/service/eligibility.service.ts`
**FUNCTION** `evaluateMinimalEligibility(input): EligibilityResult` — fungsi murni, tanpa I/O, tidak pernah melempar.

### Gerbang yang diimplementasikan

| Gerbang | Ambang | Blocking | Reason code |
|---|---|---|---|
| `INSUFFICIENT_HISTORY` | `bars < 200` | YA | `HISTORY_TOO_SHORT` |
| `POSSIBLY_NOT_TRADED` | 3 hari volume 0 berturut **atau** 8 dari 20 bar | YA | `NO_TRADING_ACTIVITY` |
| `STALE_DATA` | > 5 hari kalender sejak bar terakhir | YA | `DATA_STALE` / `DATA_DATE_UNPARSEABLE` / `DATA_DATE_IN_FUTURE` |
| `INSUFFICIENT_DATA` | `coverage_pct < 55` | YA | `COVERAGE_BELOW_MIN` |
| `LOW_LIQUIDITY` | `ADV20 < Rp 1 miliar` | **TIDAK** | `LIQUIDITY_BELOW_FLOOR` / `LIQUIDITY_UNMEASURABLE` |

Prioritas kalau beberapa aktif = urutan tabel; `reasonCodes` memuat **semua** yang aktif. Seluruh ambang hidup di `constants/eligibility.constants.ts`, tidak tersebar sebagai literal.

### Aturan yang ditegakkan

**FILE** `modules/eligibility/service/advisory.service.ts` → `toAdvisoryDecision()`

```ts
if (eligibility.status !== 'ELIGIBLE') {
  return { action: null, advisory: false, ... };   // BUKAN 'HOLD'
}
```

Data saham & indikator TETAP ditampilkan. Skor v1 (`scoring.total_score`, `scoring.kategori`) TETAP dikembalikan apa adanya untuk kompatibilitas. Yang dicabut hanya ajakan bertindaknya.

### Titik penerapan (audit bypass)

| Entry point | Cara penerapan |
|---|---|
| `app/api/stock/[ticker]/route.ts` | + `eligibility` + `decision` di payload; `scoring` tidak diubah |
| `modules/recommendation/service/ai-pick-scan.service.ts` | Status dihitung per saham, dibawa ke cache |
| `modules/recommendation/service/ai-pick.service.ts` | Non-ELIGIBLE difilter sebelum ranking |
| `modules/market/service/screener.service.ts` | `signal` (label BUY/SELL di tabel) dipaksa `null` kalau tidak ELIGIBLE |
| `modules/notification/service/alert-evaluation.service.ts` | `CONSENSUS_STRONG_BUY` tidak trigger kalau `decision.advisory === false` |
| `app/dashboard/page.tsx` (badge + PDF), `app/portfolio/page.tsx` | Menampilkan status, bukan BUY/SELL |

**TEST** 24 test gerbang + 10 test invarian `action !== null ⇒ ELIGIBLE` + 6 test P0-3 di `ai-pick.service.test.ts`.

### Kejujuran data IDX (§5 instruksi)

Status dinamai **`POSSIBLY_NOT_TRADED`**, bukan `SUSPENDED_OR_NOT_TRADED` seperti di blueprint §3.3 — aplikasi ini tidak punya feed suspensi resmi IDX; yang benar-benar diukur cuma "tidak ada volume tercatat selama N hari". Pesan ke pengguna memakai kata "kemungkinan"; ada test yang menegakkan itu. `IDX_AUTO_REJECTION_RULES` **tidak dibuat dan tidak diisi** (itu Phase 1 + tugas manusia).

Volume `null` (Yahoo untuk hari libur) diperlakukan sebagai **bar tanpa data**, bukan volume nol — dua hal berbeda, hanya yang kedua yang boleh memicu gerbang.

---

## 8. P0-4 — BACKTEST PREPARATION

**Tidak ada kalibrasi, tidak ada optimasi bobot, tidak ada LensScore v2, tidak ada klaim validasi.**

Yang dikerjakan hanya prasyarat infrastrukturnya: arsip fundamental point-in-time (§9) + `asOf()` yang bebas look-ahead. `modules/backtest/` **tidak disentuh sama sekali**.

Pernyataan eksplisit: **LensScore v1 BELUM tervalidasi.** Tidak ada di repo ini yang membuktikan skor 82 lebih baik dari 62.

---

## 9. P0-5 — HISTORICAL FUNDAMENTAL ARCHIVE

**FILE** `modules/fundamental/repository/fundamental-history.repository.ts` (baru)
**FILE** `app/api/cron/fundamental-snapshot/route.ts`

**BEFORE**

```ts
await writeFundamentalSnapshot(snapshot);      // satu key Redis, TTL 24 jam, MENIMPA
return { tickers: Object.keys(snapshot).length };
```

**AFTER**

```ts
await writeFundamentalSnapshot(snapshot);      // CACHE TETAP DITULIS - tidak diubah

const observedDate = todayDateKeyWIB();
const archive = await archiveFundamentalSnapshotSafe(
  Object.entries(snapshot).map(([ticker, f]) => ({ ticker, observedDate, ...f }))
);
if (archive.error) logger.warn('cache tertulis, arsip historis GAGAL', { observedDate, err: archive.error });
return { tickers, observedDate, archivedRows: archive.archived, archiveError: archive.error };
```

**WHY**
- Cache = data runtime/current (AI Pick scan membacanya tiap 5 menit) — **dipertahankan sepenuhnya**. Database = lapisan historis point-in-time. Dua kebutuhan berbeda.
- `todayDateKeyWIB()`, bukan `new Date()` server: Vercel jalan di UTC, cron 07:00 WIB akan terarsip sebagai tanggal H-1 kalau memakai UTC.
- Ticker disimpan apa adanya (dengan `.JK`) supaya kunci arsip identik dengan kunci cache & `AI_PICK_UNIVERSE`.
- `archiveFundamentalSnapshotSafe()` tidak pernah melempar: database down tidak boleh menggagalkan job yang tugas utamanya menyegarkan cache — tapi kegagalannya di-log dan dilaporkan di hasil job, bukan ditelan.

### Idempotency

```sql
INSERT INTO fundamental_history (...) VALUES ($1,$2::date,...), (...)
ON CONFLICT (ticker, observed_date) DO NOTHING
```

Satu statement multi-VALUES (109 ticker, satu round-trip), **seluruh nilai parameterized** — tidak ada interpolasi ke string SQL. Tidak ada `DO UPDATE` di manapun: arsip ini append-only, snapshot tanggal sebelumnya tidak bisa ditimpa oleh eksekusi cron kapan pun.

### As-of query (bebas look-ahead)

```sql
SELECT ... FROM fundamental_history
 WHERE ticker = $1 AND observed_date <= $2::date
 ORDER BY observed_date DESC
 LIMIT 1
```

**RULE MUTLAK yang ditegakkan:** hanya `observed_date <= requestedDate`. Kalau ada beberapa snapshot, yang diambil adalah yang paling dekat tapi **tidak melewati** `requestedDate`. Kalau tidak ada satu pun sebelum tanggal itu ⇒ `null`, **bukan** baris terdekat.

**TEST** blok "asOf - bebas look-ahead bias": arsip 03/08, 05/08, 01/09 ⇒ `asOf('2026-08-04')` mengembalikan snapshot 03/08 dengan PER 20, **bukan** 22 dari 05/08. Plus test yang memeriksa bentuk SQL apa adanya (`<=`, `ORDER BY DESC`, `LIMIT 1`) sehingga tanda `<=` tidak bisa hilang diam-diam.

`requestedDate`/`observedDate` divalidasi `YYYY-MM-DD` dan melempar kalau tidak — tanggal tidak valid tidak boleh diam-diam berubah jadi "hari ini".

---

## 10. FAKE ANALYTICAL FALLBACKS — FOUND

Audit pola `?? 50`, `|| 50`, `?? 0`, `|| 0` di seluruh `modules/`, `app/`, `lib/`, `shared/`, diperiksa satu per satu menurut konteks semantiknya (bukan global replace):

| Lokasi | Pola | Vonis |
|---|---|---|
| `screener.service.ts:193-196` | `rsi : 50`, `macd* : 0` | **PALSU** — masuk scoring |
| `screener.service.ts:221-223` | `ma20/ma50/ma200 ?? 0` | **PALSU** — masuk scoring |
| `breakout.service.ts:115` | `calculateRsi(...) ?? 50` | **PALSU** — dibandingkan ke ambang sinyal |
| `simulate.service.ts:228` | `ihsgWindow[0]?.close ?? 1` | AMAN — pembagi benchmark, dijaga `?.` di atasnya; tidak masuk skor saham |
| `market-pulse.service.ts:238` | `changePct ?? 0` | AMAN — comparator pengurutan tampilan, bukan nilai yang ditampilkan/diskorkan |
| `watchlist.repository.ts:68` | `opts.limit \|\| 50` | AMAN — paginasi, non-finansial |
| `ai-pick.service.ts:158-159` | `breakdown ?? {0,0,0}`, `topReasons ?? []` | AMAN & DIDOKUMENTASIKAN — guard bentuk cache lama supaya UI tidak crash; angkanya tidak dipakai untuk keputusan (item bersangkutan kini tersaring lebih dulu kalau memang tidak layak) |
| `local-council.service.ts`, `app/api/stock/[ticker]` | — | SUDAH BERSIH sebelum tugas ini (diverifikasi ulang) |

## 11. FAKE ANALYTICAL FALLBACKS — FIXED

**FILE** `modules/market/service/screener.service.ts`

**BEFORE**
```ts
const rsiVal = ... ? rsiResult.raw.rsi : 50;
const macdHistVal = ... ? macdResult.raw.macdHist : 0;
...
ma20: ma20 ?? 0, ma50: ma50 ?? 0, ma200: ma200 ?? 0,
```

**AFTER**
```ts
const rsiVal = ... ? rsiResult.raw.rsi : null;
const macdHistVal = ... ? macdResult.raw.macdHist : null;
...
ma20, ma50, ma200,
```

**WHY** RSI 50 jatuh PERSIS di pita "zona BUY ideal" `scoreRsi()` (8 dari 8 poin) — saham yang RSI-nya gagal dihitung justru **dihadiahi** skor teknikal penuh. MACD 0 masuk cabang "netral" (3 dari 7 poin) untuk indikator yang tidak pernah terhitung. `ma200 ?? 0` membuat `harga > MA200(0)` **selalu true** (harga selalu > 0) ⇒ poin uptrend gratis. Sekarang `null` ⇒ komponen dikeluarkan dari skor, bobot dinormalisasi, dan hilangnya terlihat di `coverage_pct`.

**FILE** `modules/recommendation/service/breakout.service.ts`

**BEFORE** `const rsi = calculateRsi(closes, 14) ?? 50;` → **AFTER** `const rsi = calculateRsi(closes, 14); const isRsiBreakout = rsi != null && rsi >= 52 && rsi <= 60;`

**WHY** Nilai 50 kebetulan tidak memicu pita 52-60, jadi dampaknya nol — tapi polanya tetap salah: angka yang tidak pernah diukur dibandingkan ke ambang seolah hasil pengukuran. Perbaikan ini menutup polanya sebelum ambangnya berubah suatu saat.

**TEST** `scoring.service.test.ts` sudah punya regresi "RSI null TIDAK diperlakukan sebagai 50" dan "MA200 null bukan uptrend gratis"; keduanya sekarang benar-benar berlaku untuk jalur Screener juga.

---

## 12. NO DUMMY DATA

Tidak ada dummy, mock production data, random score, fake fundamental, fake indicator, fake market price, fake confidence, maupun fake recommendation yang ditambahkan. Semua jalur data-tidak-tersedia mengembalikan `null` / status eksplisit.

`IDX_AUTO_REJECTION_RULES` sengaja **tidak dibuat** — mengisinya dari ingatan adalah persis yang dilarang blueprint §5.4.

---

## 13. TESTS ADDED

| # | Skenario yang diminta | File | Status |
|---|---|---|---|
| 1 | DATA TIDAK CUKUP tidak masuk AI Pick | `ai-pick.service.test.ts` | PASS |
| 2 | Partial data ⇒ coverage sesuai bobot sebenarnya | `scoring.service.test.ts` | PASS |
| 3 | Missing indicator tidak jadi fake neutral | `scoring.service.test.ts` | PASS |
| 4 | NOT ELIGIBLE tidak menghasilkan BUY | `advisory.service.test.ts`, `ai-pick.service.test.ts` | PASS |
| 5 | Historical fundamental tersimpan | `fundamental-history.repository.test.ts` | PASS |
| 6 | Cron duplicate tidak menghasilkan duplikat | idem | PASS |
| 7 | Snapshot hari berikutnya tidak overwrite | idem | PASS |
| 8 | `asOf()` tidak pernah mengambil future snapshot | idem | PASS |
| 9 | LensScore v1 tetap bekerja | `scoring.service.test.ts` (bentuk hasil + rentang + kategori) | PASS |
| 10 | Existing API compatibility | 42 file test lama tetap hijau; field lama tidak dihapus | PASS |

### Adversarial

| Input | Perilaku terverifikasi |
|---|---|
| `null` / `undefined` bars | `INSUFFICIENT_HISTORY`, tidak melempar |
| `NaN` close/volume | ADV `null` ⇒ `LIQUIDITY_UNMEASURABLE`, tidak lolos diam-diam |
| `NaN` coverage | Dianggap tidak dipasok, **bukan 0** |
| `NaN` RSI / `undefined` MA200 di `calculateScore` | Komponen dikeluarkan, skor tetap 0-100 finite |
| Empty response / cache rusak (bukan array) | `rankAiPicks` ⇒ `[]`, tidak crash |
| API failure | Gerbang tetap jalan atas data yang ada; entri gagal fetch dikeluarkan `scoreOne()` |
| Database failure | `archiveFundamentalSnapshotSafe` ⇒ `{ archived: 0, error }`, cron tetap sukses, error di-log |
| Duplicate cron | 1 baris, nilai pertama menang |
| Partial fundamental | Coverage turun proporsional, skor tidak dihukum |
| Ticker tidak dikenal | `asOf()` ⇒ `null` |
| Historical bars kurang | `INSUFFICIENT_HISTORY` (blocking) |
| Zero volume | `POSSIBLY_NOT_TRADED` |
| Stale candle | `STALE_DATA`; bar bertanggal SETELAH `asOf` ⇒ `DATA_DATE_IN_FUTURE` |
| Tanggal tidak bisa diurai | `DATA_DATE_UNPARSEABLE`, bukan "segar" |

Tidak ada satu pun kegagalan yang berubah menjadi angka finansial.

---

## 14. TEST RESULTS

```
npx vitest run
 Test Files  42 passed (42)
      Tests  359 passed (359)
```

Test baru/diubah: 24 + 10 + 15 + 13 + 20 = 82.

## 15. TYPECHECK

```
npx tsc --noEmit
TSC_EXIT=0
```
PASS.

## 16. LINT

```
npm run lint
Invalid project directory provided, no such directory: C:\xampp\htdocs\trading\lint
EXITCODE=1
```

**PRE-EXISTING — BUKAN REGRESSION.** Dua sebab, keduanya sudah ada sebelum tugas ini dan tidak disentuh:
1. `next lint` dihapus di Next 16 (project memakai `next@^16.3.0`), sehingga argumen `lint` dibaca sebagai direktori.
2. Menjalankan ESLint langsung juga gagal: `.eslintrc.json` (eslintrc lama, ESLint 8.57.1) + `eslint-config-next@16` (flat config) ⇒ `TypeError: Converting circular structure to JSON`.

Perbaikannya adalah migrasi konfigurasi ESLint — di luar cakupan Phase 0 dan tidak disebabkan perubahan ini. **Tidak diklaim PASS.**

## 17. PRODUCTION BUILD

```
npm run build
✓ Compiled successfully in 6.0s
BUILD_EXIT=0
```
PASS.

---

## 18. BACKWARD COMPATIBILITY

Seluruh perubahan API **aditif**. Tidak ada field lama yang dihapus atau berubah tipe.

| Field lama | Status |
|---|---|
| `scoring.total_score` | TETAP, nilai dari `calculateScore()` v1 |
| `scoring.kategori` | TETAP, union tidak berubah (tidak ada nilai baru ditambahkan) |
| `scoring.coverage_pct` | TETAP ada; **nilainya lebih rendah** untuk saham berdata parsial (itu koreksinya) |
| `AiPickItem.finalScore` / `baseScore` / `coverage` | TETAP |
| `RawStock.signal` (Screener) | TETAP, tipe `kategori \| null` tidak berubah; kini bernilai `null` untuk saham tidak layak (nullable sejak sebelumnya, konsumen tidak perlu berubah) |
| — | **BARU:** `eligibility`, `decision` (stock detail); `kategori`, `eligibilityStatus`, `eligibilityReasons` (AI Pick); `eligibility_status`, `eligibility_reasons` (Screener); `scanned`, `eligible` (route AI Pick) |

LensScore v2 **tidak dibuat dan tidak diaktifkan**. `calculateScore()` v1 tetap satu-satunya mesin skor.

---

## 19. DEVIATIONS FROM BLUEPRINT

**#1 — Kontradiksi internal blueprint soal integration test P0-1.**
Blueprint §2 P0-1 "Integration test" menyatakan: snapshot fundamental `null` untuk seluruh universe ⇒ `rankAiPicks()` mengembalikan `[]` "karena semua coverage < 55". Tapi §2 P0-2 unit test (d) di blueprint yang sama menyatakan seluruh fundamental null ⇒ coverage **70**. 70 > 55, jadi kedua pernyataan tidak bisa benar bersamaan. Implementasi mengikuti aritmetika bobot (yang konsisten dengan P0-2), dan test yang ditulis menegakkan **acceptance criteria** P0-1 yang benar: tidak ada item hasil dengan `coverage < 55` atau `kategori === 'DATA TIDAK CUKUP'`. Klaim "snapshot null ⇒ daftar kosong" **tidak** dijadikan test karena tidak benar.

**#2 — `POSSIBLY_NOT_TRADED`, bukan `SUSPENDED_OR_NOT_TRADED`.** Lihat §7. Alasan: instruksi eksplisit untuk tidak mengklaim fakta IDX yang tidak tersedia. Pemetaan ke union blueprint §3.3 adalah pekerjaan Phase 1.

**#3 — Lokasi modul kelayakan.** Blueprint §21 Phase 0 hanya menyebut dua file baru (schema + repository) dan "gate minimal" di route stock. Lapisan kelayakan diletakkan di `modules/eligibility/` (bukan inline di route) supaya lima entry point bisa memakai definisi yang sama — inline berarti lima salinan aturan yang bisa berbeda pendapat. Isinya tetap subset Phase 0, bukan modul §5 penuh.

**#4 — Kalender bursa.** Blueprint G2 memakai `tradingDaysBetween` + ambang 2 hari bursa. Aplikasi belum punya kalender hari libur IDX, jadi dipakai **fallback yang blueprint sendiri tetapkan**: hari kalender dengan ambang 5.

**#5 — Gerbang G5/G6/G7 tidak diimplementasikan.** `EXTREME_VOLATILITY`, `ABNORMAL_PRICE_MOVEMENT` (ARA/ARB), `CORPORATE_ACTION_REVIEW` ditunda ke Phase 1 sesuai §21 ("versi minimal — cukup untuk menutup skenario paling berbahaya").

---

## 20. PRE-EXISTING PROBLEMS

1. **`npm run lint` rusak** — lihat §16. Tidak diperbaiki (di luar cakupan).
2. **Peringatan Vitest config** — `vitest.config.ts` memakai sintaks ESM di file yang dimuat sebagai CommonJS. Peringatan, bukan kegagalan.
3. **Universe statis disalin manual** (`AI_PICK_UNIVERSE`, `SCREENER_UNIVERSE`) — diakui blueprint §2 P0-3, ditangani Phase 1.
4. **`calculateConsensus()` masih mengeluarkan kata "STRONG BUY"** — Phase 5 menurut blueprint §4.2. Jalur alert-nya sudah digerbangi (§7), tapi labelnya di UI belum.

---

## 21. REMAINING RISKS

1. **AI Pick kosong sementara setelah deploy.** Entri cache `ai-pick-scores` (TTL 3 hari) yang ditulis sebelum perubahan ini belum punya `eligibilityStatus` ⇒ tersaring fail-closed. Daftar pulih pada eksekusi cron `ai-pick-scan` berikutnya (tiap 5 menit selama jam bursa). Di luar jam bursa bisa kosong sampai bursa buka. API mengembalikan `note` yang menjelaskan hal ini; UI punya empty state jujur. **Mitigasi jika tidak dapat diterima:** jalankan cron `ai-pick-scan` manual sekali setelah deploy.

2. **Stale-fallback payload lama tanpa `decision`.** `app/api/stock/[ticker]` menyimpan `staleFallbackKey` ber-TTL 24 jam. Payload yang ditulis sebelum deploy tidak punya `decision`, sehingga UI kembali menampilkan `scoring.kategori` apa adanya sampai payload itu tergantikan (≤ 24 jam). Bukan bypass permanen, tapi nyata selama masa transisi.

3. **`?range` pendek pada `/api/stock/[ticker]`.** Kalau suatu saat ada pemanggil yang meminta `?range=1mo`, histori < 200 bar ⇒ `INSUFFICIENT_HISTORY` ⇒ rekomendasi tidak diberikan. Disengaja (fail-closed), tapi berarti penambahan pemanggil range-pendek akan mematikan rekomendasi di halaman itu. Saat ini seluruh pemanggil memakai default 20y.

4. **`/api/council` dan `/multi-agent` (orchestrator) belum digerbangi.** Keduanya jalur keputusan terpisah yang blueprint tempatkan di Phase 5. Mereka masih bisa mengeluarkan label bernada rekomendasi untuk saham yang tidak lolos gerbang. Ini **celah yang diketahui dan sengaja tidak ditutup di Phase 0** — dicatat sebagai pekerjaan Phase 1/5.

5. **Ambang `[HYPOTHESIS]` belum tervalidasi.** `MAX_STALE_CALENDAR_DAYS=5`, `MAX_ZERO_VOL_DAYS=3`, `MAX_ZERO_VOL_IN_20=8`, `ADV_HARD_FLOOR_IDR=1e9` adalah nilai default yang dapat dikonfigurasi, bukan kebenaran. Hanya `MIN_BARS=200` yang definisional (kebutuhan MA200).

6. **Test repository memakai pengganti in-memory, bukan Postgres nyata.** Dinyatakan terbuka di kepala file test. Yang belum dibuktikan: perilaku tipe `DATE`, presisi `NUMERIC`, dan pemakaian index sesungguhnya. Butuh integration test dengan database nyata.

7. **Arsip mulai dari nol.** Backtest fundamental atas periode sebelum hari ini tetap **tidak mungkin** dan tidak boleh dipalsukan dengan snapshot hari ini (blueprint §17.2 larangan tegas).

---

## 22. ITEMS EXPLICITLY NOT IMPLEMENTED

Ditemukan sebagai peluang, **tidak dikerjakan** sesuai instruksi:

- LensScore v2 penuh, Factor Registry v2, Quality/Valuation/Growth/Trend v2, Momentum 12-1, Flow v2, RiskScore v2, ConfidenceScore v2, Market Regime v2, Decision Engine v2 penuh
- Eligibility Engine §5 penuh (gerbang G5/G6/G7, arsitektur ARA/ARB dua lapis, `IDX_AUTO_REJECTION_RULES`)
- `modules/sector/`, `modules/decision/`, `modules/factor/`
- Backtest v2 (`factor-validation`, `score-history`, `strategy-backtest`), tabel `lens_score_history`
- Weight optimization, threshold calibration, kalibrasi confidence
- Deprecation `calculateScore()` v1, `scoreStock()` Screener, `decisionFromScore()` orchestrator
- UI redesign; penggantian `coverage_pct` dengan Data Quality Score 4 dimensi
- Migrasi konfigurasi ESLint

---

## 23. PHASE 1 READINESS

Yang sudah tersedia untuk Phase 1:

- `modules/eligibility/` sudah ada dengan struktur `constants/` + `service/` + `types/` sesuai §3.1 — Phase 1 memperluasnya (menambah G5/G6/G7 + `abnormal-movement` + `auto-rejection`), bukan membangunnya dari nol.
- `EligibilityStatus`, `EligibilityResult`, `reasonCodes`, `blocking`, `advisory` sudah berbentuk kontrak yang kompatibel dengan §5.1 — tinggal ditambah field `details` yang lebih kaya.
- `toAdvisoryDecision()` sudah menegakkan invarian `action !== null ⇒ ELIGIBLE` dengan `action: null` (bukan HOLD), siap dipindahkan ke `modules/decision/` sebagai bagian Decision Engine.
- Arsip `fundamental_history` **sudah mulai mengumpulkan data sejak cron berikutnya** — jam mulai berjalan untuk syarat 12-24 bulan §17.2.
- `MIN_COVERAGE_PCT` sudah menjadi satu sumber yang di-share antara scoring & eligibility — titik sambung alami untuk `D_complete` di Data Quality v2.

Yang wajib dikerjakan lebih dulu di Phase 1: kalender hari bursa IDX (untuk G2 sesungguhnya), sector classifier manual, dan penerapan gate ke `/api/council` + orchestrator.

---

## 24. FINAL CHECKLIST

- [x] Historical fundamental tersimpan permanen
- [x] Historical date sebelumnya tidak ditimpa
- [x] Duplicate cron aman
- [x] `asOf()` bebas future-data leakage
- [x] DATA TIDAK CUKUP tidak masuk AI Pick
- [x] Coverage partial benar
- [x] Missing indicator tidak menjadi fake neutral value
- [x] NOT ELIGIBLE tidak dapat menjadi BUY/STRONG BUY (pada jalur yang tercakup Phase 0 — lihat Risiko #4)
- [x] LensScore v1 masih bekerja
- [x] LensScore v2 belum aktif
- [x] Tidak ada dummy production data baru
- [x] Tests PASS (359/359)
- [x] Typecheck PASS
- [x] Production build PASS
- [ ] Lint — **PRE-EXISTING FAILURE**, bukan item kritis Phase 0 (§16)

**PHASE 0 IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT AUDIT**

Phase 1 tidak dimulai. LensScore v2 tidak dimulai. Menunggu audit independen.
