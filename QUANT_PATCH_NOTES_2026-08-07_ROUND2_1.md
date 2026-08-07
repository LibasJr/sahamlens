# SahamLens Quant Patch Round 2.1 — Reproducible Validation Audit

Tujuan patch ini adalah membuat hasil bootstrap/permutation di Calibration Lab dapat direproduksi dan diaudit untuk dataset yang sama.

## Perubahan

- Robust validation sekarang melakukan canonical sort terhadap observasi sebelum hashing, grouping, bootstrap, dan permutation.
- Seed bootstrap dan permutation deterministic berdasarkan fingerprint dataset efektif T+20.
- Menambahkan audit metadata `rv-2.1` ke response robust validation:
  - `datasetHash` (`fnv1a32-*`, fingerprint non-cryptographic untuk audit/reproducibility),
  - rentang tanggal sinyal,
  - jumlah observasi efektif,
  - seed bootstrap/permutation,
  - requested iteration counts,
  - flag `deterministic: true`.
- Calibration Lab menampilkan metadata audit sehingga refresh dengan dataset identik dapat diverifikasi menghasilkan statistik resampling identik.
- Menambahkan unit test bahwa:
  - input yang sama dengan urutan baris berbeda menghasilkan hash/seed/bootstrap/permutation identik;
  - perubahan satu observasi mengubah fingerprint dataset.

## Catatan keamanan/metodologi

- Fingerprint FNV-1a 32-bit bukan hash kriptografis dan tidak dipakai untuk keamanan; hanya untuk audit reproducibility.
- Patch tidak mengubah production LensScore weights atau production threshold.
- Status model tetap research-only sampai genuine out-of-sample/walk-forward validation tersedia.
