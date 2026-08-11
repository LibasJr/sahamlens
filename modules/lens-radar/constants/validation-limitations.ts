// BATASAN YANG WAJIB IKUT DITAMPILKAN BERSAMA ANGKA VALIDASI.
//
// BUG FIX (audit kuantitatif 2026-08-11, temuan H-02): halaman Backtest sudah menyatakan
// survivorship bias-nya lewat modules/backtest/constants/backtest-limitations.ts, tetapi
// Calibration Lab dan halaman Transparency PUBLIK - dua tempat yang paling sering dibaca
// sebagai bukti kualitas model - tidak menyatakan apa pun tentang bias universe-nya.
//
// Ini bukan daftar basa-basi hukum. Dua item pertama adalah bias yang membuat angka di
// halaman itu SISTEMATIS lebih baik daripada yang bisa dicapai di dunia nyata, dan
// keduanya tidak bisa dihilangkan dengan data yang tersedia sekarang - jadi dinyatakan,
// bukan didiamkan.

/** Kapan daftar ini terakhir ditinjau manusia terhadap kondisi universe & engine. */
export const VALIDATION_LIMITATIONS_REVIEWED_ON = '2026-08-12';

export const VALIDATION_LIMITATIONS = [
  'Universe hanya emiten yang masih tercatat & likuid hari ini (survivorship bias) - saham yang delisting atau mengering likuiditasnya selama periode uji tidak pernah ikut dihitung.',
  'Universe dipilih memakai filter harga, nilai transaksi, dan volatilitas 12 bulan yang dihitung PADA saat daftar dibuat, lalu diterapkan mundur ke seluruh histori (selection bias). Emiten yang lolos hari ini belum tentu lolos pada tanggal sinyalnya.',
  'Indikator memakai AdjClose Yahoo yang dapat direstatement mundur oleh aksi korporasi. Ini bukan arsip point-in-time murni, jadi sinyal historis bisa sedikit berbeda dari yang benar-benar terlihat pada tanggal itu.',
  'Horizon T+5/T+20 memakai toleransi dua hari bursa pada bar exit, sehingga panjang trade sesungguhnya berkisar 18-22 hari bursa.',
  'Biaya round-trip dikurangkan sebagai konstanta 0,5% (fee 0,4% + slippage 0,1%), bukan biaya nyata per broker dan per ukuran order.',
  'Sinyal saling tumpang tindih antar emiten dan antar tanggal; dekorelasi hanya dilakukan per ticker per 20 hari bursa, sedangkan korelasi lintas emiten dan lintas rezim pasar masih melekat di angka.',
] as const;
