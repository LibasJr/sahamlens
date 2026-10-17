# Uji regime filter pada faktor harga (2026-10-17)

**Verdict: GUGUR**

Hipotesis tunggal (dibekukan di kepala `scripts/regime-filter-research.mjs` sebelum dijalankan): netto per 20 sesi portofolio
desil teratas `vol_60` rendah dan `dist_high_52w` lebih baik saat proxy regime > MA100 dibanding saat <= MA100.
Arsip 2021-08-30 -> 2026-10-16 · 915 emiten · 291.845 observasi · rebalance 20 sesi · biaya 0.40% (uji tahan 0.60%) · split train < 2025-01-01 <= OOS · 1144 sesi punya regime (MA100, 9 sesi tipis tanpa imbal hasil indeks).

Proxy regime: indeks timbang-sama emiten likuid (>= Rp1 miliar/hari pada sesi sebelumnya) dari arsip harga; regime tanggal t hanya memakai data <= t.
Skor lens_* TIDAK dipakai (ditulis ulang Agu-Sep 2026). Portofolio selalu terinvestasi seperti factor-research.mjs; regime hanya menggolongkan periode.

## Volatilitas 60 sesi rendah (vol_60) - GUGUR

Periode portofolio 49, 0 dibuang karena riwayat indeks < 100 sesi.

| split | regime | tanggal | netto/20 sesi | menang | netto uji tahan 0,60% | patokan timbang-sama (tanpa biaya) | netto - patokan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| train | naik (> MA100) | 10 | -1.51% | 30.0% | -1.59% | -0.56% | -0.95% |
| train | turun (<= MA100) | 18 | 0.99% | 61.1% | 0.92% | -0.28% | 1.27% |
| oos | naik (> MA100) | 12 | 1.14% | 58.3% | 1.07% | 3.25% | -2.11% |
| oos | turun (<= MA100) | 9 | 2.53% | 66.7% | 2.47% | 1.01% | 1.52% |

| split | selisih netto (naik - turun) | t-Welch | selisih patokan (naik - turun) | selisih uji tahan 0,60% | t uji tahan |
| --- | --- | --- | --- | --- | --- |
| train | -2.50% | -2.17 | -0.28% | -2.52% | -2.18 |
| oos | -1.39% | -0.90 | 2.24% | -1.40% | -0.90 |

| kurva | DD maks (seluruh) | total (seluruh) | DD maks (OOS) | total (OOS) |
| --- | --- | --- | --- | --- |
| selalu terinvestasi (netto) | -15.0% | 43.9% | -6.5% | 41.9% |
| tersaring regime (tunai saat turun; 22 periode terinvestasi) | -15.9% | -3.4% | -5.2% | 13.5% |
| patokan timbang-sama (tanpa biaya) | -32.6% | 30.3% | -32.6% | 48.3% |

Kriteria: selisih train > 0 TIDAK · selisih OOS > 0 TIDAK · t OOS >= 2 TIDAK (t = -0.90).

## Jarak dari puncak 52 minggu (dist_high_52w) - GUGUR

Periode portofolio 49, 0 dibuang karena riwayat indeks < 100 sesi.

| split | regime | tanggal | netto/20 sesi | menang | netto uji tahan 0,60% | patokan timbang-sama (tanpa biaya) | netto - patokan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| train | naik (> MA100) | 10 | 3.80% | 60.0% | 3.66% | -0.56% | 4.36% |
| train | turun (<= MA100) | 18 | 0.42% | 38.9% | 0.30% | -0.28% | 0.70% |
| oos | naik (> MA100) | 12 | 8.31% | 66.7% | 8.16% | 3.25% | 5.06% |
| oos | turun (<= MA100) | 9 | 1.28% | 55.6% | 1.17% | 1.01% | 0.27% |

| split | selisih netto (naik - turun) | t-Welch | selisih patokan (naik - turun) | selisih uji tahan 0,60% | t uji tahan |
| --- | --- | --- | --- | --- | --- |
| train | 3.39% | 1.33 | -0.28% | 3.36% | 1.32 |
| oos | 7.03% | 1.52 | 2.24% | 7.00% | 1.51 |

| kurva | DD maks (seluruh) | total (seluruh) | DD maks (OOS) | total (OOS) |
| --- | --- | --- | --- | --- |
| selalu terinvestasi (netto) | -27.7% | 293.5% | -27.7% | 162.6% |
| tersaring regime (tunai saat turun; 22 periode terinvestasi) | -20.7% | 239.9% | -20.7% | 139.9% |
| patokan timbang-sama (tanpa biaya) | -32.6% | 30.3% | -32.6% | 48.3% |

Kriteria: selisih train > 0 ya · selisih OOS > 0 ya · t OOS >= 2 TIDAK (t = 1.52).

## Kesimpulan

Verdict **GUGUR**. PASS hanya jika kedua faktor memenuhi: selisih regime searah positif di train dan OOS, dan t-Welch OOS >= 2. Tidak ada tuning setelah hasil dilihat.

Keterbatasan: (1) hanya emiten yang masih ada di arsip dengan >= 300 sesi (bias penyintas, sama dengan factor-research.mjs); (2) OOS ~2 tahun = sedikit periode 20 sesi, sehingga t >= 2 sulit dicapai secara struktural; (3) proxy bukan IHSG, dan satu kali uji tidak bisa dibuktikan ulang pada data yang sama.
