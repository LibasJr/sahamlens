# Fundamental PIT Backfill v2

## Tujuan
Mengisi `fundamental_history` untuk:
- Q3 2024 (`period_end=2024-09-30`)
- Q4 2024 (`period_end=2024-12-31`)
- Q1 2025 (`period_end=2025-03-31`)
- Q2 2025 (`period_end=2025-06-30`)

`observed_date` adalah tanggal publikasi/pertama diketahui pasar, BUKAN akhir periode.

## Fail-closed
Patch tidak menyertakan angka fundamental buatan.
Repo saat patch dibuat belum memiliki `data/financials/`, maka script akan berhenti tanpa write
sampai data PIT historis yang benar tersedia.

## Format file
Letakkan CSV/JSON di `data/financials/`.

CSV minimal:
`ticker,observed_date,period_end,per,pbv,roe,der,current_ratio,revenue_growth,source`

Contoh struktur (ANGKA HANYA HEADER/FORMAT, bukan data yang harus di-copy):
`BBCA.JK,YYYY-MM-DD,2024-12-31,...`

Jangan memakai tanggal publikasi contoh sebagai fakta jika belum diverifikasi.

## Menjalankan
Dry run semua BACKTEST_UNIVERSE:
`node scripts/backfill-fundamental-pit-v2.mjs --dry-run`

Pilot 10 ticker:
`node scripts/backfill-fundamental-pit-v2.mjs --pilot --dry-run`

Write pilot:
`node scripts/backfill-fundamental-pit-v2.mjs --pilot`

Write universe:
`node scripts/backfill-fundamental-pit-v2.mjs`

## Pilot 10
ASII, BBCA, BBRI, TLKM, STAA, AUTO, BFIN, GJTL, INDF, ICBP.

## Proteksi data lama
- Schema change hanya ADD COLUMN `period_end`.
- Insert PIT memakai `ON CONFLICT (ticker, observed_date) DO NOTHING`.
- Tidak ada UPDATE/DELETE.
- Snapshot lama seperti 2026-01-30 tetap utuh.
- `period_end` snapshot lama boleh NULL.

## Audit otomatis
Sebelum dan sesudah write script mencetak ekuivalen:
`SELECT COUNT(DISTINCT observed_date), COUNT(*) FROM fundamental_history;`

## Setelah data valid terisi
Baru jalankan recompute/backfill Lens history dan bucket validation sesuai workflow project.
Jangan rebuild bucket jika PIT source belum lolos dry-run/coverage review.
