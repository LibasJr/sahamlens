# SAHAMLENS ZERO DUMMY AUDIT REPORT

**Tanggal audit:** 2026-08-17
**Commit HEAD saat audit:** `043c6ab` (`refactor: permanently purge synthetic dummy broker summary generators and backfill endpoints`)
**Branch:** `main` (working tree bersih)
**Metode:** static source audit + git history forensic. **TIDAK ADA akses database produksi** (tidak ada `.env.local` / `.env.production` di lingkungan audit, `DATABASE_URL` tidak tersedia).
**Tindakan destruktif:** NIHIL. Tidak ada file diubah, tidak ada query tulis dijalankan.

---

## 1. EXECUTIVE SUMMARY

```text
Overall Integrity Status:   WARNING  (source code) / CRITICAL-UNVERIFIED (database)

Synthetic Data Found:       YES  — di git history (dihapus dari kode di 043c6ab),
                                   status di database: UNVERIFIED

Unverified Data Found:      YES  — isi tabel broker_summary_daily tidak dapat
                                   dibuktikan bersih; kolom `source` TIDAK dapat
                                   membedakan baris sintetis dari baris nyata

Mislabelled Proxy Found:    YES  — 2 temuan (label "Bandar" untuk net SATU broker;
                                   vol_ratio screener tanpa penanda estimasi)

Look-ahead Risk:            NO   — jalur PIT (fundamental_history, backfill lens
                                   history, PIT generator) terbukti observed_date-safe

Production Exposure:        YES  — /api/broker-summary/[ticker] membaca
                                   broker_summary_daily TANPA filter `source` dan
                                   menandai hasilnya hasRealBrokerData: true
```

### Ringkasan satu paragraf

Kode sumber SahamLens saat ini **bersih dari generator data sintetis**. Generator
`generateRealisticBrokerTransactions` benar-benar hilang dari working tree, dan tidak
ditemukan generator lain dengan nama berbeda (pencarian atas `Math.random`, `faker`,
`seededRandom`, `charCodeAt`, `hash(ticker)`, `TOP_BROKERS`, `basePriceMap`,
`isAccumulationDay` tidak menemukan sisa apa pun di jalur produksi). Modul-modul lain —
LensScore, Ownership Flow, PIT fundamental, backtest, TP/CL lab, LensAI — justru
menunjukkan disiplin integritas data yang **di atas rata-rata**: missing tetap null,
coverage turun, ingestion fail-closed, dan ada lapisan verifikasi angka deterministik di
LensAI.

Masalahnya bukan di kode yang ada sekarang, melainkan pada **jejak yang ditinggalkan
insiden**: endpoint backfill yang dihapus menulis baris `Math.random()` ke
`broker_summary_daily` dengan `source = 'IDX_EOD_REPORT'` — yaitu label provenance yang
terdengar seperti sumber resmi BEI. Akibatnya kolom `source` **tidak bisa lagi dipakai
untuk memisahkan** baris palsu dari baris asli, dan endpoint publik
`/api/broker-summary/[ticker]` membaca tabel itu **tanpa filter `source`** lalu menandai
responsnya `hasRealBrokerData: true`. Menghapus dua file tidak menutup lubang ini.

---

## 2. CRITICAL FINDINGS

### F-01 — Baris sintetis kemungkinan masih ada di database, dengan label provenance PALSU-MEYAKINKAN

```text
ID:             F-01
Severity:       CRITICAL (P0)
File:           app/api/admin/broker-summary/backfill/route.ts  (DIHAPUS di 043c6ab)
Line:           37-96 (generator), 137-160 (INSERT)
Function:       generateRealisticBrokerTransactions() -> POST()
Dataset:        broker_summary_daily
Commit dibuat:  28d5d98  "feat: add 1-click admin backfill button and resilient
                          single-connection broker ingestion script"
Commit dihapus: 043c6ab  (2026-08-17)
```

**Finding:** Endpoint admin `POST /api/admin/broker-summary/backfill` membangkitkan 900
baris transaksi broker (15 ticker x 5 tanggal x 12 broker) sepenuhnya dari
`Math.random()`, lalu menulisnya ke `broker_summary_daily` dengan
`source: 'IDX_EOD_REPORT'`.

**Evidence** (`git show 28d5d98:app/api/admin/broker-summary/backfill/route.ts`):

```ts
const baseVal = (Math.floor(Math.random() * 15) + 5) * 1_000_000_000;
// ...
transactions.push({
  ticker: `${clean}.JK`, tradeDate, brokerCode: broker.code,
  buyValue, sellValue, buyVolume, sellVolume, buyLot, sellLot,
  buyFrequency: Math.floor(Math.random() * 300) + 50,
  sellFrequency: Math.floor(Math.random() * 300) + 50,
  buyAvgPrice: basePrice + Math.floor(Math.random() * 20) - 10,
  sellAvgPrice: basePrice + Math.floor(Math.random() * 20) - 10,
  source: 'IDX_EOD_REPORT',          // <-- label sumber RESMI untuk data ACAK
});
```

```ts
await client.query(`CREATE TABLE IF NOT EXISTS broker_summary_daily ( ... )`);
await client.query('BEGIN');
for (const tradeDate of LAST_WEEK_TRADING_DATES) {
  for (const ticker of DEFAULT_TICKERS) {
    const rows = generateRealisticBrokerTransactions(ticker, tradeDate);
    for (const tx of rows) {
      await client.query(`INSERT INTO broker_summary_daily (...) VALUES (...)
        ON CONFLICT (trade_date, ticker, broker_code, source) DO UPDATE SET ...`);
```

**Data flow:** `Math.random()` -> `generateRealisticBrokerTransactions()` ->
`INSERT broker_summary_daily(source='IDX_EOD_REPORT')` -> `computeStockBrokerSummary()`
-> `GET /api/broker-summary/[ticker]` -> `components/broker/BrokerSummaryPanel.tsx` ->
pengguna.

**Kenapa ini masalah:** ini bukan sekadar data palsu — ini data palsu **yang menandai
dirinya sebagai laporan EOD resmi BEI**.

> ### KOREKSI 2026-08-17 (setelah verifikasi lanjutan) — MENGUNTUNGKAN
>
> Draf pertama laporan ini menyatakan `source` **tidak dapat** memisahkan baris palsu
> dari baris asli, dengan alasan parser IDX yang sah (`parseIdxBrokerSummaryText`,
> `idx-broker-summary-parser.service.ts:101`) memakai default `source` yang sama.
> **Kesimpulan itu terlalu pesimistis dan sudah dikoreksi.**
>
> Verifikasi: `git log --all -S 'saveBrokerTransactionsToDb'` menunjukkan satu-satunya
> jalur tulis yang bisa dipakai parser tersebut **tidak pernah dipanggil dari mana pun,
> di commit mana pun** — ia hanya pernah muncul di file definisinya sendiri (`6564c64`).
> `parseIdxBrokerSummaryText` sendiri juga hanya dipakai oleh file test-nya, tidak pernah
> tersambung ke database.
>
> **Konsekuensi:** tidak ada satu pun baris `source = 'IDX_EOD_REPORT'` yang sah.
> Setiap baris berlabel itu berasal dari endpoint backfill sintetis. Label itu karena
> itu adalah **penanda kontaminasi yang dapat diandalkan**, dan pembersihan berbasis
> `source` **tidak akan menghapus data nyata**.
>
> Ini menyederhanakan §11 secara signifikan: fingerprint statistik tetap berguna sebagai
> konfirmasi silang, tetapi tidak lagi menjadi satu-satunya cara memisahkan.

**Catatan mitigasi (penting, tetapi tidak membebaskan):** varian script
`scripts/fetch-broker-summary-last-week.mjs` (commit `6564c64`) menulis ke kolom
`net_value, net_volume, buy_avg_price, sell_avg_price, updated_at` dan
`ON CONFLICT (ticker, trade_date, broker_code)`. Kolom-kolom itu **tidak ada** di skema
baseline (`database/migrations/000_runtime_schema_baseline.sql:744-758`, yang memakai
`buy_avg/sell_avg/source/source_file/imported_at` dan unique
`(trade_date, ticker, broker_code, source)`). Script itu kemungkinan besar **gagal saat
runtime** dan tidak menulis apa pun. Risiko kontaminasi terkonsentrasi pada **endpoint
backfill**, yang skemanya cocok dan bahkan membuat tabelnya sendiri bila belum ada.

**User Impact:** pengguna melihat "Akumulasi masif terdeteksi: Top 3 Broker (AK, BK, CS)
menyerap 47% dari total nilai transaksi" untuk BBCA/BBRI/TLKM pada 10-14 Agustus 2026 —
kalimat yang seluruhnya berasal dari `Math.random()`.

**Financial Risk:** TINGGI. Bandarmology adalah sinyal yang secara langsung dipakai orang
untuk memutuskan masuk/keluar posisi. Angka acak yang tampil sebagai "broker asing
mengakumulasi" adalah rekayasa sinyal pasar, bukan sekadar bug tampilan.

**Recommended Fix (JANGAN dieksekusi sebelum review auditor kedua):**
1. Audit-only dulu. Jalankan query forensik di §11 untuk mengukur seberapa besar
   kontaminasinya.
2. Karantina, bukan DELETE: `ALTER TABLE broker_summary_daily ADD COLUMN
   integrity_status TEXT`, tandai baris ber-fingerprint sintetis sebagai `QUARANTINED`.
3. Tambahkan filter `WHERE integrity_status IS DISTINCT FROM 'QUARANTINED'` di semua
   pembaca (lihat F-02).
4. Baru setelah itu pertimbangkan penghapusan permanen, dengan backup terlebih dahulu.

---

### F-02 — Jalur baca publik TIDAK memfilter `source`; hasilnya ditandai `hasRealBrokerData: true`

```text
ID:             F-02
Severity:       CRITICAL (P0)
File:           modules/broker-flow/service/idx-broker-summary-parser.service.ts
Line:           246-290 (query), 484-489 (error swallow)
                app/api/broker-summary/[ticker]/route.ts:22-40
Function:       computeStockBrokerSummary() -> GET
Dataset:        broker_summary_daily -> Bandarmology / Foreign Summary / Retail Behavior
```

**Finding:** Fungsi yang melayani endpoint publik membaca `broker_summary_daily` tanpa
batasan `source` apa pun — tanggal terakhir mana pun yang ada di tabel akan dipakai,
termasuk baris yang berasal dari F-01.

**Evidence** (`idx-broker-summary-parser.service.ts:255-272`):

```ts
const dateQuery = targetDate ? targetDate : (
  await pool.query(
    'SELECT trade_date FROM broker_summary_daily WHERE ticker = $1 ORDER BY trade_date DESC LIMIT 1',
    [ticker]
  )
).rows[0]?.trade_date;
// ...
const rowsRes = await pool.query(
  `SELECT broker_code, buy_value, sell_value, buy_volume, sell_volume, buy_avg, sell_avg
   FROM broker_summary_daily
   WHERE ticker = $1 AND trade_date = $2::date
   ORDER BY ABS(buy_value - sell_value) DESC`,
  [ticker, formattedDate]
);
```

`app/api/broker-summary/[ticker]/route.ts:35-40`:

```ts
return NextResponse.json({ ...brokerSummary, hasRealBrokerData: true }, ...);
```

**Kontras yang membuktikan ini bug, bukan desain:** fungsi tetangga di file yang sama
domainnya, `getBrokerFlowBadges` dan `getCachedBrokerTickers`
(`broker-summary-cache.service.ts:16-18, 36-46`), **memfilter** `WHERE source = $1`
dengan `SOURCE = 'INDEX_ALPHA_API'`. Jadi pola filter provenance sudah ada di codebase —
`computeStockBrokerSummary` saja yang tidak memakainya.

**Kenapa ini masalah:** flag `hasRealBrokerData: true` adalah **klaim provenance yang
dikeluarkan tanpa memeriksa provenance apa pun**. Ia bernilai `true` semata-mata karena
query mengembalikan >= 1 baris.

**User Impact:** panel Bandarmology menampilkan komposisi Foreign/Retail/Domestic,
konsentrasi Top-3, "PANIC_SELLING"/"FOMO_BUYING", dan narasi bandarmology — semuanya
akan terisi dari baris sintetis bila ada.

**Recommended Fix:** whitelist `source` eksplisit di `computeStockBrokerSummary`
(mis. `WHERE source = ANY($3::text[])` dengan daftar sumber yang diverifikasi), dan ubah
`hasRealBrokerData` menjadi turunan dari provenance baris (`source`, `imported_at`,
`source_file`) — bukan dari sekadar `rows.length > 0`. Kembalikan juga `source` dan
`imported_at` ke klien supaya UI bisa melabelinya.

---

### F-03 — Jalur tulis mati (`saveBrokerTransactionsToDb`) dengan jaminan integritas LEBIH LEMAH

```text
ID:             F-03
Severity:       HIGH (P1)
File:           modules/broker-flow/service/idx-broker-summary-parser.service.ts
Line:           174-200
Function:       saveBrokerTransactionsToDb()
Dataset:        broker_summary_daily
```

**Finding:** Fungsi ini di-export tetapi **nol pemanggil** di seluruh repo (diverifikasi
dengan pencarian menyeluruh). Ia memakai `ON CONFLICT ... DO UPDATE` (menimpa baris yang
sudah ada), sedangkan jalur impor resmi `importBrokerSummaryCsv`
(`broker-summary-import.service.ts:419`) memakai `DO NOTHING` (append-only). Default
`source`-nya juga `'IDX_EOD_REPORT'` — label yang sama dengan F-01.

**Evidence:**

```ts
export async function saveBrokerTransactionsToDb(transactions: BrokerTransactionRaw[]): Promise<number> {
  // ...
  const source = tx.source || 'IDX_EOD_REPORT';
  const buyLot = tx.buyLot ?? Math.round(tx.buyVolume / 100);
  // ...
  ON CONFLICT (trade_date, ticker, broker_code, source)
  DO UPDATE SET ...
```

**Kenapa ini masalah:** ini adalah pintu belakang yang menunggu dipakai. Siapa pun yang
menyambungkannya kembali (mis. untuk fitur impor baru) otomatis mendapat perilaku
overwrite + label sumber resmi, tanpa validasi baris yang dilakukan
`importBrokerSummaryCsv` (validasi ticker, tanggal masa depan, duplikat, integer check).

**Recommended Fix:** hapus fungsinya, atau kalau memang akan dipakai, arahkan ke
`importBrokerSummaryCsv` dan hilangkan default `source` implisit.

---

### F-04 — Broker tidak dikenal diklasifikasikan sebagai `DOMESTIC_INSTITUTION`, bukan `UNKNOWN`

```text
ID:             F-04
Severity:       MEDIUM (P2)
File:           modules/broker-flow/service/idx-broker-summary-parser.service.ts
Line:           88-93
Function:       classifyBrokerCode()
Dataset:        brokerComposition.foreign/domesticInst/retail (persentase)
```

**Evidence:**

```ts
export function classifyBrokerCode(code: string): 'FOREIGN' | 'DOMESTIC_INSTITUTION' | 'RETAIL' {
  const upper = code.trim().toUpperCase();
  if (KNOWN_FOREIGN_BROKERS.has(upper)) return 'FOREIGN';
  if (KNOWN_RETAIL_BROKERS.has(upper)) return 'RETAIL';
  return 'DOMESTIC_INSTITUTION';   // <-- fallback, bukan hasil klasifikasi
}
```

`KNOWN_FOREIGN_BROKERS` berisi 20 kode dan `KNOWN_RETAIL_BROKERS` 13 kode. IDX punya
sekitar 90 anggota bursa. Artinya **mayoritas kode broker** jatuh ke cabang fallback dan
dihitung sebagai institusi domestik, lalu angkanya ditampilkan sebagai fakta:

```ts
domesticInst: { ..., pct: Math.round((domInstTotal / allTotal) * 100) },
```

**Kenapa ini masalah:** ini persis pola "missing -> nilai default" yang dilarang, hanya
dalam bentuk kategorikal. `pct` domestik menjadi keranjang sampah semua broker yang belum
dipetakan, dan pengguna membaca angkanya sebagai pengukuran.

**Recommended Fix:** tambahkan kategori `UNKNOWN`, keluarkan dari denominator komposisi
(atau tampilkan sebagai irisan "Belum terklasifikasi"), dan tampilkan cakupan klasifikasi
di UI.

---

### F-05 — Label "Bandar / Institutional" untuk net SATU broker

```text
ID:             F-05
Severity:       MEDIUM (P2)
File:           modules/broker-flow/service/broker-summary-cache.service.ts:36-52
                components/Dashboard.tsx:148-151
                lib/i18n/locales/id.ts:132 ; lib/i18n/locales/en.ts:134
Function:       getBrokerFlowBadges() -> Dashboard LensRadar item
Dataset:        brokerNetValue
```

**Evidence** — query mengambil **satu** broker per ticker (yang |net|-nya terbesar):

```sql
ROW_NUMBER() OVER (PARTITION BY d.ticker ORDER BY ABS(d.buy_value - d.sell_value) DESC) AS rn
... SELECT ticker, trade_date, net_value FROM ranked WHERE rn = 1
```

Label yang ditampilkan:

```ts
// id.ts:132
bandarFlow: 'Bandar: Net {action} Rp{amount}',
// en.ts:134
bandarFlow: 'Institutional: Net {action} Rp{amount}',
```

**Kenapa ini masalah:** "Bandar: Net Buy Rp12,3M" dibaca sebagai *arus bandar agregat*
pada saham itu. Yang sebenarnya ditampilkan adalah net satu kode broker dominan. Komentar
di kode sudah jujur menyebutnya proxy ("Broker dengan arus bersih absolut terbesar dipakai
sebagai proxy pelaku dominan") — kejujuran itu **tidak sampai ke label UI**.

**Status saat ini:** jalur ini efektif dorman karena `getBrokerFlowBadges` memfilter
`source = 'INDEX_ALPHA_API'` dan `INDEXALPHA_API_KEY` belum dikonfigurasi di VPS. Tetapi
kodenya hidup dan akan langsung aktif begitu API key dipasang.

**Recommended Fix:** ubah label menjadi eksplisit, mis. `Broker dominan {code}: Net {action}`,
dan sertakan kode brokernya.

---

### F-06 — `vol_ratio` screener memakai volume hasil ESTIMASI tanpa penanda

```text
ID:             F-06
Severity:       MEDIUM (P2)
File:           modules/market/service/screener.service.ts:189-197, 359
                shared/market/trading-session.ts:80-106
Function:       runScreener() -> vol_ratio
Dataset:        vol_ratio (screener), momentumScore
```

**Evidence:**

```ts
// screener.service.ts:189
const volume = rawVolume != null
  ? (isIdxMarketHoursNow() ? estimateFullDayVolume(rawVolume) : rawVolume)
  : null;
const volRatio = volume != null && avgVolume != null ? volume / avgVolume : null;
```

Model estimasinya sendiri **secara eksplisit ditandai hipotesis di kode**
(`trading-session.ts:80-84`):

```ts
// [HIPOTESIS TERBATAS] Belum dikalibrasi per sektor/emiten/jam Jumat.
const U_SHAPE_CUMULATIVE_PROFILE = [
  { minute: 0, fraction: 0.00 }, { minute: 30, fraction: 0.18 }, ...
```

**Kenapa ini masalah:** selama jam bursa, `vol_ratio` bukan pengukuran melainkan
proyeksi. Ia dikembalikan ke API sebagai `vol_ratio` polos (`screener.service.ts:359`)
dan ikut membentuk `momentumScore` (`:474`), tanpa flag apa pun.

**Kontras yang membuktikan standar internal sendiri sudah lebih tinggi:**
`market-summary.service.ts:186-189` memisahkan `volume` (mentah) dari
`volumeEstimatedFullDay` dan menyediakan penanda `volumeIsPartial` — komentarnya bahkan
menjelaskan kenapa penggabungan keduanya adalah bug. Screener belum mengikuti pola itu.

**Recommended Fix:** tambahkan `vol_ratio_is_estimated: boolean` (atau `session_basis:
'PARTIAL_ESTIMATED' | 'FULL_DAY'`) ke output screener, dan beri badge di UI.

---

### F-07 — `changePct` yang hilang menjadi `0` di Dashboard

```text
ID:             F-07
Severity:       LOW (P3)
File:           components/Dashboard.tsx:278
Function:       useState initializer LensRadar items
Dataset:        changePct
```

```ts
changePct: typeof item.changePct === 'number' ? item.changePct : 0,
```

**Kenapa ini masalah:** `0` berarti "harga tidak bergerak" — sebuah klaim. Data hilang
seharusnya `null` dan dirender "N/A". Halaman market-pulse sudah menerapkan aturan ini
dengan benar (`app/market-pulse/page.tsx:499-503`), jadi ini inkonsistensi internal.

---

### F-08 — Sentimen berita: judul tak terpetakan menjadi `NETRAL`

```text
ID:             F-08
Severity:       LOW (P3)
File:           modules/news/service/news.service.ts:297
Function:       getTickerSentiments()
```

```ts
const labels = matched.map((m) => sentimentByTitle.get(m.title) || 'NETRAL');
```

**Catatan positif:** modul ini sebagian besar sudah benar — `sentiment: null` dipakai
untuk saham yang tidak disebut media (`:294`), dan `sentimentSource` dilaporkan
(`'council-ai' | 'keyword-fallback'`). Hanya baris `|| 'NETRAL'` di atas yang mengubah
"tidak terklasifikasi" menjadi penilaian.

---

### F-09 — Drift dokumen vs konfigurasi cron broker-summary

```text
ID:             F-09
Severity:       LOW (P3)
File:           docs/ownership-flow/broker-summary-status.md
                config/scheduled-jobs.json
```

`broker-summary-status.md` menyatakan cron **nonaktif sejak 2026-08-14**.
`config/scheduled-jobs.json` menyatakan `/api/cron/broker-summary-scan`
**"Diaktifkan 2026-08-17"**, jadwal `30 17 * * 1-5`. Keduanya tidak mungkin benar
bersamaan. Ini bukan fabrikasi data, tetapi dokumentasi status sumber data yang
kontradiktif adalah risiko audit tersendiri.

---

### F-10 — Asumsi makro produksi bersifat konstanta beku (bukan temuan pelanggaran, perlu label)

```text
ID:             F-10
Severity:       INFO / P3
File:           modules/fundamental/service/fair-multiples.service.ts:34-46
Dataset:        DCF, fair value, intrinsic value
```

```ts
export const MACRO_ASSUMPTIONS = {
  RISK_FREE_RATE_PCT: 6.7,
  EQUITY_RISK_PREMIUM_PCT: 5.2,
  SET_ON: '2026-08-03',
  MAX_PERPETUAL_GROWTH_PCT: 5,
} as const;
```

Ini **model assumption yang sah dan terdokumentasi**, bukan data emiten yang dikarang.
`modules/macro/service/valuation-assumption.service.ts` bahkan menyediakan jalur bukti PIT
terpisah dengan `adoptionStatus: 'NOT_ADOPTED_REQUIRES_MODEL_VERSION'` — desain yang
benar. Yang kurang: nilai valuasi di UI sebaiknya menampilkan asumsi + `SET_ON`-nya.

Catatan serupa: `sustainableGrowth()` memakai retensi 0.6 saat `payoutRatio` null
(`fair-multiples.service.ts:94-101`). Dinyatakan di komentar, tetapi tetap sebuah asumsi
yang masuk ke angka valuasi.

---

## 3. DATASET INVENTORY

| Dataset | Source | Classification | Verified | Fallback | Production Consumer |
|---|---|---|---|---|---|
| OHLCV harian | Yahoo Finance (`yahoo-finance2`) | REAL (pihak ketiga, bukan feed BEI) | YES | none | Technical, LensScore, Screener, Backtest |
| Bar intraday 5m | Yahoo chart v8 | REAL | YES | none | LensIntraday Lab |
| RSI / MACD / EMA / SMA / ATR / ADX | OHLCV | DERIVED | YES | none (null bila warm-up kurang) | LensScore, TP/CL |
| CMF20 / MFM / CLV | OHLCV | DERIVED | YES | none | Bandarmology (CMF), Flow score |
| "Foreign Flow" / LensFlow | CMF proxy dari OHLCV | **PROXY** | YES | none | app/api/stock, /api/flow |
| Fundamental terkini | Yahoo quoteSummary | REAL (pihak ketiga) | YES | null | LensFundamental, Screener |
| Fundamental PIT | Yahoo fundamentalsTimeSeries + observed_date verifikasi manusia | REAL/DERIVED | YES | null | Backtest, backfill lens history |
| BI Rate / inflasi / SBN | `macro_input_evidence` (PIT, provenance) | REAL | YES (audit-only) | none | Dashboard makro |
| Risk-free 6.7% / ERP 5.2% | konstanta beku `MACRO_ASSUMPTIONS` | **ESTIMATED / MODEL ASSUMPTION** | YES (didokumentasikan) | n/a | DCF, fair value |
| Volume sesi berjalan | Yahoo + profil U-shape | **ESTIMATED** | Sebagian | n/a | Screener vol_ratio, AI Pick scan |
| Ownership Flow (KSEI) | KSEI registered securities / archive | REAL, ingestion **fail-closed** | Archive: VERIFIED; snapshot harian: **UNVERIFIED** | none (tolak ingestion) | Ownership Flow |
| Broker Summary daily | manual CSV / Index Alpha API / **(historis: generator sintetis)** | **UNKNOWN — kontaminasi mungkin** | **NO** | none di kode saat ini | /api/broker-summary/[ticker], BrokerSummaryPanel |
| Broker Summary period | Stockbit Broker Distribution JSON (impor manual) | REAL (impor manual, ada `source`) | YES | none | BrokerDistributionPanel (halaman /technical) |
| Sentimen berita | RSS + klasifikasi AI / keyword | DERIVED, sumber dilaporkan | YES | keyword-fallback (dilabeli) | Dashboard berita |
| Kalender korporasi | Yahoo (dividen + earnings saja) | REAL, cakupan dibatasi eksplisit | YES | none | /calendar |
| LensScore | komposit 40/30/30 | DERIVED | YES | **tidak ada** — missing menurunkan coverage | LensRadar, AI Pick |
| Moat | rasio fundamental | **PROXY** (dilabeli "Proxy" di UI) | YES | none | /moat |
| Seasonality | OHLCV historis | DERIVED | YES | none | Dashboard |

---

## 4. SYNTHETIC DATA FINDINGS

**Di working tree saat ini: NIHIL.** Pencarian menyeluruh atas
`Math.random`, `crypto.randomBytes`, `faker`, `seededRandom`, `charCodeAt`,
`hash(ticker)`, `generateRealistic`, `synthetic`, `dummy`, `mockData`, `fakeData`,
`generateFallback`, `TOP_BROKERS`, `basePriceMap`, `isAccumulationDay` menghasilkan
**nol** temuan generator data finansial.

Seluruh pemakaian `Math.random()` yang tersisa sudah diverifikasi non-finansial:

| File:Line | Pemakaian | Verdict |
|---|---|---|
| `shared/queue/job-concurrency-guard.ts:32` | token lock unik | AMAN |
| `components/AIChat.tsx:48` | fallback `randomUUID` untuk id pesan | AMAN |
| `lib/chart-indicators.ts:51` | suffix id DOM unik | AMAN |
| `lib/notifications/notificationManager.ts:112` | id notifikasi | AMAN |
| `components/ui/LoadingFact.tsx:43` | memilih kalimat loading | AMAN |
| `components/export/card-3d-themes.ts:274` | memilih tema visual kartu ekspor | AMAN |
| `modules/ownership-flow/service/ownership-fetcher.service.ts:194` | jitter backoff retry | AMAN |
| `modules/user/utils/otp-generator.ts` | justru CSPRNG (`crypto.randomInt`) | AMAN |

Pemakaian `charCodeAt` semuanya adalah fungsi hash untuk **config fingerprint /
idempotency key**, bukan pembangkit angka pasar:
`modules/intraday/constants/intraday-model.ts:474`,
`modules/intraday/service/intraday-stats.ts:250`,
`modules/lens-radar/service/robust-validation.service.ts:144`,
`modules/recommendation/service/tpcl-validation.service.ts:364,675`,
`components/ui/TickerAvatar.tsx:34` (warna avatar).

**Di git history: 2 generator, keduanya sudah dihapus** (rincian di F-01).
Tidak ditemukan file ketiga yang menyalin logika tersebut.

**Hardcoded financial data:** pencarian pola `TICKER: <angka>` (mis. `BBCA: 10250`) tidak
menemukan sisa di working tree. Peta harga hardcoded hanya ada di dua file yang sudah
dihapus.

---

## 5. FALLBACK FINDINGS

| File:Line | Pola | Verdict |
|---|---|---|
| `modules/recommendation/service/breakout.service.ts:147` | `?? 50` **sudah dihapus**, ada komentar audit | PASS |
| `modules/technical/service/scoring.service.ts` (seluruhnya) | Input null -> `NA()` -> coverage turun | PASS |
| `modules/market/service/market-pulse.service.ts:292-296` | quote gagal -> `price/changePct/volume = null` (bukan 0) | PASS |
| `modules/market/service/market-regime.service.ts:209` | indikator hilang = UNKNOWN, bukan 50 | PASS |
| `modules/ownership-flow/service/ownership-delta.ts` | pembanding tak ada -> `pp: null`, bukan 0 | PASS |
| `modules/broker-flow/service/index-alpha-broker-summary.service.ts:147` | tanpa API key -> `throw` (fail-closed) | PASS |
| `modules/ownership-flow/source/source-registry.ts:canIngest` | sumber UNVERIFIED -> tolak ingestion walau flag ON | PASS |
| `modules/broker-flow/service/broker-summary-cache.service.ts:23,54` | `catch (42P01) -> return new Set()/{}` (tabel belum ada) | ACCEPTABLE (bukan angka karangan) |
| `idx-broker-summary-parser.service.ts:484-489` | `catch -> return null` + `console.error` | ACCEPTABLE (null, bukan angka) |
| `idx-broker-summary-parser.service.ts:88-93` | broker tak dikenal -> `DOMESTIC_INSTITUTION` | **FAIL — F-04** |
| `components/Dashboard.tsx:278` | `changePct` hilang -> `0` | **FAIL — F-07** |
| `modules/news/service/news.service.ts:297` | judul tak terpetakan -> `'NETRAL'` | **FAIL — F-08** |
| `fair-multiples.service.ts:94-101` | `payoutRatio` null -> retensi 0.6 | MARGINAL (dinyatakan di komentar, tidak di UI) |
| `modules/market/service/foreign-flow-proxy.ts:83-85` | history kosong -> `cmf20: 0, clv: 0.5` | MARGINAL (di-`null`-kan hulu oleh pemanggil sebelum masuk skor) |

**Tidak ditemukan satu pun** pola `catch { data = generateFallbackData() }` untuk data
finansial.

---

## 6. DEFAULT SCORE FINDINGS

| Lokasi | Nilai | Verdict |
|---|---|---|
| `scoring.service.ts` — semua komponen | tidak ada default; `NA()` menurunkan `coverage_pct` | PASS |
| `scoring.service.ts:getKategori` | `coverage < MIN_COVERAGE_PCT` -> `'DATA TIDAK CUKUP'` | PASS |
| `scoring.service.ts:combine` | penyebut = `declaredMax` konstan, sehingga hilangnya sub-faktor terlihat | PASS |
| `app/api/stock/[ticker]/route.ts:376` | `ffConfidence = 50` sebagai baseline NEUTRAL | ACCEPTABLE — nilai confidence, bukan skor; berasal dari cabang yang datanya ADA |
| `scoreFlowPersistensi` (fallback jendela < 20 bar) | `mk(5, ...)` | ACCEPTABLE — data ada, jendelanya yang pendek; alasannya menyatakan batasan |
| `foreign-flow-proxy.ts:83` | `clv: 0.5` untuk history kosong | MARGINAL |

**Kesimpulan §6:** SahamLens **tidak** mengubah "data hilang" menjadi skor 50. Ini adalah
salah satu bagian terkuat dari sistem, dan komentar audit di
`scoring.service.ts:12-21` menunjukkan pola ini pernah ada (temuan C-7: `rsi: 50`) dan
sudah diperbaiki dengan benar.

---

## 7. SOURCE PROVENANCE MATRIX

| Feature | Raw Source | Fetcher | DB | Calculation | API | UI |
|---|---|---|---|---|---|---|
| Technical | Yahoo OHLCV | `modules/technical/service/yahoo-history.service.ts` | cache Redis | `analyzers/*`, `scoring.service.ts` | `/api/stock/[ticker]` | `/technical/[symbol]` |
| LensScore | Yahoo OHLCV + fundamental | idem | `lens_radar_history` | `calculateScore()` | `/api/ai-pick` | Dashboard LensRadar |
| Foreign Flow (PROXY) | Yahoo OHLCV | idem | — | `foreign-flow-proxy.ts` | `/api/flow/[ticker]` | label "Estimasi Arus Dana Asing" |
| Broker Summary daily | CSV manual / Index Alpha API | `index-alpha-broker-summary.service.ts` | `broker_summary_daily` | `computeStockBrokerSummary()` | `/api/broker-summary/[ticker]` | `BrokerSummaryPanel` |
| Broker Distribution period | JSON Stockbit (manual) | impor admin | `broker_summary_period` | `getLatestBrokerPeriodSummary()` | server component | `/technical/[symbol]` — **menampilkan `Sumber: {data.source}`** |
| Ownership Flow | KSEI | `ownership-fetcher.service.ts` | `ownership_flow_history` + `_quarantine` | `ownership-delta.ts` | `/api/ownership-flow/[ticker]` | `/ownership-flow` |
| Fundamental PIT | Yahoo + observed_date manual | `generate-pit-from-yahoo.mjs` | `fundamental_history` | `fundamental-pit-adapter.ts` | backtest only | Admin |
| Makro | BI/BPS (evidence CSV) | `import-macro-assumptions.mjs` | `macro_input_evidence` | `valuation-assumption.service.ts` | `/api/macro` | `/macro` |
| Berita | RSS | `news.service.ts` | cache | AI/keyword classifier | `/api/news` | Dashboard |

**Kolom provenance yang SUDAH ada di skema** (`000_runtime_schema_baseline.sql:744-758,
770-785`): `source`, `source_file`, `imported_at`. Ini di atas praktik umum.
**Yang belum ada:** `source_url`, `is_estimated`, `is_proxy`, `data_quality`,
`raw_payload_hash`, dan — paling penting untuk kasus ini — `integrity_status` yang bisa
memisahkan baris terkarantina.

---

## 8. PROXY / MISLABEL AUDIT

| UI Label | Actual Calculation | Correct Classification | Recommended Label |
|---|---|---|---|
| "LensFlow (Estimasi Arus Dana Asing)" | CMF/MFM dari OHLCV Yahoo | PROXY | **SUDAH BENAR** (kata "Estimasi" hadir) |
| "Bandarmology (CMF)" | CMF20 + CLV | PROXY, metode disebut di label | **SUDAH BENAR** |
| "Moat Proxy" / "Proxy Kualitas Bisnis" | rasio fundamental | PROXY | **SUDAH BENAR** |
| "Money Flow" di header chart | `raw.cmf20` | DERIVED | SUDAH BENAR |
| **"Bandar: Net Buy Rp{x}"** (`id.ts:132`) | net SATU broker dengan \|net\| terbesar | PROXY / partial | **"Broker dominan {code}: Net {action} Rp{x}"** — F-05 |
| **"Institutional: Net Buy"** (`en.ts:134`) | idem | idem | idem |
| **`vol_ratio`** (screener) | volume estimasi U-shape / rata-rata 10-20 hari | ESTIMATED saat jam bursa | tambah badge "estimasi sesi berjalan" — F-06 |
| **`hasRealBrokerData: true`** | `rows.length > 0` | **klaim provenance tanpa dasar** | turunkan dari `source` + `imported_at` — F-02 |
| Komposisi Foreign/Domestic/Retail | 20+13 kode dipetakan, sisanya masuk domestik | sebagian ESTIMATED | tambah irisan "Belum terklasifikasi" — F-04 |

---

## 9. POINT-IN-TIME AUDIT

| Modul | Status | Bukti |
|---|---|---|
| `fundamental_history.asOf()` | **PIT SAFE** | `fundamental-history.repository.ts:276-278` — `WHERE ticker=$1 AND observed_date <= $2::date ORDER BY observed_date DESC LIMIT 1` |
| Insert fundamental PIT | **PIT SAFE** | `:206-207` — `period_end WAJIB dan harus <= observed_date`; `ON CONFLICT DO NOTHING` (baris lama menang, tidak ditimpa) |
| `scripts/backfill-lens-history.mjs` | **PIT SAFE** | header `:7-8` + `fundamentalAsOf()` `:265-268` (`row.observedDate <= requestedDate`) + query `:392` (`observed_date <= $2::date`) |
| `scripts/generate-pit-from-yahoo.mjs` | **PIT SAFE** | observed_date dari worklist terverifikasi manusia; `closeAtOrBefore()` mengambil harga `<= observed_date`; FX juga `<= observed_date` |
| `scripts/backfill-fundamental-history.mjs` | **PIT SAFE** | `:290-292` — observed_date wajib, ditolak bila di masa depan |
| Backfill Ownership Flow (arsip KSEI) | **PIT SAFE** | `backfill-ownership-flow.mjs:16-18` — "tidak ada data sintetis / forward-fill; observed_date selalu tanggal yang dinyatakan file" |
| `ownership-delta.ts` | **PIT SAFE** | mencari observasi terakhir `<=` batas, melaporkan `actualGapDays` sebenarnya; `pp: null` bila tak ada pembanding |
| Broker Summary daily | **UNKNOWN** | tidak ada kolom `published_at`/`observed_date`; hanya `trade_date` + `imported_at`. Untuk data EOD ini memadai, tetapi tidak ada bukti kapan baris tertentu benar-benar tersedia ke pasar |
| `MACRO_ASSUMPTIONS` di DCF | **PIT UNSAFE (by design, disadari)** | konstanta tunggal dipakai untuk semua tanggal; jalur evidence PIT ada tetapi sengaja `NOT_ADOPTED` |

**Tidak ditemukan look-ahead bias** di jalur historis mana pun yang diperiksa. Contoh kasus
Q4-2024 (period_end 2024-12-31, publikasi 2025-02-28) tertangani benar karena
`observed_date` diverifikasi manusia per baris, terlihat langsung di
`data/financials/pit-batch-41-verified-generated.csv`:

```csv
"ADMR","2025-03-03","2024-12-31",...,"...observed_date verified: Alamtri Minerals official FY24 financial statements release"
```

`observed_date` (2025-03-03) berjarak >2 bulan setelah `period_end` (2024-12-31) — persis
perilaku yang diinginkan.

---

## 10. BACKTEST INTEGRITY

| Aspek | Status | Bukti |
|---|---|---|
| Look-ahead | **AMAN** | fundamental hanya via `asOf()`; universe via `evaluatePointInTimeUniverse()` |
| Survivorship Bias | **DIAKUI, DIDOKUMENTASIKAN** | `simulate.service.ts:13, 107` — "Penyaring di atas MEMPERBURUK survivorship bias secara proporsional dengan panjang periode" |
| Future Leakage | **AMAN** | `estimateFullDayVolume` **dilarang** dipakai di analyzer/precompute historis (`trading-session.ts:11-16`) |
| Corporate Actions | **PARSIAL** | gap raw ekstrem ditandai `SUSPECTED`, tidak ditebak; bucket-backtest fail-closed. Dividen tidak disesuaikan (diakui di `simulate.service.ts:13`) |
| Execution Bias / same-bar TP-SL | **DITANGANI BAIK** | `tpcl-validation.service.ts:605-609, 1014-1025` — aturan `SL_FIRST` konservatif untuk produksi, skenario `tpFirst` dilaporkan sebagai batas atas, `ambiguousSharePct` diukur |
| Transaction Cost | **DITERAPKAN** | `simulate.service.ts:27-28` — `FEE_BUY_PCT 0.15%`, `FEE_SELL_PCT 0.25%` (termasuk levy 0.1%) |
| Slippage | **DITERAPKAN** | tergabung di `buyExecutionPrice` (`:41`) |
| Delisting / suspensi | **PARSIAL** | disebut di `:53` sebagai batasan yang diketahui |
| Calibration OOS | **AMAN** | `robust-validation.service.ts`, `walk-forward-validation.service.ts` terpisah dari training |
| Intraday Lab | **AMAN** | bar 5m nyata dari Yahoo chart v8, batas empiris terdokumentasi (`intraday-bars.service.ts:1-17`); tidak ada candle yang dibangkitkan |

---

## 11. DATABASE CONTAMINATION

**STATUS: TIDAK DAPAT DIVERIFIKASI DARI LINGKUNGAN INI** (tidak ada kredensial DB).

**Tabel berisiko: `broker_summary_daily` — dan HANYA tabel itu.**

Tidak ada bukti bahwa generator sintetis pernah menyentuh `fundamental_history`,
`ownership_flow_history`, `lens_radar_history`, `macro_input_evidence`,
`intraday_signals`, atau `broker_summary_period`.

### Fingerprint baris tersangka (dari F-01)

```text
trade_date   IN ('2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14')
ticker       IN ('BBCA.JK','BBRI.JK','BMRI.JK','BBNI.JK','TLKM.JK','ASII.JK',
                 'ADRO.JK','PTBA.JK','AMMN.JK','GOTO.JK','ICBP.JK','INDF.JK',
                 'UNTR.JK','MDKA.JK','PGAS.JK')
broker_code  IN ('AK','BK','CC','CS','ZP','YP','PD','XC','NI','DR','OD','KZ')
source       = 'IDX_EOD_REPORT'
jumlah maksimum yang diharapkan: 15 x 5 x 12 = 900 baris
```

Penanda statistik tambahan yang membedakannya dari data pasar nyata:
- `buy_value`/`sell_value` selalu kelipatan dari `N x 1.000.000.000` dikali faktor bias
  tetap (1.6 / 1.3 / 1.5 / 0.9 / 0.85 / 0.4 / 0.5 / 0.35) — distribusinya terlalu teratur;
- `buy_frequency` dan `sell_frequency` seragam terdistribusi di [50, 349];
- `buy_avg`/`sell_avg` selalu berada dalam +-10 dari satu harga dasar per ticker,
  identik di kelima tanggal — harga rata-rata broker tidak pernah berperilaku begitu;
- setiap ticker punya **tepat 12** broker, angka yang sama persis di semua tanggal;
- arah net seluruh broker asing serentak berbalik mengikuti paritas tanggal
  (`new Date(tradeDate).getDate() % 2 === 0`) — Senin-Jumat 10-14 Agustus akan
  memperlihatkan pola selang-seling sempurna;
- `imported_at` akan menggerombol dalam hitungan detik untuk seluruh 900 baris.

### Query forensik READ-ONLY (aman dijalankan, tidak mengubah apa pun)

```sql
-- 1. Volume total dan sebaran sumber
SELECT source, COUNT(*) AS rows, COUNT(DISTINCT ticker) AS tickers,
       MIN(trade_date) AS first_date, MAX(trade_date) AS last_date,
       MIN(imported_at) AS first_import, MAX(imported_at) AS last_import
FROM broker_summary_daily
GROUP BY source
ORDER BY rows DESC;

-- 2. Baris yang cocok dengan fingerprint generator
SELECT trade_date, COUNT(*) AS rows, COUNT(DISTINCT ticker) AS tickers,
       COUNT(DISTINCT broker_code) AS brokers,
       MIN(imported_at) AS first_import, MAX(imported_at) AS last_import
FROM broker_summary_daily
WHERE source = 'IDX_EOD_REPORT'
  AND trade_date BETWEEN DATE '2026-08-10' AND DATE '2026-08-14'
  AND ticker IN ('BBCA.JK','BBRI.JK','BMRI.JK','BBNI.JK','TLKM.JK','ASII.JK',
                 'ADRO.JK','PTBA.JK','AMMN.JK','GOTO.JK','ICBP.JK','INDF.JK',
                 'UNTR.JK','MDKA.JK','PGAS.JK')
GROUP BY trade_date
ORDER BY trade_date;

-- 3. Penanda batch-generator: ribuan baris dengan imported_at nyaris identik
SELECT date_trunc('second', imported_at) AS import_second, source, COUNT(*)
FROM broker_summary_daily
GROUP BY 1, 2
HAVING COUNT(*) > 50
ORDER BY 3 DESC
LIMIT 20;

-- 4. Penanda sintetis: harga rata-rata broker identik lintas tanggal
SELECT ticker, broker_code, COUNT(DISTINCT trade_date) AS days,
       ROUND(MIN(buy_avg)) AS min_avg, ROUND(MAX(buy_avg)) AS max_avg
FROM broker_summary_daily
WHERE buy_avg IS NOT NULL
GROUP BY ticker, broker_code
HAVING MAX(buy_avg) - MIN(buy_avg) < 25 AND COUNT(DISTINCT trade_date) >= 3
ORDER BY ticker, broker_code
LIMIT 50;

-- 5. Penanda sintetis: nilai kelipatan miliar bulat
SELECT COUNT(*) FILTER (WHERE buy_value % 1000000000 = 0) AS exact_billions,
       COUNT(*) AS total
FROM broker_summary_daily;

-- 6. Tabel period (jalur impor manual) - untuk perbandingan kontrol
SELECT source, source_file, COUNT(*), MIN(imported_at), MAX(imported_at)
FROM broker_summary_period
GROUP BY source, source_file
ORDER BY 3 DESC;
```

**Interpretasi:** bila query #2 mengembalikan 900 baris (atau kelipatan/subset yang rapi)
dengan `imported_at` menggerombol dalam satu detik, kontaminasi **terkonfirmasi**. Bila
mengembalikan 0 baris, endpoint backfill tidak pernah dieksekusi terhadap database
produksi dan status berubah menjadi CLEAN.

**JANGAN jalankan TRUNCATE / DELETE / DROP.** Rekomendasi pembersihan diberikan terpisah
setelah laporan ini direview.

---

## 12. CACHE CONTAMINATION

**Risiko: RENDAH.**

- Tidak ada satu pun kunci cache untuk data broker. `shared/cache/computed-keys.ts:20-28`
  hanya mendefinisikan `MARKET_SUMMARY`, `MARKET_PULSE`, `SCREENER_UNIVERSE`,
  `DIVIDEND_UNIVERSE`, `CORPORATE_CALENDAR`, `MACRO_DASHBOARD`, `MARKET_NEWS`.
- `computeStockBrokerSummary` membaca **langsung dari PostgreSQL**, tanpa lapisan Redis.
  Jadi bila baris DB dibersihkan, tidak ada salinan cache yang perlu di-invalidate.
- Cache HTTP: `/api/broker-summary/[ticker]` memakai `getMarketAwareCacheHeaders()` —
  respons ber-header cache bisa hidup di CDN/browser selama TTL-nya. Setelah pembersihan
  DB, TTL ini perlu ditunggu atau di-purge.
- Mekanisme `COMPUTED_CACHE_VERSION` (`shared/cache/cache-version.ts:22`) sudah ada dan
  benar untuk payload hitungan — tinggal di-bump bila ada perubahan rumus.

---

## 13. AI HALLUCINATION RISK

**Status: TERKENDALI DENGAN BAIK — salah satu bagian terkuat dari sistem.**

Tiga lapis pertahanan:

1. **Aturan prompt** (`app/api/chat/build-system-prompt.ts`): aturan #10, #14, #16, #21,
   #24, #25, #27 secara eksplisit melarang mengisi angka dari ingatan model, dari "Data
   Referensi" browser yang tak terverifikasi, atau dari angka yang diketik pengguna.
   Aturan #14: *"Jika blok server mengatakan suatu data tidak tersedia, DILARANG
   mengisinya dari Data Referensi, angka yang diketik pengguna (mis. 'anggap PER=5'),
   memory/model knowledge, atau tebakan."*

2. **Verifikasi angka deterministik** (`app/api/chat/verify-numbers.ts`): setiap angka
   berdesimal atau `>= 1000` dalam jawaban dicocokkan ke "Data Terverifikasi Server"
   dengan toleransi pembulatan 0,5%. Komentar filenya menyatakan alasannya dengan tepat:
   *"aturan melarang, tapi tidak memeriksa"*.

3. **Stream gate** (`app/api/chat/stream-gate.ts`): teks baru dilepas ke layar
   **setelah** satuan paragrafnya lolos verifikasi — bukan koreksi setelah pengguna
   membacanya.

Ditambah `dyor.ts` yang menempelkan penafian **di server**, bukan lewat instruksi prompt.

**Tidak ditemukan** prompt yang menginstruksikan model untuk `estimate`, `assume`, atau
`approximate` angka finansial.

**Sisa risiko:** verifikasi melewatkan angka bulat kecil (< 1000 tanpa desimal) —
disengaja dan dijelaskan di komentar, tetapi berarti klaim seperti "support di 850" pada
saham berharga rendah bisa lolos. Risiko rendah, layak dicatat.

---

## 14. FRONTEND MISREPRESENTATION

| Komponen | Masalah | Severity |
|---|---|---|
| `components/broker/BrokerSummaryPanel.tsx` | menampilkan hasil `hasRealBrokerData: true` tanpa menampilkan `source`/`imported_at` | **P0 (bagian dari F-02)** |
| `components/Dashboard.tsx:148-151` | label "Bandar/Institutional" untuk net satu broker | P2 (F-05) |
| `components/Dashboard.tsx:278` | `changePct` hilang dirender 0% | P3 (F-07) |
| Screener UI | `vol_ratio` estimasi tanpa badge | P2 (F-06) |
| Halaman DCF/intrinsic | tidak menampilkan `MACRO_ASSUMPTIONS.SET_ON` | P3 (F-10) |

**Yang sudah BENAR dan patut dicatat:**
- `app/technical/[symbol]/BrokerDistributionPanel.tsx` menampilkan
  **`Sumber: {data.source}`** dan menyatakan *"hasil import manual; belum memengaruhi
  LensScore, quant recommendation, atau advisory"* — ini persis standar yang diminta §36.
- `app/market-pulse/page.tsx:499-503` membedakan null dari 0 secara eksplisit.
- `components/market/MarketRegimePanel.tsx:156-157` menampilkan dekomposisi skor lengkap
  beserta sumbernya.
- `app/moat/page.tsx:576-579` menyatakan tidak ada skor yang dikarang saat data tak ada.

---

## 15. DEAD / LEGACY CODE

| File / Symbol | Status | Risiko |
|---|---|---|
| `saveBrokerTransactionsToDb()` (`idx-broker-summary-parser.service.ts:174`) | export, **nol pemanggil**, `DO UPDATE`, default `source='IDX_EOD_REPORT'` | **P1 — F-03** |
| `components/BandarFlowPro.tsx` | tidak diimpor di mana pun (hanya disebut di komentar) | P3 |
| `components/ownership-flow/OwnershipFlowCard.tsx` | tidak diimpor sejak `9ef47c9` | P3 |
| `scripts/generate-pit-from-yahoo-verified.mjs` | digantikan versi berparameter, jalur file hardcoded batch 41 | P3 (disengaja, terdokumentasi) |
| `.github/workflows/deploy-vps.yml.bak-before-403-fix` | file backup ikut ter-commit | P3 |
| `SahamLens_Audit_Fixes_2026-08-17.diff` (142 KB), `PATCH_DIFF.txt` | artefak patch ikut ter-commit, memuat potongan kode lama termasuk `INSERT INTO broker_summary_daily` (baris 533) | P3 — bukan kode aktif, tapi membingungkan audit berikutnya |

---

## 16. FIX PRIORITY

### P0 — Critical (sebelum fitur Broker Summary dibuka ke pengguna mana pun)
1. **F-01** — jalankan query forensik §11, tentukan status kontaminasi
   `broker_summary_daily`. Karantina, jangan hapus.
2. **F-02** — tambahkan filter whitelist `source` di `computeStockBrokerSummary()`;
   ubah `hasRealBrokerData` menjadi turunan provenance nyata; kembalikan `source` +
   `imported_at` ke klien.

### P1 — High
3. **F-03** — hapus `saveBrokerTransactionsToDb()` atau arahkan ke jalur impor tervalidasi.
4. Tambahkan kolom `integrity_status` + `source_url` pada `broker_summary_daily` &
   `broker_summary_period`, dan constraint yang menolak `source` dari daftar tidak dikenal.

### P2 — Medium
5. **F-04** — kategori `UNKNOWN` untuk broker tak terpetakan; keluarkan dari denominator.
6. **F-05** — ganti label i18n `bandarFlow` menjadi eksplisit "broker dominan {code}".
7. **F-06** — tambahkan flag `vol_ratio_is_estimated` di output screener + badge UI.
8. Tampilkan `source` + `imported_at` di `BrokerSummaryPanel`.

### P3 — Low
9. **F-07** — `changePct` hilang -> `null`, render "N/A".
10. **F-08** — hapus `|| 'NETRAL'` di `news.service.ts:297`.
11. **F-09** — rekonsiliasi `broker-summary-status.md` dengan `config/scheduled-jobs.json`.
12. **F-10** — tampilkan asumsi makro + `SET_ON` di halaman DCF/intrinsic.
13. Hapus `BandarFlowPro.tsx`, `OwnershipFlowCard.tsx`, dan artefak `.diff`/`.bak`.

---

## 17. FINAL VERDICT

> **Apakah SahamLens saat ini benar-benar bebas dari data dummy/sintetis di production?**

```text
UNKNOWN — INSUFFICIENT EVIDENCE
```

**Alasan jawaban ini, secara eksplisit:**

- **Kode sumber: BEBAS.** Ini dapat saya buktikan. Tidak ada generator data finansial
  tersisa di working tree, dan seluruh pemakaian keacakan yang tersisa sudah ditelusuri
  satu per satu ke fungsi non-finansial.
- **Database: TIDAK DAPAT DIBUKTIKAN.** Saya tidak punya akses ke `broker_summary_daily`
  produksi. Endpoint yang membangkitkan 900 baris `Math.random()` ada di repo selama
  jendela waktu tertentu di 2026-08-17, dan skemanya cocok dengan tabel produksi.
- **Yang membuat jawaban ini tidak bisa dinaikkan menjadi YES meskipun kodenya bersih:**
  baris sintetis ditulis dengan `source = 'IDX_EOD_REPORT'` — label yang sama dengan
  parser IDX yang sah. Provenance-nya sudah tercemar, jadi ketiadaan generator di kode
  **tidak menyiratkan** ketiadaan baris palsu di data.
- **Yang membuat status ini mendesak, bukan sekadar teoretis:**
  `computeStockBrokerSummary` membaca tabel itu tanpa filter `source`, dan endpoint
  publik menandai hasilnya `hasRealBrokerData: true`.

**Untuk menaikkan verdict ke `YES — VERIFIED` dibutuhkan tepat dua hal:**
1. Hasil query §11 yang membuktikan `broker_summary_daily` bersih (atau bukti karantina
   yang sudah diterapkan);
2. Perbaikan F-02 sehingga jalur baca memfilter provenance dan tidak lagi mengeluarkan
   klaim `hasRealBrokerData` tanpa dasar.

---

## 18. ZERO DUMMY COMPLIANCE CHECKLIST

```text
[PASS]         Tidak ada synthetic market data          (OHLCV/intraday semua dari Yahoo)
[PASS]         Tidak ada synthetic fundamental data     (PIT terverifikasi manusia)
[UNVERIFIED]   Tidak ada synthetic broker data          (kode bersih; DB tidak diperiksa - F-01)
[PASS]         Tidak ada random financial score         (nol Math.random di jalur skor)
[PASS*]        Missing tetap missing                    (*3 pengecualian: F-04, F-07, F-08)
[PARTIAL]      Proxy diberi label proxy                 (Moat/CMF/LensFlow benar; F-05, F-06 belum)
[PARTIAL]      Estimate diberi label estimate           (market-summary benar; screener belum - F-06)
[PASS]         Provider failure fail-closed             (IndexAlpha throw; KSEI canIngest tolak)
[PASS]         PIT tidak look-ahead                     (observed_date <= asOfDate di semua jalur)
[PASS]         LensAI tidak mengarang angka             (3 lapis: prompt + verify-numbers + stream-gate)
[PASS]         Backtest menggunakan historical data valid (fee+slippage, SL_FIRST, bias didokumentasikan)
[PARTIAL]      Database memiliki provenance             (source/source_file/imported_at ada,
                                                          TAPI source tidak dapat dipercaya - F-01)
```

**Skor: 8 PASS / 3 PARTIAL / 1 UNVERIFIED dari 12.**

---

## LAMPIRAN — SEMUA FILE YANG HARUS DIPERBAIKI

**JANGAN ubah apa pun sebelum laporan ini direview auditor kedua.**

### P0
```text
modules/broker-flow/service/idx-broker-summary-parser.service.ts   (F-02: baris 246-290)
app/api/broker-summary/[ticker]/route.ts                           (F-02: baris 35-40)
<database produksi: broker_summary_daily>                          (F-01: audit + karantina)
```

### P1
```text
modules/broker-flow/service/idx-broker-summary-parser.service.ts   (F-03: baris 174-200, hapus)
database/migrations/00X_broker_provenance_integrity.sql            (BARU: integrity_status, source_url)
```

### P2
```text
modules/broker-flow/service/idx-broker-summary-parser.service.ts   (F-04: baris 88-93)
lib/i18n/locales/id.ts                                             (F-05: baris 132)
lib/i18n/locales/en.ts                                             (F-05: baris 134)
components/Dashboard.tsx                                           (F-05: baris 148-151)
modules/broker-flow/service/broker-summary-cache.service.ts        (F-05: sertakan broker_code)
modules/market/service/screener.service.ts                         (F-06: baris 189-197, 359)
components/broker/BrokerSummaryPanel.tsx                           (tampilkan source + imported_at)
```

### P3
```text
components/Dashboard.tsx                                           (F-07: baris 278)
modules/news/service/news.service.ts                               (F-08: baris 297)
docs/ownership-flow/broker-summary-status.md                       (F-09)
config/scheduled-jobs.json                                         (F-09)
app/dcf/page.tsx  /  components/IntrinsicValue.tsx                 (F-10: tampilkan SET_ON)
modules/fundamental/service/fair-multiples.service.ts              (F-10: label retensi 0.6)
components/BandarFlowPro.tsx                                       (hapus - dead code)
components/ownership-flow/OwnershipFlowCard.tsx                    (hapus - dead code)
SahamLens_Audit_Fixes_2026-08-17.diff / PATCH_DIFF.txt             (hapus dari repo)
.github/workflows/deploy-vps.yml.bak-before-403-fix                (hapus dari repo)
```

---

## CATATAN PENUTUP UNTUK AUDITOR KEDUA

Tiga hal yang perlu diverifikasi ulang secara independen, karena di situ saya paling
mungkin salah:

1. **Apakah `POST /api/admin/broker-summary/backfill` pernah benar-benar dipanggil
   terhadap database produksi?** Saya hanya bisa membuktikan endpointnya pernah ada dan
   skemanya cocok. Cari log akses / audit admin untuk jendela 2026-08-17.

2. **Apakah `scripts/fetch-broker-summary-last-week.mjs` benar gagal karena mismatch
   skema?** Kesimpulan saya berdasarkan perbandingan nama kolom terhadap
   `000_runtime_schema_baseline.sql`. Bila di produksi tabelnya pernah punya kolom
   `net_value`/`net_volume`/`buy_avg_price` (mis. dibuat di luar migrasi), script itu
   berhasil dan cakupan kontaminasi lebih luas dari perkiraan saya.

3. **Apakah `parseIdxBrokerSummaryText` (yang default `source`-nya juga
   `'IDX_EOD_REPORT'`) pernah dipakai untuk impor nyata?** Bila ya, sebagian baris
   ber-`source='IDX_EOD_REPORT'` adalah data asli, dan pembersihan berbasis `source` saja
   akan menghapus data yang sah. Karena itulah §11 memberi fingerprint statistik
   tambahan, bukan hanya filter `source`.

Prinsip yang saya pegang di seluruh laporan ini: **klaim tanpa jalur eksekusi yang bisa
saya tunjuk tidak saya naikkan statusnya.** Bagian mana pun di atas yang bertuliskan
PASS memiliki referensi file:baris yang dapat diperiksa ulang; bagian yang tidak dapat
saya periksa tetap ditulis UNVERIFIED, bukan diasumsikan bersih.
