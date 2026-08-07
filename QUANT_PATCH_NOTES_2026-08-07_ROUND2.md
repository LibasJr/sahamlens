# SahamLens Quant Validation Patch — Round 2 (2026-08-07)

## Tujuan
Menutup temuan dari Preview Deployment branch quant-validation tanpa mengubah bobot production.

## Perubahan
1. **Calibration chart memakai observasi live yang sama dengan threshold simulator.** Snapshot `lens_bucket_stats` dari cron tidak lagi dipakai sebagai chart utama admin, sehingga mismatch seperti 1.097 vs 985 tidak dicampur dalam satu population. Snapshot cron tetap dibandingkan sebagai diagnostic dan warning jika berbeda.
2. **Bootstrap evidence status**: `SUPPORTIVE`, `INCONCLUSIVE`, `NEGATIVE`, `INSUFFICIENT_DATA`. CI yang melewati nol otomatis ditandai inconclusive.
3. **Monthly Spearman IC + ICIR**: IC dihitung per bulan dengan minimum 20 sampel efektif/bulan, lalu diringkas menjadi mean IC, standard deviation, ICIR, serta jumlah/persentase bulan positif. ICIR di sini adalah mean monthly IC / sample SD monthly IC (tidak diannualisasi).
4. **Mean-vs-median divergence guard**: threshold simulation menandai `MEAN_POSITIVE_MEDIAN_NEGATIVE` jika average positif tetapi median negatif. UI memberi warning bahwa average dapat ditopang oleh sebagian winner besar.
5. **Monotonicity UI diperjelas** dengan urutan bucket `<60 → 60-69 → 70-79 → 80-100`.

## Guardrails
- Tidak mengubah threshold production.
- Tidak mengubah bobot production.
- Status research / OOS gate tetap fail-closed.
- Patch ini belum menggantikan kebutuhan true walk-forward OOS validation.
