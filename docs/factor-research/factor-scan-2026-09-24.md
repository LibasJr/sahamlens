# Pemindai faktor lintas-emiten (2026-09-24)

Arsip: 2021-08-30 → 2026-09-24 · 915 emiten beriwayat ≥300 sesi · 285.360 observasi · ambang likuiditas Rp 1 miliar/hari · imbal hasil depan 20 sesi (sekunder 60) · split train < 2025-01-01 ≤ OOS · biaya 0.40% per transaksi (fee; uji tahan 0.60%)

IC = korelasi peringkat Spearman antara ciri dan imbal hasil depan, diukur per tanggal di antara emiten
likuid (bukan per emiten). Nilai positif berarti ciri itu cenderung menaikkan peringkat emiten di hari itu.
t-statistik dihitung hanya dari tanggal non-tumpang-tindih (setiap 20 sesi) supaya tidak dilebih-lebihkan.

## Kekuatan informasi per faktor

| faktor | grup | observasi terpakai | IC train | IC OOS | IC OOS (non-overlap) | t | % tanggal positif (OOS) | D10−D1 (imbal 20 sesi) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Momentum 12 bulan minus 1 bulan | harga | 285.360 | 0.0670 | -0.0432 | -0.0477 | -1.33 | 50.1% | 1.01% |
| Momentum 6 bulan minus 1 bulan | harga | 285.360 | 0.0102 | -0.0477 | -0.0463 | -1.52 | 42.0% | -0.66% |
| Momentum 3 bulan minus 1 bulan | harga | 285.360 | 0.0048 | -0.0197 | -0.0085 | -0.31 | 44.8% | -0.72% |
| Balik arah 5 sesi (dibalik tandanya) | harga | 285.360 | -0.0093 | 0.0106 | 0.0092 | 0.28 | 47.8% | -2.48% |
| Balik arah 20 sesi (dibalik tandanya) | harga | 285.360 | -0.0097 | 0.0081 | 0.0078 | 0.27 | 47.3% | -2.66% |
| Volatilitas 60 sesi rendah | risiko | 285.360 | 0.1484 | 0.1056 | 0.1100 | 2.26 | 65.1% | 1.10% |
| Volatilitas 20 sesi rendah | risiko | 285.360 | 0.1330 | 0.0935 | 0.1028 | 2.41 | 65.1% | 0.34% |
| Harga di atas rata-rata 200 sesi | tren | 285.360 | 0.0185 | -0.0211 | -0.0189 | -0.80 | 47.6% | 1.66% |
| Jarak dari puncak 52 minggu | tren | 285.360 | 0.1061 | 0.0452 | 0.0481 | 1.37 | 69.0% | 2.58% |
| Likuiditas (log nilai transaksi 20 hari) | likuiditas | 285.360 | 0.0118 | -0.0429 | -0.0616 | -3.11 | 29.8% | -1.99% |
| Puncak imbal hasil harian 20 sesi (dibalik: hindari lotere) | risiko | 285.360 | 0.1143 | 0.0774 | 0.0810 | 2.09 | 63.6% | 0.14% |
| LensScore total (produksi, materialisasi terakhir) ※ | skor | 285.360 | 0.0169 | -0.0173 | -0.0058 | -0.25 | 48.1% | 1.53% |
| Skor teknikal (produksi, materialisasi terakhir) ※ | skor | 285.360 | 0.0111 | -0.0133 | -0.0033 | -0.15 | 50.4% | 1.40% |
| Skor fundamental (produksi, materialisasi terakhir) ※ | skor | 285.360 | 0.0740 | 0.0472 | 0.0424 | 2.13 | 68.7% | 1.56% |
| Skor arus (produksi, materialisasi terakhir) ※ | skor | 285.360 | n/a | -0.0190 | -0.0165 | -0.56 | 52.1% | 0.99% |
※ = faktor skor produksi: ditampilkan sebagai catatan, tidak ikut membentuk komposit (lihat audit arsip di bawah).

## Audit arsip skor (penting dibaca)

### 1. Arsip menyimpan beberapa materialisasi untuk satu sesi yang sama

| tahun sesi | baris | pasangan sesi-emiten unik | materialisasi berlebih | versi skor | dihitung pertama | dihitung terakhir |
| --- | --- | --- | --- | --- | --- | --- |
| 2021 | 119.691 | 60.646 | 59.045 | 2 | 2026-08-28 | 2026-09-23 |
| 2022 | 541.907 | 179.763 | 362.144 | 2 | 2026-08-28 | 2026-09-23 |
| 2023 | 580.174 | 192.550 | 387.624 | 2 | 2026-08-28 | 2026-09-23 |
| 2024 | 620.460 | 205.989 | 414.471 | 2 | 2026-08-28 | 2026-09-23 |
| 2025 | 814.419 | 212.823 | 601.596 | 3 | 2026-08-11 | 2026-09-23 |
| 2026 | 759.463 | 160.693 | 598.770 | 3 | 2026-08-12 | 2026-09-24 |

Total: 3.436.114 baris untuk 1.012.464 pasangan sesi-emiten unik — **3.4× lipat**. Kunci utama arsip memuat hash konfigurasi, sehingga setiap kali skor
dihitung ulang dengan konfigurasi berbeda, baris baru ditambahkan, bukan menimpa. Tanpa menyaring satu materialisasi
saja, satu emiten bisa terwakili sampai 6 kali di dalam satu tanggal — itu akan mengacaukan peringkat lintas-emiten.
Karena itu skrip ini mengambil **satu** materialisasi per pasangan (perhitungan terbaru).

### 2. Skor historis dihitung ulang, tetapi dirancang point-in-time

Seluruh baris 2021–2025 dihitung pada Agustus–September 2026, bukan saat sesinya berlalu. Itu **tidak otomatis**
berarti ada kebocoran masa depan: skrip pembentuk arsip (`scripts/backfill-lens-history.mjs`) mengambil fundamental
hanya dengan syarat `observed_date <= tanggal sinyal`, dan `observed_date` di `fundamental_history` adalah
tanggal terbit berkas resmi IDX (XBRL), bukan akhir periode laporan.

Bukti data: 373 baris fundamental, 51 emiten, observasi 2022-01-26 → 2026-05-26, 8 periode laporan. Jarak terbit dari akhir periode: **terpendek 11 hari**, tengah **65 hari** (tidak ada baris dengan observasi = akhir periode, jadi memang tanggal terbit).

Sisa keterbatasan yang tetap berlaku (dan tidak bisa ditutup dari arsip ini):

- **Cakupan fundamental tipis.** `fundamental_history` hanya 200 emiten; untuk sesi 2021–2025 hanya 45–51 emiten
  punya fundamental terbit. Sisanya dinilai dengan komponen yang tersedia sebagian (`coverage_pct` < 100).
- **Cakupan penuh hampir tidak ada di periode uji.** Baris dengan `coverage_pct` ≥ 99: **0%** untuk 2021–2025 dan
  hanya 2,2% untuk 2026. Jadi skor historis di sini adalah skor sebagian, bukan skor lengkap.
- **Arsip tidak menyimpan apa yang benar-benar ditampilkan produk pada hari itu.** Karena baris ditimpa/ditambah,
  yang bisa diuji adalah hitungan ulang, bukan perilaku produk saat itu. Untuk itu diperlukan snapshot harian yang
  tidak bisa diubah (usulan perbaikan, belum dikerjakan).

Karena dua keterbatasan pertama, faktor skor tetap ditampilkan di tabel di atas sebagai catatan, tetapi **tidak** ikut
membentuk komposit — komposit hanya memakai faktor yang bisa dihitung penuh dari harga.

## Desil imbal hasil depan 20 sesi (rata-rata, seluruh periode)

| faktor | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Momentum 12 bulan minus 1 bulan | 0.9% | 0.0% | 0.3% | 0.5% | 0.9% | 1.0% | 1.1% | 1.2% | 1.5% | 2.0% |
| Momentum 6 bulan minus 1 bulan | 1.7% | 0.8% | 0.9% | 0.7% | 0.8% | 1.1% | 1.2% | 1.0% | 0.4% | 1.0% |
| Momentum 3 bulan minus 1 bulan | 1.8% | 0.6% | 0.6% | 0.6% | 0.9% | 1.0% | 1.2% | 1.1% | 0.9% | 1.1% |
| Balik arah 5 sesi (dibalik tandanya) | 2.5% | 1.1% | 1.2% | 1.0% | 0.8% | 0.9% | 0.8% | 0.8% | 0.7% | -0.0% |
| Balik arah 20 sesi (dibalik tandanya) | 2.8% | 1.6% | 1.3% | 1.1% | 0.9% | 0.6% | 0.4% | 0.3% | 0.5% | 0.2% |
| Volatilitas 60 sesi rendah | -0.1% | 0.5% | 2.1% | 1.2% | 1.8% | 1.2% | 0.5% | 1.0% | 0.5% | 1.0% |
| Volatilitas 20 sesi rendah | 0.4% | 0.8% | 1.6% | 1.9% | 1.0% | 0.9% | 0.8% | 0.8% | 0.8% | 0.7% |
| Harga di atas rata-rata 200 sesi | -0.2% | 0.4% | 0.7% | 0.8% | 1.1% | 1.5% | 1.7% | 0.9% | 1.2% | 1.5% |
| Jarak dari puncak 52 minggu | 1.0% | 0.3% | 0.1% | 0.3% | 0.5% | 0.4% | 0.7% | 0.9% | 1.6% | 3.6% |
| Likuiditas (log nilai transaksi 20 hari) | 2.4% | 1.8% | 1.8% | 1.3% | 0.7% | 0.8% | 0.1% | 0.3% | 0.2% | 0.4% |
| Puncak imbal hasil harian 20 sesi (dibalik: hindari lotere) | 0.5% | 1.0% | 2.0% | 1.8% | 1.3% | 0.6% | 0.6% | 0.8% | 0.5% | 0.6% |
| LensScore total (produksi, materialisasi terakhir) | -0.2% | 0.3% | 0.3% | 0.7% | 1.0% | 1.3% | 1.4% | 1.7% | 1.7% | 1.4% |
| Skor teknikal (produksi, materialisasi terakhir) | 0.1% | 0.3% | 0.2% | 0.8% | 1.0% | 1.2% | 1.3% | 1.6% | 1.6% | 1.5% |
| Skor fundamental (produksi, materialisasi terakhir) | -0.2% | 0.1% | 1.1% | 1.5% | 1.0% | 1.2% | 0.7% | 1.1% | 1.7% | 1.4% |
| Skor arus (produksi, materialisasi terakhir) | 0.3% | -0.1% | 1.3% | 2.0% | 0.8% | 0.9% | 1.1% | 0.9% | 1.1% | 1.3% |

## Portofolio desil teratas (timbang sama, rebalance tiap 20 sesi, biaya nyata)

| portofolio | periode | bruto rata2 | netto rata2 | menang | total | drawdown maks | OOS netto rata2 | OOS menang | turnover | emiten |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Komposit (faktor dengan IC train > 0) | 48 | 1.15% | 1.15% | 58.3% | 26.2% | -50.7% | 3.30% (20) | 60.0% | 31.8% | 30 |
| Momentum 12 bulan minus 1 bulan | 48 | 0.99% | 0.99% | 47.9% | 16.3% | -49.7% | 3.77% (20) | 60.0% | 30.8% | 30 |
| Momentum 6 bulan minus 1 bulan | 48 | -0.18% | -0.18% | 45.8% | -32.8% | -54.7% | 2.26% (20) | 60.0% | 39.8% | 30 |
| Momentum 3 bulan minus 1 bulan | 48 | 0.13% | 0.13% | 52.1% | -16.1% | -45.4% | 1.70% (20) | 60.0% | 55.8% | 30 |
| Volatilitas 60 sesi rendah | 48 | 0.84% | 0.84% | 56.3% | 45.9% | -15.0% | 1.88% (20) | 65.0% | 33.9% | 30 |
| Volatilitas 20 sesi rendah | 48 | 0.26% | 0.26% | 50.0% | 9.8% | -19.9% | 1.17% (20) | 55.0% | 54.1% | 30 |
| Harga di atas rata-rata 200 sesi | 48 | -0.00% | -0.00% | 47.9% | -10.8% | -40.8% | 2.11% (20) | 55.0% | 39.1% | 30 |
| Jarak dari puncak 52 minggu | 48 | 3.31% | 3.31% | 54.2% | 300.8% | -27.7% | 5.65% (20) | 65.0% | 64.1% | 30 |
| Likuiditas (log nilai transaksi 20 hari) | 48 | 0.21% | 0.21% | 52.1% | -4.6% | -38.2% | 1.65% (20) | 60.0% | 21.8% | 30 |
| Puncak imbal hasil harian 20 sesi (dibalik: hindari lotere) | 48 | 0.42% | 0.42% | 56.3% | 17.6% | -20.3% | 1.70% (20) | 65.0% | 67.5% | 30 |

Patokan (seluruh emiten likuid, timbang sama, tanpa biaya): rata-rata per periode 0.83%, total 33.4%, drawdown maks -32.6%, OOS 2.52% (20 periode).
Selisih komposit terhadap patokan setelah biaya: rata-rata per periode 0.33%, OOS 0.78%, menang 41.7%, total 3.9%.

## Kesimpulan

Faktor dengan IC positif di train **dan** OOS:
- **Volatilitas 60 sesi rendah** — IC train 0.1484, IC OOS 0.1056, t 2.26, D10−D1 1.10%
- **Volatilitas 20 sesi rendah** — IC train 0.1330, IC OOS 0.0935, t 2.41, D10−D1 0.34%
- **Jarak dari puncak 52 minggu** — IC train 0.1061, IC OOS 0.0452, t 1.37, D10−D1 2.58%
- **Puncak imbal hasil harian 20 sesi (dibalik: hindari lotere)** — IC train 0.1143, IC OOS 0.0774, t 2.09, D10−D1 0.14%

Komposit dari 9 faktor tersebut (dibentuk dari train): netto rata-rata 1.15% per 20 sesi (OOS 3.30%), menang 58.3%, drawdown maks -50.7%.

Catatan yang harus dibaca bersama angka di atas:
- Pengukuran per tanggal memperbesar jumlah sampel tetapi imbal hasil 20 sesi tumpang-tindih; itu sebabnya t-statistik
  dihitung dari tanggal non-tumpang-tindih saja.
- Portofolio di sini **long-only** dan dibandingkan dengan patokan timbang sama yang juga turut menanggung emiten yang
  sedang turun; keunggulan kecil belum berarti layak dipakai.
- Data yang tidak dipakai karena memang tidak lengkap: fundamental per emiten (hanya 200 emiten; 45–51 emiten
  untuk periode uji 2021–2025), kepemilikan asing bulanan (sejak Jan 2025), ringkasan broker (kosong).
  Tidak ada faktor karangan, dan skor produksi tidak dinaikkan menjadi portofolio karena cakupannya sebagian.
