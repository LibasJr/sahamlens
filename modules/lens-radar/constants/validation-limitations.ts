// BATASAN YANG WAJIB IKUT DITAMPILKAN BERSAMA ANGKA VALIDASI.
//
// BUG FIX (audit kuantitatif 2026-08-11, temuan H-02): halaman Backtest sudah menyatakan
// survivorship bias-nya lewat modules/backtest/constants/backtest-limitations.ts, tetapi
// Calibration Lab dan halaman Transparency PUBLIK - dua tempat yang paling sering dibaca
// sebagai bukti kualitas model - tidak menyatakan apa pun tentang bias universe-nya.
//
// Ini bukan daftar basa-basi hukum. H-02 selection bias karena filter universe masa kini
// sudah ditutup dengan membership point-in-time; residual survivorship dari emiten yang
// telah delisting tetap tidak bisa direkonstruksi tanpa historical listing master resmi.
// Keterbatasan yang tersisa tetap dinyatakan bersama hasil, bukan didiamkan.

/** Kapan daftar ini terakhir ditinjau manusia terhadap kondisi universe & engine. */
export const VALIDATION_LIMITATIONS_REVIEWED_ON = '2026-08-17';

export const VALIDATION_LIMITATIONS = [
  'Candidate universe historis memakai katalog IDX luas yang tersedia sekarang. Membership likuiditas/volatilitas dihitung point-in-time per tanggal, tetapi emiten yang sudah delisting dan tidak lagi ada di katalog sumber masih dapat hilang (residual survivorship bias).',
  'Selection bias dari filter likuiditas/volatilitas masa kini sudah dihapus: setiap baris validasi wajib universe_eligible=true berdasarkan data sampai tanggal sinyal. Histori lama tanpa metadata PIT ditolak fail-closed sampai dibackfill ulang.',
  'Indikator memakai AdjClose Yahoo yang dapat direstatement mundur oleh aksi korporasi. Ini bukan arsip point-in-time murni, jadi sinyal historis bisa sedikit berbeda dari yang benar-benar terlihat pada tanggal itu.',
  'Horizon T+5/T+20 memakai toleransi dua hari bursa pada bar exit, sehingga panjang trade sesungguhnya berkisar 18-22 hari bursa.',
  'Biaya round-trip dikurangkan sebagai konstanta 0,5% (fee 0,4% + slippage 0,1%), bukan biaya nyata per broker dan per ukuran order.',
  'Sinyal saling tumpang tindih antar emiten dan antar tanggal; dekorelasi hanya dilakukan per ticker per 20 hari bursa, sedangkan korelasi lintas emiten dan lintas rezim pasar masih melekat di angka.',
] as const;
