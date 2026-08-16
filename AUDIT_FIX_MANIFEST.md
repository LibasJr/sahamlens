# SahamLens — Audit Risk Closure Manifest

Tanggal patch: **2026-08-17**
Basis: source `sahamlens-main.zip` yang diberikan pengguna.

## Ringkasan perubahan

| Temuan | Status patch | Implementasi |
|---|---|---|
| H-2 universe historis selection/survivorship | **CODE FIXED + residual data limitation disclosed** | Universe validasi tidak lagi bergantung pada daftar 109 emiten yang dipilih dengan kondisi 2026. Eligibility per ticker dihitung point-in-time dari data yang tersedia sampai tanggal sinyal; `universe_eligible` dan diagnostiknya diarsipkan. Katalog default memakai kandidat IDX luas yang tersedia. Emiten yang sudah delisting tetap membutuhkan master listing historis asli. |
| H-6 fundamental PIT coverage | **FIXED as diagnostic / data remains source-dependent** | Calibration Lab menampilkan `fundamentalPitCoverage` total dan per tanggal. NO/MIXED coverage diberi warning eksplisit bahwa bucket dapat berisi technical+flow-only rows. Data fundamental yang hilang tidak difabrikasi. |
| M-3 bobot `SECTOR_RULES` tanpa dasar | **FIXED** | Bobot numerik sektoral hipotesis dihapus. Sektor hanya memilih metode valuasi yang applicable; metode valid yang tersedia digabung equal-weight. Status assumptions menjadi `ARBITRARY_WEIGHTS_REMOVED`. |
| M-7 label harga `RAW` menyesatkan | **FIXED** | Basis trading historis dinamai `SPLIT_ADJUSTED`; filter harga historis absolut/gocap yang tidak dapat diaudit pada seri split-adjusted dihapus dari validasi. |
| M-8 `market_cap` historis null / fallback berisiko | **FIXED for new PIT archival; historical gaps kept null** | `fundamental_history` menyimpan `shares_outstanding` dan `market_cap` saat benar-benar tersedia point-in-time. Fallback dangerous memakai sharesOutstanding masa kini untuk periode lampau dihapus. |
| M-9 broker frequency/volume hilang | **FIXED for ingestion/evidence; score integration gated** | Index Alpha CSV, importer, DB, monitor admin sekarang mempertahankan buy/sell value, volume, frequency dan avg value/transaction. Tidak dicampur ke LensScore sebelum histori PIT broker cukup untuk validasi/OOS. |
| M-13 corporate-action gap bias akibat filtered series | **FIXED** | Bucket Backtest dan Calibration mendeteksi gap dari full provider price series, bukan hanya LensRadar rows yang lolos filter likuiditas/coverage. |
| Missing intraday component `?? 50` | **FIXED** | Komponen yang hilang tidak lagi berubah menjadi angka netral 50. Score direnormalisasi hanya pada komponen valid; tanpa komponen valid hasil `null`/fail-closed. |
| Live-vs-backfill archive parity | **FIXED** | Arsip live sekarang menyimpan eligibility, available-max, dan PIT-universe metadata yang sama yang dibutuhkan jalur validasi. |

## Database migration

File baru:

`database/migrations/006_audit_risk_closure.sql`

Menambah:
- `fundamental_history.shares_outstanding`
- `fundamental_history.market_cap`
- eligibility/available-max/PIT-universe fields pada `lens_radar_history`
- broker buy/sell volume dan frequency pada `broker_summary_daily`
- index untuk validasi PIT dan fundamental PIT market cap.

Migration lama **tidak diubah**. SHA-256 `000_runtime_schema_baseline.sql` setelah patch:

`c2b97f11987bf67dfcbbde149649d2d15aebeb29d319568a8b85892ad364f7e5`

## QA yang dilakukan di workspace

- 40 file TypeScript/TSX yang berubah: parse/transpile syntax dengan TypeScript 5.8.3 → **0 syntax errors**.
- `node --check`:
  - `scripts/backfill-lens-history.mjs` → PASS
  - `scripts/backfill-fundamental-pit-v2.mjs` → PASS
  - `scripts/generate-pit-from-yahoo.mjs` → PASS
- Local import-path scan seluruh file yang berubah → **0 missing local imports**.
- SQL placeholder audit:
  - Lens history backfill: 40 columns, 39 parameters + `now()` → match.
  - Live LensRadar archive: 35 columns, 34 parameters + `now()` → match.
  - Broker daily import: 15 columns / 15 parameters → match.
- Baseline migration checksum dibandingkan dengan ZIP asli → **identik**.

### QA yang belum dapat dijalankan di sandbox

`npm ci --offline` tidak dapat menyelesaikan dependency karena cache tidak memiliki `zod-to-json-schema-3.25.2.tgz`. Karena `node_modules` tidak tersedia, full `npm run typecheck`, `npm test`, dan `npm run build` harus dijalankan di environment utama/VPS setelah `npm ci` berhasil. Patch ini **tidak mengklaim** full build/test suite sudah lulus.

## Deployment order

1. Backup source + database.
2. Copy patch ke application root.
3. `npm ci`.
4. `npm run typecheck`.
5. `npm test`.
6. `npm run build`.
7. Jika verifikasi source berhasil, apply migration `006`.
8. Backfill fundamental PIT yang benar-benar bersumber historis (jika tersedia).
9. Rebuild LensRadar history untuk validation window agar `universe_eligible` terisi.
10. Restart service hanya jika build + migration berhasil.
11. Buka Calibration Lab dan periksa `Coverage Fundamental PIT (H-06)` sebelum menafsirkan hasil backtest.

## Model governance

Patch metodologi/data-integrity ini **tidak** otomatis memvalidasi LensScore. Status `RESEARCH_ONLY` / `MODEL_UNVALIDATED` harus dipertahankan sampai forward out-of-sample evidence memenuhi gate yang sudah ditetapkan.
