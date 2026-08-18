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
// KONSOLIDASI 2026-08-18: daftar konstituen TIDAK LAGI ditulis di berkas ini.
//
// Sebelumnya ada dua daftar LQ45 yang hidup berdampingan dan sudah menyimpang 21 ticker:
// daftar di sini (46 entri - mustahil, LQ45 beranggotakan tepat 45) dan
// CURRENT_LQ45_UNIVERSE di modules/market/constants/lq45-universe.ts. Keduanya dibaca
// pihak yang berbeda: badge Blue-chip memakai yang ini, sementara overlay EOD IDX dan
// scripts/sync-idx-foreign-flow.py memakai yang satunya. Akibatnya sepuluh emiten masuk
// universe overlay tanpa pernah disinkronkan artefaknya.
//
// Sekarang satu sumber saja. Isi daftar lama berasal dari pengetahuan pelatihan model
// (diakui sendiri di komentar versi sebelumnya) dan jumlahnya salah, jadi yang
// dipertahankan adalah lq45-universe.ts yang setidaknya mencantumkan periode berlaku dan
// nomor pengumuman.
//
// >>> MASIH WAJIB DIVERIFIKASI MANUAL <<<
// Sampai 2026-08-18 daftar yang tersisa itu pun BELUM pernah dicocokkan ke pengumuman
// resmi IDX. API publik IDX tidak menyediakan konstituen periode berjalan (arsip
// GetIndexConstituent berhenti di 2018), jadi verifikasinya harus lewat pengumuman
// Peng-00148/BEI.POP/07-2026 atau idx.co.id -> Data Pasar -> Indeks Saham -> LQ45.
// JANGAN memakai "List Emiten LQ45.csv" dari scrapper pihak ketiga - berkas itu
// bertanggal 2021 dan hanya tampak segar karena nama emitennya ikut ter-update.
import {
  CURRENT_LQ45_EFFECTIVE_FROM,
  CURRENT_LQ45_EFFECTIVE_TO,
  CURRENT_LQ45_UNIVERSE,
  isCurrentLq45Ticker,
} from '@/modules/market/constants/lq45-universe';

/** Batas berlaku konstituen periode ini. Test menolak daftar yang sudah lewat tanggal ini. */
export const LQ45_REVIEWED_UNTIL = CURRENT_LQ45_EFFECTIVE_TO;
export const LQ45_EFFECTIVE_FROM = CURRENT_LQ45_EFFECTIVE_FROM;

/**
 * BUG FIX (audit kuantitatif 2026-08-19, temuan H-04): tooltip lencana di Dashboard dan
 * LensFundamental berbunyi "Konstituen resmi indeks LQ45 Bursa Efek Indonesia (IDX)" -
 * asersi status resmi atas daftar yang komentar di atas nyatakan sendiri BELUM pernah
 * dicocokkan ke pengumuman IDX. Sampai verifikasi manual itu dilakukan, UI wajib memakai
 * teks di bawah, yang menyatakan periode berlakunya dan keterbatasannya apa adanya.
 *
 * Setelah daftar diverifikasi terhadap Peng-00148/BEI.POP/07-2026, ganti nilai
 * `LQ45_VERIFICATION_STATUS` menjadi 'VERIFIED_AGAINST_IDX_ANNOUNCEMENT' dan naikkan
 * kembali bahasanya - dalam commit yang sama dengan bukti verifikasinya.
 */
export const LQ45_VERIFICATION_STATUS = 'UNVERIFIED_INTERNAL_SNAPSHOT' as const;

/** Teks tooltip lencana LQ45. Satu sumber supaya kedua halaman tidak menyimpang. */
export const LQ45_BADGE_TITLE =
  `Tercantum di daftar LQ45 periode ${CURRENT_LQ45_EFFECTIVE_FROM} s/d ${CURRENT_LQ45_EFFECTIVE_TO} ` +
  'yang dipelihara SahamLens. Snapshot internal, belum dicocokkan ke pengumuman resmi IDX.';

export const LQ45_CONSTITUENTS: readonly string[] = CURRENT_LQ45_UNIVERSE;

/** Normalisasi lalu cek keanggotaan LQ45 - menerima ticker dengan atau tanpa suffix `.JK`,
 * huruf besar/kecil apa pun. */
export function isBlueChipConstituent(ticker: string | null | undefined): boolean {
  if (!ticker) return false;
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) return false;
  return isCurrentLq45Ticker(normalized);
}
