# SahamLens — PostgreSQL + Calibration Performance Integrated Fix (2026-08-10)

Baseline: `sahamlens-main-review-round4-full.zip`.

## Perubahan

### 1. PostgreSQL connection hardening (merged, bukan overwrite mentah)
File: `shared/database/postgres.client.ts`

Dipertahankan dari Round 4:
- PostgreSQL DATE parser `types.setTypeParser(1082, ...)` agar DATE tetap `YYYY-MM-DD`.
- Lazy pool initialization.
- Normalisasi `sslmode=verify-full`.
- `ssl.rejectUnauthorized=true`.

Ditambahkan:
- `pool.on('error')` untuk idle-client connection errors supaya tidak menjadi uncaught EventEmitter error.
- `maxLifetimeSeconds: 300` untuk rotasi koneksi warm serverless.
- `queryReadWithRetry()` satu kali khusus query read-only/transient connection failure.

### 2. Calibration Yahoo 5y performance limiter
File baru:
- `shared/async/bounded-loader.ts`
- `shared/async/__tests__/bounded-loader.test.ts`
- `modules/lens-radar/service/calibration-yahoo-history.service.ts`

Integrasi:
- `modules/lens-radar/service/calibration.service.ts` hanya mengganti fetch Yahoo 5y provider ke wrapper calibration.
- Maksimum 6 Yahoo fetch aktif per warm instance.
- In-flight dedupe per ticker/range.
- Success cache 10 menit.
- Failure/null tidak dicache.

### 3. Bug fix terhadap patch performance sebelumnya
Patch sebelumnya menyatakan failure `null` tidak dicache, tetapi generic loader tetap mencache semua resolved value termasuk `null`.
Versi terintegrasi ini menambah `shouldCache` dan calibration memakai `shouldCache: value => value !== null`.

## Tidak diubah
- LensScore.
- Bucket / threshold.
- PIT fundamental.
- T+20 definition.
- robust validation.
- retrospective walk-forward.
- genuine OOS.
- validation/advisory gate / RESEARCH_ONLY semantics.

## Validasi environment
- Integrasi source diverifikasi marker/import secara statis.
- `npm ci` tidak dapat diselesaikan karena registry environment tidak menyediakan `zod-validation-error@4.0.2` (404), masalah environment yang sama seperti validasi quant sebelumnya.
- Karena dependency install gagal, `npm run typecheck`, Vitest, dan `npm run build` tidak dapat dijalankan di environment ini.

## Validasi yang harus dijalankan lokal sebelum deploy
```bash
npm ci
npm run typecheck
npm test -- shared/async/__tests__/bounded-loader.test.ts
npm test -- modules/lens-radar/service/__tests__/calibration.service.test.ts
npm run build
```
