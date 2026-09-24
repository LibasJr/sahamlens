// BATASAN YANG WAJIB IKUT DITAMPILKAN BERSAMA ANGKA VALIDASI.
//
// BUG FIX (audit kuantitatif 2026-08-11, temuan H-02): halaman Backtest sudah menyatakan
// survivorship bias-nya lewat modules/backtest/constants/backtest-limitations.ts, tetapi
// Calibration Lab dan halaman Transparency PUBLIK - dua tempat yang paling sering dibaca
// sebagai bukti kualitas model - tidak menyatakan apa pun tentang bias universe-nya.
//
// AUDIT VALIDITAS INDEPENDEN 2026-09-24 (arsip 5 tahun, v1.6.1, universe likuid idx-liquid-v2-200):
// A. Survivorship bias: candidate universe dibangun dari katalog IDX yang berlaku HARI INI, sehingga
//    emiten yang delisting/bangkrut 2021-2026 absen dari seluruh arsip. Arah biasnya tidak dapat
//    diukur dari arsip ini dan tidak boleh diasumsikan netral: emiten bermasalah cenderung berakhir
//    di bucket skor rendah, jadi ketiadaannya berpotensi MENDONGKRAK return bucket rendah secara semu.
//    Klaim ini hipotesis mekanisme, bukan hasil pengukuran.
// B. Right-tail skew ekstrem: rata-rata return terdongkrak sedikit reli multi-bagger, sementara
//    median return negatif di mayoritas bucket/desil - termasuk desil teratas, yang justru paling
//    negatif (sampai -1,1% pada TRAIN) - dan win-rate di bawah 50% di hampir semua bucket/desil
//    (35-49% pada periode kalibrasi, 48-50% pada sampel yang tayang). Rata-rata tidak mencerminkan
//    ekspektasi per transaksi tipikal.
// C. Bucket imbalance & daya pisah rendah: sebaran skor sangat miring ke bawah (median skor 41);
//    bucket 80-100 hanya <2% observasi (1.157 sampel) versus 45.723 sampel di bucket <60, sehingga
//    estimasi bucket atas bervarians tinggi. Uji komponen per-indikator (SMA-trend, RSI-14, MACD,
//    Bollinger %B, momentum) atas 910.659 observasi TRAIN+OOS menunjukkan korelasi peringkat
//    mendekati nol (|Spearman| < 0,03) dan excess return versus pasar per bucket praktis nol
//    (-0,6% s/d +0,3% pada T+20), jadi skor belum terbukti punya daya pisah per transaksi.

/** Kapan daftar ini terakhir ditinjau manusia terhadap kondisi universe & engine. */
export const VALIDATION_LIMITATIONS_REVIEWED_ON = '2026-09-24';

export const VALIDATION_LIMITATIONS = [
  'Candidate universe historis memakai katalog IDX yang tersedia saat ini (idx_emiten_900.csv). Emiten yang delisting/kebangkrutan antara 2021-2026 tidak tercover di katalog sumber, sehingga arsip validasi hanya berisi survivor (survivorship bias). Arah bias tidak diukur di sini dan tidak diasumsikan netral: emiten bermasalah cenderung berakhir di bucket skor rendah, jadi ketiadaannya berpotensi mendongkrak rata-rata return bucket rendah secara semu.',
  'Distribusi return cross-section sangat right-skewed (didominasi sedikit emiten dengan reli multi-bagger). Rata-rata return dapat tampak positif sementara median return negatif di mayoritas bucket/desil - termasuk desil teratas, yang justru paling negatif - dan win-rate di bawah 50% di hampir semua bucket/desil, sehingga rata-rata tidak mencerminkan ekspektasi per transaksi tipikal.',
  'Daya pisah skor belum terbukti: korelasi peringkat (Spearman) bulan-ke-bulan antara skor/komponen dengan return T+20 dan T+60 mendekati nol, dan pada periode out-of-sample cenderung negatif. Excess return versus pasar per bucket praktis nol. Skor saat ini lebih tepat dibaca sebagai penyaring sebaran/risiko, bukan peramal arah harga.',
  'Ketidakseimbangan sebaran sampel (bucket imbalance): populasi skor sangat miring ke bawah (median skor 41). Bucket 80-100 mencakup kurang dari 2% observasi sehingga estimasi return bucket atas memiliki varians estimasi yang tinggi.',
  'Selection bias dari filter likuiditas/volatilitas masa kini sudah dihapus: setiap baris validasi wajib universe_eligible=true berdasarkan data sampai tanggal sinyal. Histori lama tanpa metadata PIT ditolak fail-closed sampai dibackfill ulang.',
  'Indikator memakai AdjClose Yahoo yang dapat direstatement mundur oleh aksi korporasi. Ini bukan arsip point-in-time murni, jadi sinyal historis bisa sedikit berbeda dari yang benar-benar terlihat pada tanggal itu.',
  'Horizon T+5/T+20 memakai toleransi dua hari bursa pada bar exit, sehingga panjang trade sesungguhnya berkisar 18-22 hari bursa.',
  'Biaya round-trip dikurangkan sebagai konstanta 0,5% (fee 0,4% + slippage 0,1%), bukan biaya nyata per broker dan per ukuran order.',
  'Sinyal saling tumpang tindih antar emiten dan antar tanggal; dekorelasi hanya dilakukan per ticker per 20 hari bursa, sedangkan korelasi lintas emiten dan lintas rezim pasar masih melekat di angka.',
] as const;