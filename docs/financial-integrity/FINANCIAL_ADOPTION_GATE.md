# Financial Adoption Gate

## Tujuan

Macro PIT evidence dan bank-specific fundamental evidence tidak boleh langsung mengubah valuation atau LensScore hanya karena datanya sudah tersedia. Gate ini memisahkan tiga tahap:

1. **Evidence** — angka dan provenance point-in-time tersedia.
2. **Research analyzable** — data cukup konsisten untuk dianalisis secara deskriptif/validation.
3. **Model adoption** — membutuhkan model-version, test, dan validation protocol terpisah.

## Macro

Candidate risk-free, ERP, dan perpetual growth hanya dihitung dampaknya terhadap CAPM cost of equity pada beberapa beta audit. Tidak ada threshold impact yang otomatis mengadopsi parameter. Candidate diblokir hanya jika evidence tidak lengkap atau domain matematis terminal-growth tidak valid.

## Bank fundamentals

Maturity report menghitung period coverage, metric coverage, PIT violations, basis disclosure, reported/derived rows, dan jumlah period yang memiliki enam research metrics: NIM, NPL Gross, CASA, CAR, LDR, dan Cost of Credit.

`researchAnalyzable=true` hanya berarti ada sedikitnya satu period lengkap dan tidak ada PIT violation. Itu **bukan** izin untuk LensScore. Semua bank metrics tetap `DATA_ONLY_NOT_VALIDATED` sampai protocol validation dan sample-history requirement ditetapkan serta lolos.

## Anti-look-ahead

- `observed_date` adalah boundary utama data bank.
- `usable_from_date` adalah boundary utama macro evidence.
- Backfilled evidence tidak boleh diperlakukan sebagai data yang tersedia sebelum tanggal observasinya.

## No auto-adoption

Tidak ada API atau tombol pada Financial Integrity Lab yang menulis parameter model. Adoption harus dilakukan sebagai perubahan model-version yang eksplisit dan melalui CI/golden/regression tests.
