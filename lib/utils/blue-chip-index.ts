// BARU (2026-08-16, bug report pengguna: PACK.JK berlabel "Blue-chip" padahal saham
// kecil yang sedang naik +8%/hari dengan data BASI). Menggantikan pendekatan lama di
// cap-tier.ts yang murni market cap + ADV20 REAL-TIME - dua angka itu justru paling
// gampang digelembungkan saat terjadi pump/gorengan (harga naik -> market cap naik
// instan; volume naik beberapa hari -> ADV20 rata-rata 20 hari ikut naik). Akibatnya
// badge "Blue-chip" (yang menyiratkan aman/stabil) malah paling rawan salah nempel
// justru saat sedang terjadi gorengan - kebalikan dari tujuannya.
//
// Perbaikan: "Blue-chip" sekarang HANYA berarti "konstituen indeks LQ45 IDX saat ini".
// Keanggotaan indeks tidak berubah harian - IDX menetapkannya lewat evaluasi berkala,
// jadi tidak bisa dimanipulasi oleh pergerakan harga/volume satu-dua minggu.
//
// >>> WAJIB DIVERIFIKASI MANUAL, BUKAN FEED LIVE <<<
// IDX mengevaluasi ulang konstituen LQ45 DUA KALI SETAHUN - efektif akhir Januari/awal
// Februari, dan akhir Juli/awal Agustus (jadwal pasti ada di kalender resmi IDX). Daftar
// di bawah disusun dari pengetahuan pelatihan model (cutoff Januari 2026) dan BELUM
// dicocokkan langsung ke pengumuman resmi terbaru (idx.co.id -> Data Pasar -> Indeks ->
// LQ45 -> Konstituen). Karena hari ini (dicatat 2026-08-16) sudah lewat jadwal evaluasi
// akhir Juli/awal Agustus, ADA KEMUNGKINAN daftar ini sudah satu periode basi - cek dan
// perbarui manual sebelum terlalu percaya pada daftar ini untuk periode berjalan.
//
// Risiko kalau daftar ini telat diperbarui SEPIHAK dan kecil: emiten yang baru saja
// keluar dari LQ45 mungkin masih tampil Blue-chip beberapa waktu (dampak kosmetik
// ringan). TIDAK ADA jalan bagi saham gorengan untuk lolos hanya karena harga/volume
// hari ini melonjak - itu celah yang justru sedang ditutup oleh perubahan ini.
export const LQ45_CONSTITUENTS: readonly string[] = [
  'ACES.JK', 'ADRO.JK', 'AKRA.JK', 'AMMN.JK', 'AMRT.JK', 'ANTM.JK', 'ARTO.JK', 'ASII.JK',
  'BBCA.JK', 'BBNI.JK', 'BBRI.JK', 'BBTN.JK', 'BMRI.JK', 'BRPT.JK', 'BUKA.JK', 'CPIN.JK',
  'CTRA.JK', 'ESSA.JK', 'EXCL.JK', 'GOTO.JK', 'ICBP.JK', 'INCO.JK', 'INDF.JK', 'INDY.JK',
  'INKP.JK', 'ISAT.JK', 'ITMG.JK', 'JPFA.JK', 'JSMR.JK', 'KLBF.JK', 'MAPI.JK', 'MBMA.JK',
  'MDKA.JK', 'MEDC.JK', 'PGAS.JK', 'PGEO.JK', 'PTBA.JK', 'PWON.JK', 'SIDO.JK', 'SMGR.JK',
  'SMRA.JK', 'SRTG.JK', 'TLKM.JK', 'TOWR.JK', 'UNTR.JK', 'UNVR.JK',
];

/** Normalisasi lalu cek keanggotaan LQ45 - menerima ticker dengan atau tanpa suffix `.JK`,
 * huruf besar/kecil apa pun. */
export function isBlueChipConstituent(ticker: string | null | undefined): boolean {
  if (!ticker) return false;
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) return false;
  const withSuffix = normalized.endsWith('.JK') ? normalized : `${normalized}.JK`;
  return LQ45_CONSTITUENTS.includes(withSuffix);
}
