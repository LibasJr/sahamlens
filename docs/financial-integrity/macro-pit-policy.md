# Macro PIT Policy — SahamLens

Macro input dipisahkan menjadi **evidence** dan **production model parameter**.

- `market_date`: tanggal nilai pasar/kebijakan yang dirujuk sumber.
- `observed_date`: tanggal sumber tersebut sudah publik dan dapat diketahui SahamLens.
- `usable_from_date`: tanggal pertama evidence boleh digunakan tanpa look-ahead; wajib `>= observed_date`.
- `MODEL_POLICY`: parameter internal (mis. growth cap), **bukan market observation**.

## Aturan adopsi

Import ke `macro_input_evidence` tidak mengubah `MACRO_ASSUMPTIONS`. Adopsi parameter baru wajib:

1. bump versi model;
2. golden/regression valuation test;
3. sensitivity review terhadap fair value dan LensScore;
4. backtest/validation ulang yang relevan;
5. catat effective/usable date baru.

## Sumber baseline audit 2026

- Risk-free proxy: yield SBN Rupiah tenor 10 tahun, sumber pemerintah yang menyebut market date secara eksplisit.
- Indonesia ERP: annual country risk premium research dataset; diklasifikasikan `RESEARCH_ESTIMATE`, bukan data pemerintah.
- BI-Rate dan inflation target: konteks makro resmi Bank Indonesia, bukan pengganti risk-free 10Y.
- Perpetual growth cap: `MODEL_POLICY`; tidak boleh dilabeli sebagai data pasar.
