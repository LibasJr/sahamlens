# SahamLens - Independent Quant & Data Integrity Audit

Tanggal: 2026-08-05

Status: data sekarang layak ditampilkan sebagai scanner dan alat analisis, tetapi rekomendasi BUY/HOLD/SELL tetap ditahan sampai validasi model point-in-time selesai.

## Temuan yang ditutup

| Prioritas | Temuan | Perbaikan |
|---|---|---|
| Kritis | LensScore yang belum dibuktikan out-of-sample dapat berubah menjadi rekomendasi transaksi. | Status validasi model dipusatkan di `modules/validation`. `decision.action` kini `null` dan AI Pick tidak menerbitkan daftar aksi sampai ada artefak backtest yang dapat diaudit. |
| Kritis | Harga portofolio bisa memakai nilai dari client saat data pasar gagal diverifikasi. | `price-guard` fail-closed bila harga Yahoo tidak tersedia atau menyimpang tidak wajar. |
| Tinggi | Chart publik, flow, stock detail, market summary, scanner, recommendation, dan AI Pick dapat mengubah candle tidak lengkap menjadi OHLC/volume palsu. | Bar Yahoo harus memiliki timestamp dan OHLCV valid; close positif, high >= low, volume >= 0. Bar rusak dibuang, bukan diisi dari close atau 0. |
| Tinggi | `regularMarketPrice`, previous close, volume, EPS/BVPS/ROE/DCF input, dan market cap hilang masih dapat menjadi 0. | Field pasar/fundamental kini `null` atau route gagal jujur bila data wajib tidak ada. Rasio volume dan valuasi dilewati bila input tidak valid. |
| Tinggi | AI Pick, Council, Recommendation, Screener, dan Stock Detail memakai volume ratio netral saat volume rata-rata tidak tersedia. | `volRatio` menjadi `null`; scoring engine menurunkan coverage dan mengeluarkan komponen yang tidak punya data. |
| Sedang | `PortfolioHealth` memakai mapping sektor mock, lot default demo, dan saran saham spesifik. | Komponen hanya menghitung posisi dengan harga beli, harga live, dan lot nyata; risiko yang ditampilkan adalah konsentrasi posisi per saham, bukan sektor tiruan. |
| Sedang | Watchlist dan tampilan IHSG/fundamental dapat menampilkan perubahan harga 0% saat `changePercent` tidak tersedia. | UI sekarang menampilkan `N/A`/kosong untuk harga atau perubahan yang tidak valid. |
| Sedang | Intrinsic/DCF valuation memakai beberapa fallback 0 dan default growth saat data fundamental hilang. | Harga/ROE/FCF/share/currency wajib valid; model DCF tidak dihitung bila input utama tidak tersedia. |
| Sedang | Support/resistance dan Breakout Radar memakai range 20 hari sebagai seolah-olah struktur pasar dan risk/reward. | Setup long kini dihitung dari swing support/resistance + ATR. Breakout hanya tampil bila RR >= 1.5; TP/CL simetris di AI Pick dihapus. |
| Sedang | Skor breakout menghitung volume dua kali (`VOL SPIKE` + `BANDAR AKUM`) dan RSI hanya menerima pita sempit 52-60. | Volume spike hanya menyumbang satu komponen; flow confirmation menjadi label tanpa poin tambahan; RSI momentum diperluas ke zona momentum 55-<70. |
| Sedang | `estimateFullDayVolume()` menganggap volume intraday linear. | Estimasi live memakai profil kumulatif U-shape konservatif untuk IDX, sehingga volume pembukaan tidak dibesar-besarkan oleh asumsi linear. |
| Sedang | Screener profil agresif menamai `vol_ratio` sebagai momentum. | Momentum screener kini direction-aware: volume akumulasi menaikkan skor, volume distribusi menurunkan skor. |
| Sedang | Screener memakai label "Moat Rating" untuk snapshot ROE + gross margin. | Label diubah menjadi "Kualitas Profit"; halaman moat eksplisit tidak mengarang rating moat kualitatif. |
| Sedang | Market summary belum memiliki relative strength dan market regime. | Ditambahkan `marketRegime` IHSG dan `topRelativeStrength` 5D vs IHSG; daily-picks ikut mengekspos kategori relative strength. |
| Sedang | Confidence rekomendasi belum terkalibrasi tetapi ditampilkan seperti tingkat keyakinan. | API rekomendasi menandai `confidenceCalibrated:false` dan UI menulisnya sebagai vote konsensus, bukan probabilitas sukses. |
| Sedang | Tidak ada Data Quality Score berbasis identitas fundamental. | Ditambahkan `scoreFundamentalDataQuality()` dan endpoint fundamental mengirim `dataQuality` dengan check PER/PBV/ROE identity. |
| Rendah | `riskScore` UI jenuh ke nol pada ATR 6,7%/hari. | Skor risiko volatilitas memakai kurva non-linear agar saham volatil tetap bisa dibedakan. |
| Rendah | Compare Tool menyebut posisi harga dalam range 20 hari sebagai Risk/Reward. | Label diganti menjadi ruang naik/turun 20D dan narasi menegaskan itu bukan setup trading. |
| Rendah | Batasan backtest belum menyebut restatement AdjClose. | `BACKTEST_LIMITATIONS` kini menyebut risiko corporate-action restatement pada sinyal historis berbasis AdjClose. |
| Rendah | File `data/portfolios.json` berisi contoh portofolio dan identifier lokal. | File dummy/PII lokal dihapus. |

## Prinsip yang dipertahankan

- Yahoo Finance adalah sumber pihak ketiga; kegagalan provider harus menjadi `null`/error, bukan angka pengganti.
- CMF/arus dana adalah proxy dari OHLCV, bukan data broker summary atau net foreign resmi IDX.
- Nilai wajar DCF/multiple adalah keluaran model berasumsi, bukan target harga analis.
- LensScore belum boleh disebut akurat atau prediktif sebelum backtest point-in-time, biaya transaksi, slippage, survivorship handling, walk-forward, dan out-of-sample validation selesai.

## Verifikasi

- `npm.cmd run typecheck` lulus.
- `npm.cmd test` lulus: 51 file, 423 test.
- `npm.cmd run build` lulus.
- `git diff --check` bersih.

## Syarat aktivasi rekomendasi

Jangan mengubah `validated` menjadi `true` hanya karena skor terlihat masuk akal. Lampirkan artefak backtest yang dapat direproduksi, dengan kriteria lulus yang ditetapkan sebelum melihat hasil: bucket monotonicity, rank IC, hit-rate/return bersih setelah biaya, drawdown, walk-forward, dan out-of-sample. Setelah itu status di `modules/validation/service/lens-score-validation.service.ts` baru boleh diubah bersama test regresinya.
