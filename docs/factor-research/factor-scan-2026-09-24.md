# Pemindai faktor lintas-emiten (2026-09-24)

Arsip: 2021-08-30 → 2026-09-24 · 915 emiten beriwayat ≥300 sesi · 1.278.457 observasi · ambang likuiditas Rp 1 miliar/hari · imbal hasil depan 20 sesi (sekunder 60) · split train < 2025-01-01 ≤ OOS · biaya 0.40% per transaksi (fee; uji tahan 0.60%)

IC = korelasi peringkat Spearman antara ciri dan imbal hasil depan, diukur per tanggal di antara emiten
likuid (bukan per emiten). Nilai positif berarti ciri itu cenderung menaikkan peringkat emiten di hari itu.
t-statistik dihitung hanya dari tanggal non-tumpang-tindih (setiap 20 sesi) supaya tidak dilebih-lebihkan.

## Kekuatan informasi per faktor

| faktor | grup | observasi terpakai | IC train | IC OOS | IC OOS (non-overlap) | t | % tanggal positif (OOS) | D10−D1 (imbal 20 sesi) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Momentum 12 bulan minus 1 bulan | harga | 1.278.457 | 0.0151 | -0.0239 | -0.0106 | -0.28 | 55.7% | -0.07% |
| Momentum 6 bulan minus 1 bulan | harga | 1.278.457 | 0.0055 | -0.0021 | 0.0051 | 0.17 | 55.2% | 0.66% |
| Momentum 3 bulan minus 1 bulan | harga | 1.278.457 | 0.0194 | 0.0076 | -0.0061 | -0.21 | 57.3% | 1.78% |
| Balik arah 5 sesi (dibalik tandanya) | harga | 1.278.457 | -0.0103 | 0.0007 | -0.0339 | -2.14 | 50.1% | -2.20% |
| Balik arah 20 sesi (dibalik tandanya) | harga | 1.278.457 | -0.0144 | 0.0045 | 0.0124 | 0.56 | 48.1% | -2.86% |
| Volatilitas 60 sesi rendah | risiko | 1.278.457 | 0.1409 | 0.0865 | 0.0954 | 2.27 | 64.9% | 1.30% |
| Volatilitas 20 sesi rendah | risiko | 1.278.457 | 0.1170 | 0.0731 | 0.0734 | 1.98 | 64.1% | 0.74% |
| Harga di atas rata-rata 200 sesi | tren | 1.278.457 | 0.0106 | 0.0038 | 0.0044 | 0.19 | 57.3% | 1.28% |
| Jarak dari puncak 52 minggu | tren | 1.278.457 | 0.1049 | 0.0569 | 0.0643 | 1.81 | 72.5% | 2.88% |
| Likuiditas (log nilai transaksi 20 hari) | likuiditas | 1.278.457 | 0.0056 | -0.0391 | -0.0596 | -2.96 | 32.1% | -1.31% |
| Puncak imbal hasil harian 20 sesi (dibalik: hindari lotere) | risiko | 1.278.457 | 0.0784 | 0.0508 | 0.0403 | 1.29 | 62.8% | -0.72% |
| LensScore total (produksi) ⚠️ | skor | 2.426 | n/a | 0.1920 | 0.1739 | n/a | 100.0% | n/a |
| Skor teknikal (produksi) ⚠️ | skor | 2.426 | n/a | 0.1866 | 0.1651 | n/a | 100.0% | n/a |
| Skor fundamental (produksi) ⚠️ | skor | 2.426 | n/a | 0.0839 | 0.1000 | n/a | 77.8% | n/a |
| Skor arus (produksi) ⚠️ | skor | 2.426 | n/a | 0.1112 | 0.0768 | n/a | 90.0% | n/a |

⚠️ = kolom skor produksi. Nilainya **tidak boleh dipakai untuk periode sebelum Agustus 2026** karena ditulis
ulang, bukan dihitung pada hari sesinya — lihat audit di bawah. Baris ber-tanda ini hanya ditampilkan sebagai
catatan, bukan sebagai temuan.

## Audit keterisian waktu kolom skor (penting)

| tahun sesi | baris | ditulis tepat waktu (≤2 hari) | tulisan terawal | tulisan terakhir |
| --- | --- | --- | --- | --- |
| 2021 | 119.691 | 0 (0.0%) | 2026-08-28 17:32 | 2026-09-24 00:11 |
| 2022 | 541.907 | 0 (0.0%) | 2026-08-28 17:32 | 2026-09-24 00:11 |
| 2023 | 580.174 | 0 (0.0%) | 2026-08-28 17:32 | 2026-09-24 00:11 |
| 2024 | 620.460 | 0 (0.0%) | 2026-08-28 17:32 | 2026-09-24 00:11 |
| 2025 | 814.419 | 0 (0.0%) | 2026-08-11 23:05 | 2026-09-24 00:11 |
| 2026 | 759.463 | 7.551 (1.0%) | 2026-08-12 14:40 | 2026-09-24 09:15 |

Kolom skor pada arsip ini ditulis ulang pada Agustus–September 2026, bukan dihitung saat sesinya berlalu.
Akibatnya informasi masa depan bisa ikut masuk ke nilai skor historis, sehingga IC skor untuk periode
2021–2025 **tidak sah** sebagai bukti keunggulan. Faktor harga/risiko/tren tidak terkena masalah ini karena
diukur dari deret harga itu sendiri. Karena itu kesimpulan hanya memakai faktor non-skor.

## Desil imbal hasil depan 20 sesi (rata-rata, seluruh periode)

| faktor | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Momentum 12 bulan minus 1 bulan | 0.9% | 0.2% | 0.5% | 0.3% | 0.7% | 0.9% | 1.1% | 1.2% | 1.2% | 0.8% |
| Momentum 6 bulan minus 1 bulan | 0.8% | 0.5% | 0.2% | 0.3% | 0.7% | 0.9% | 1.1% | 1.0% | 1.0% | 1.4% |
| Momentum 3 bulan minus 1 bulan | -0.2% | 0.2% | 0.4% | 0.8% | 0.8% | 1.0% | 0.9% | 1.2% | 1.1% | 1.6% |
| Balik arah 5 sesi (dibalik tandanya) | 1.4% | 1.0% | 0.8% | 0.9% | 1.0% | 0.9% | 0.9% | 1.0% | 0.8% | -0.8% |
| Balik arah 20 sesi (dibalik tandanya) | 2.0% | 1.1% | 1.1% | 0.9% | 1.0% | 0.8% | 0.6% | 0.7% | 0.6% | -0.9% |
| Volatilitas 60 sesi rendah | -0.5% | 0.5% | 1.5% | 1.4% | 0.6% | 0.9% | 0.7% | 0.8% | 0.9% | 0.8% |
| Volatilitas 20 sesi rendah | 0.1% | 1.1% | 0.7% | 0.9% | 0.6% | 0.7% | 1.0% | 0.9% | 0.8% | 0.8% |
| Harga di atas rata-rata 200 sesi | -0.1% | 1.0% | -0.2% | -0.7% | 0.7% | 1.1% | 1.5% | 2.2% | 1.0% | 1.2% |
| Jarak dari puncak 52 minggu | 0.1% | -0.4% | -0.2% | 0.2% | 0.6% | 0.6% | 0.8% | 1.3% | 1.8% | 3.0% |
| Likuiditas (log nilai transaksi 20 hari) | 2.1% | 1.8% | 1.8% | 1.0% | 0.4% | 0.3% | -0.5% | -0.1% | 0.2% | 0.8% |
| Puncak imbal hasil harian 20 sesi (dibalik: hindari lotere) | 0.8% | 1.5% | 0.8% | 0.9% | 0.8% | 0.9% | 0.7% | 0.7% | 0.7% | 0.1% |
| LensScore total (produksi) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| Skor teknikal (produksi) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| Skor fundamental (produksi) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| Skor arus (produksi) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

## Portofolio desil teratas (timbang sama, rebalance tiap 20 sesi, biaya nyata)

| portofolio | periode | bruto rata2 | netto rata2 | menang | total | drawdown maks | OOS netto rata2 | OOS menang | turnover | emiten |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Komposit (faktor dengan IC train > 0) | 56 | 0.85% | 0.85% | 48.2% | 23.9% | -43.4% | 2.75% (20) | 55.0% | 54.9% | 32 |
| Momentum 12 bulan minus 1 bulan | 56 | -0.46% | -0.46% | 46.4% | -43.5% | -58.3% | 1.95% (20) | 60.0% | 51.7% | 33 |
| Momentum 6 bulan minus 1 bulan | 56 | 0.56% | 0.56% | 46.4% | 1.3% | -53.4% | 3.95% (20) | 60.0% | 69.4% | 33 |
| Momentum 3 bulan minus 1 bulan | 56 | 1.51% | 1.51% | 55.4% | 68.1% | -42.8% | 4.61% (20) | 65.0% | 86.1% | 35 |
| Volatilitas 60 sesi rendah | 56 | 0.80% | 0.80% | 57.1% | 50.6% | -16.3% | 1.31% (20) | 55.0% | 54.8% | 30 |
| Volatilitas 20 sesi rendah | 56 | 0.54% | 0.54% | 57.1% | 30.4% | -14.2% | 1.29% (20) | 70.0% | 69.0% | 36 |
| Harga di atas rata-rata 200 sesi | 56 | -0.02% | -0.02% | 50.0% | -9.8% | -34.0% | 1.26% (20) | 65.0% | 54.9% | 30 |
| Jarak dari puncak 52 minggu | 56 | 1.97% | 1.97% | 60.7% | 146.4% | -30.0% | 5.30% (20) | 70.0% | 78.7% | 31 |
| Likuiditas (log nilai transaksi 20 hari) | 56 | 0.67% | 0.67% | 58.9% | 23.9% | -39.4% | 1.44% (20) | 60.0% | 21.5% | 30 |
| Puncak imbal hasil harian 20 sesi (dibalik: hindari lotere) | 56 | 0.16% | 0.16% | 50.0% | -2.7% | -32.3% | 1.61% (20) | 65.0% | 86.1% | 36 |

Patokan (seluruh emiten likuid, timbang sama, tanpa biaya): rata-rata per periode 0.64%, total 28.8%, drawdown maks -32.1%, OOS 2.36% (20 periode).
Selisih komposit terhadap patokan setelah biaya: rata-rata per periode 0.22%, OOS 0.39%, menang 46.4%, total -1.6%.

## Kesimpulan

Faktor dengan IC positif di train **dan** OOS:
- **Momentum 3 bulan minus 1 bulan** — IC train 0.0194, IC OOS 0.0076, t -0.21, D10−D1 1.78%
- **Volatilitas 60 sesi rendah** — IC train 0.1409, IC OOS 0.0865, t 2.27, D10−D1 1.30%
- **Volatilitas 20 sesi rendah** — IC train 0.1170, IC OOS 0.0731, t 1.98, D10−D1 0.74%
- **Harga di atas rata-rata 200 sesi** — IC train 0.0106, IC OOS 0.0038, t 0.19, D10−D1 1.28%
- **Jarak dari puncak 52 minggu** — IC train 0.1049, IC OOS 0.0569, t 1.81, D10−D1 2.88%
- **Puncak imbal hasil harian 20 sesi (dibalik: hindari lotere)** — IC train 0.0784, IC OOS 0.0508, t 1.29, D10−D1 -0.72%

Komposit dari 9 faktor tersebut (dibentuk dari train): netto rata-rata 0.85% per 20 sesi (OOS 2.75%), menang 48.2%, drawdown maks -43.4%.

Catatan yang harus dibaca bersama angka di atas:
- Pengukuran per tanggal memperbesar jumlah sampel tetapi imbal hasil 20 sesi tumpang-tindih; itu sebabnya t-statistik
  dihitung dari tanggal non-tumpang-tindih saja.
- Portofolio di sini **long-only** dan dibandingkan dengan patokan timbang sama yang juga turut menanggung emiten yang
  sedang turun; keunggulan kecil belum berarti layak dipakai.
- Data yang tidak dipakai karena memang tidak lengkap: fundamental per emiten (200 emiten, praktis hanya Agustus 2026),
  kepemilikan asing bulanan (sejak Jan 2025), ringkasan broker (kosong). Tidak ada faktor karangan.
