# SahamLens Quant Patch Notes — 2026-08-07

## Perubahan utama

- Memperbaiki denominator `totalSamples` bucket agar sesuai populasi T+20, bukan T+1.
- Menambahkan robust validation pada Calibration Lab:
  - calendar-week block bootstrap 95% CI;
  - within-week label permutation test;
  - Spearman rank IC LensScore vs forward return T+20;
  - monotonicity antar bucket LensScore.
- Memperjelas raw signal count vs effective non-overlapping sample count pada UI admin.
- Menambah metrik threshold simulator: median return, avg winner/loss, expectancy, dan profit factor.
- Memperketat optimizer bobot LensScore:
  - observasi T+20 didekorelasikan terlebih dahulu;
  - split kronologis 70% train / 30% OOS;
  - kandidat dipilih hanya dari train;
  - OOS baru dievaluasi setelah kandidat dibekukan;
  - proposal hanya `PENDING_APPROVAL` jika OOS punya >=10 sampel per bucket, spread positif, mengungguli baseline, dan Welch one-tailed p-value OOS <= 0.10;
  - tidak ada perubahan bobot production otomatis.
- Menambah unit test untuk robust validation dan chronological split.

## Validasi yang dilakukan di environment ini

- `robust-validation.service.ts` berhasil dikompilasi dengan TypeScript standalone strict mode.
- Smoke test sintetik untuk bootstrap, permutation, Spearman IC, dan monotonicity berhasil.
- Full `npm ci` / full test suite **belum dapat dijalankan** karena registry dependency environment tidak menyediakan `zod-validation-error@4.0.2`. Ini keterbatasan environment, bukan error source project.

## Sebelum deploy

Jalankan pada mesin/repo Anda yang dependency-nya lengkap:

```bash
npm ci
npm run typecheck
npm test -- modules/lens-radar/service/__tests__/robust-validation.service.test.ts
npm test -- modules/lens-radar/service/__tests__/lens-score-optimizer.service.test.ts
npm test -- modules/lens-radar/service/__tests__/calibration.service.test.ts
npm test -- modules/lens-radar/service/__tests__/bucket-backtest.service.test.ts
npm run build
```

Tetap pertahankan status `RESEARCH_ONLY` sampai true OOS/forward validation cukup panjang.
