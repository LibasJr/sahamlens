// KLASIFIKASI SEKTOR + PROFIL PERLAKUAN PER SEKTOR
//
// Dibuat untuk menutup temuan P1-10 & P1-11 (review kuantitatif 2026-08-05): mesin skor
// utama `calculateScore()` memakai SATU set ambang fundamental untuk seluruh emiten IDX,
// yang salah secara sistematis ke dua arah sekaligus:
//
//   - Bank & multifinance: DER "sehat" menurut model bisnisnya adalah 5-8x. Ambang lama
//     (DER >= 2.0 -> 0 dari 5) memberi mereka nilai terburuk BUKAN karena neracanya
//     bermasalah, melainkan karena mereka bank. Lebih buruk lagi: kalau Yahoo kebetulan
//     TIDAK mengembalikan DER, komponennya dikeluarkan (NA) sehingga bank yang datanya
//     hilang justru dinilai lebih baik daripada bank yang datanya lengkap.
//   - Current Ratio tidak punya makna untuk bank sama sekali (tidak ada pemisahan aset
//     lancar/tidak lancar dalam pengertian yang sama).
//   - Emiten siklikal komoditas (batu bara, nikel, CPO) hampir selalu ber-PER 3-8x TEPAT
//     di puncak siklus laba. Ambang "PER < 10 = murah" memberi mereka nilai valuasi
//     maksimum persis saat risikonya paling tinggi - jebakan nilai klasik.
//
// Sumber klasifikasi: Yahoo `assetProfile.sector` (+ `industry` untuk membedakan bank
// dari lembaga keuangan lain). IDX-IC resmi (11 sektor BEI) TIDAK tersedia sebagai feed
// gratis, jadi pemetaan di bawah adalah pendekatan taksonomi Yahoo -> kelompok perlakuan,
// bukan klaim bahwa ini IDX-IC. Emiten yang tidak bisa dipetakan menjadi 'UNCLASSIFIED'
// dan mendapat perlakuan netral (bukan ditebak masuk sektor tertentu).

export type SectorClass =
  | 'FINANCIALS'
  | 'ENERGY'
  | 'BASIC_MATERIALS'
  | 'CONSUMER_NON_CYCLICAL'
  | 'CONSUMER_CYCLICAL'
  | 'HEALTHCARE'
  | 'TECHNOLOGY'
  | 'INFRASTRUCTURE'
  | 'PROPERTY'
  | 'INDUSTRIALS'
  | 'TRANSPORTATION'
  | 'UNCLASSIFIED';

export interface SectorProfile {
  cls: SectorClass;
  label: string;
  /** Debt-to-Equity punya makna penilaian di sektor ini?
   *
   * `false` untuk lembaga keuangan: leverage ADALAH model bisnisnya (menghimpun dana
   * lalu menyalurkannya), bukan tanda tekanan neraca. Komponen DER dikeluarkan dari
   * skor dan bobotnya direnormalisasi - BUKAN diberi 0, dan BUKAN pula diberi nilai
   * penuh. Ketiadaan makna bukan kabar baik maupun buruk. */
  derApplicable: boolean;
  /** Batas DER `[konservatif, sehat, agakTinggi]` - di atas batas ketiga dinilai
   * berisiko tinggi. Sektor padat modal (properti, infrastruktur, konstruksi) memakai
   * batas lebih lebar karena struktur pendanaan proyek jangka panjang adalah norma
   * industrinya, bukan penyimpangan.
   *
   * [HIPOTESIS] Angka-angka ini belum divalidasi terhadap data default/restrukturisasi
   * emiten IDX. Yang sudah pasti benar adalah bahwa satu set batas untuk semua sektor
   * SALAH; batas per sektor di bawah adalah perbaikan arah, bukan kalibrasi. */
  derBands: readonly [number, number, number];
  /** Current Ratio punya makna di sektor ini? `false` untuk lembaga keuangan. */
  currentRatioApplicable: boolean;
  /** Sektor komoditas siklikal: laba TTM tidak mewakili daya laba normal, sehingga
   * PER/earnings yield dari laba puncak siklus menyesatkan. Lihat `isPeakCycleSignature`. */
  cyclical: boolean;
  /** Beta acuan sektor, dipakai HANYA kalau beta emiten tidak bisa dihitung (histori
   * kurang / benchmark tidak tersedia). Ditandai sebagai asumsi di keluaran valuasi.
   *
   * [HIPOTESIS] Belum diestimasi dari regresi lintas emiten IDX. */
  defaultBeta: number;
}

const PROFILES: Record<SectorClass, Omit<SectorProfile, 'cls'>> = {
  FINANCIALS: {
    label: 'Keuangan & Perbankan',
    derApplicable: false,
    derBands: [0.5, 1.0, 2.0],
    currentRatioApplicable: false,
    cyclical: false,
    defaultBeta: 1.1,
  },
  ENERGY: {
    label: 'Energi',
    derApplicable: true,
    derBands: [0.5, 1.0, 2.0],
    currentRatioApplicable: true,
    cyclical: true,
    defaultBeta: 1.2,
  },
  BASIC_MATERIALS: {
    label: 'Barang Baku',
    derApplicable: true,
    derBands: [0.5, 1.2, 2.2],
    currentRatioApplicable: true,
    cyclical: true,
    defaultBeta: 1.2,
  },
  CONSUMER_NON_CYCLICAL: {
    label: 'Konsumen Primer',
    derApplicable: true,
    derBands: [0.4, 0.9, 1.8],
    currentRatioApplicable: true,
    cyclical: false,
    defaultBeta: 0.8,
  },
  CONSUMER_CYCLICAL: {
    label: 'Konsumen Sekunder',
    derApplicable: true,
    derBands: [0.5, 1.1, 2.0],
    currentRatioApplicable: true,
    cyclical: false,
    defaultBeta: 1.0,
  },
  HEALTHCARE: {
    label: 'Kesehatan',
    derApplicable: true,
    derBands: [0.4, 0.9, 1.8],
    currentRatioApplicable: true,
    cyclical: false,
    defaultBeta: 0.8,
  },
  TECHNOLOGY: {
    label: 'Teknologi',
    derApplicable: true,
    derBands: [0.4, 1.0, 2.0],
    currentRatioApplicable: true,
    cyclical: false,
    defaultBeta: 1.3,
  },
  INFRASTRUCTURE: {
    // Telekomunikasi, menara, jalan tol, utilitas - arus kas relatif stabil dan
    // dapat diprediksi, sehingga leverage lebih tinggi dapat ditanggung.
    label: 'Infrastruktur & Utilitas',
    derApplicable: true,
    derBands: [0.8, 1.8, 3.0],
    currentRatioApplicable: true,
    cyclical: false,
    defaultBeta: 0.9,
  },
  PROPERTY: {
    // DER 1.5-2.5x adalah norma industri properti & konstruksi IDX.
    label: 'Properti & Real Estat',
    derApplicable: true,
    derBands: [0.8, 1.8, 3.0],
    currentRatioApplicable: true,
    cyclical: false,
    defaultBeta: 1.2,
  },
  INDUSTRIALS: {
    label: 'Perindustrian',
    derApplicable: true,
    derBands: [0.6, 1.3, 2.2],
    currentRatioApplicable: true,
    cyclical: false,
    defaultBeta: 1.0,
  },
  TRANSPORTATION: {
    label: 'Transportasi & Logistik',
    derApplicable: true,
    derBands: [0.7, 1.5, 2.5],
    currentRatioApplicable: true,
    cyclical: false,
    defaultBeta: 1.1,
  },
  UNCLASSIFIED: {
    // Perlakuan netral: batas menengah dari seluruh sektor di atas. Dipakai kalau
    // sektor tidak diketahui - menebak sektor lebih berbahaya daripada mengakui
    // tidak tahu, karena kesalahan tebakan menggeser penilaian ke arah yang salah.
    label: 'Tidak Terklasifikasi',
    derApplicable: true,
    derBands: [0.5, 1.2, 2.2],
    currentRatioApplicable: true,
    cyclical: false,
    defaultBeta: 1.0,
  },
};

/** Kata kunci industri yang menandakan lembaga keuangan meski `sector` Yahoo-nya bukan
 * "Financial Services" (mis. beberapa emiten multifinance terklasifikasi Industrials). */
const FINANCIAL_INDUSTRY_HINTS = [
  'bank', 'insurance', 'asuransi', 'capital markets', 'credit services',
  'financial conglomerates', 'mortgage', 'asset management',
];

function normalize(s: string | null | undefined): string {
  return typeof s === 'string' ? s.toLowerCase().trim() : '';
}

/**
 * Petakan sektor Yahoo (+ industri opsional) ke kelompok perlakuan.
 *
 * Urutan pemeriksaan penting: petunjuk INDUSTRI keuangan diperiksa lebih dulu daripada
 * sektor, karena salah mengklasifikasikan bank sebagai non-bank adalah kesalahan yang
 * paling mahal di sini (DER bank 6x akan dinilai "berisiko tinggi").
 */
export function classifySector(yahooSector: string | null | undefined, yahooIndustry?: string | null): SectorClass {
  const sector = normalize(yahooSector);
  const industry = normalize(yahooIndustry);

  if (FINANCIAL_INDUSTRY_HINTS.some((h) => industry.includes(h))) return 'FINANCIALS';
  if (!sector) return 'UNCLASSIFIED';

  if (sector.includes('financial') || sector.includes('bank')) return 'FINANCIALS';
  if (sector.includes('energy')) return 'ENERGY';
  if (sector.includes('basic material')) return 'BASIC_MATERIALS';
  if (sector.includes('consumer defensive') || sector.includes('consumer non')) return 'CONSUMER_NON_CYCLICAL';
  if (sector.includes('consumer cyclical') || sector.includes('consumer discretionary')) return 'CONSUMER_CYCLICAL';
  if (sector.includes('healthcare') || sector.includes('health care')) return 'HEALTHCARE';
  if (sector.includes('technology')) return 'TECHNOLOGY';
  if (sector.includes('communication') || sector.includes('utilit')) return 'INFRASTRUCTURE';
  if (sector.includes('real estate') || sector.includes('property')) return 'PROPERTY';
  if (sector.includes('industrial')) return 'INDUSTRIALS';
  if (sector.includes('transport') || sector.includes('logistic')) return 'TRANSPORTATION';

  return 'UNCLASSIFIED';
}

export function getSectorProfile(cls: SectorClass): SectorProfile {
  return { cls, ...PROFILES[cls] };
}

/** Jalan pintas: klasifikasi + profil dalam satu panggilan. */
export function resolveSectorProfile(yahooSector: string | null | undefined, yahooIndustry?: string | null): SectorProfile {
  return getSectorProfile(classifySector(yahooSector, yahooIndustry));
}

/**
 * Tanda tangan "puncak siklus" untuk emiten komoditas: PER sangat rendah BERSAMAAN
 * dengan ROE sangat tinggi.
 *
 * Alasan ekonominya: harga komoditas naik -> laba melonjak -> ROE melonjak dan PER
 * (harga/laba) anjlok karena penyebutnya membengkak. Pasar TIDAK menghargai laba itu
 * dengan pengganda normal justru karena tahu laba tersebut tidak berkelanjutan. Membaca
 * PER 4x itu sebagai "murah" adalah kesalahan membaca sinyal pasar, bukan menemukan
 * peluang yang terlewat.
 *
 * PERBAIKAN Fase 4 #16 (audit kuantitatif 2026-08-11): sampai perbaikan ini, penjaganya
 * adalah SATU ambang biner - `per < 8 && roe > 25` - dengan konsekuensi penuh di satu
 * sisi dan nol di sisi lain. Emiten dengan PER 7,9 dan ROE 25,1 dipotong valuasinya ke 40%;
 * emiten dengan PER 8,1 dan ROE 24,9 tidak dipotong sama sekali. Selisih fundamental antara
 * keduanya nyaris nol, selisih perlakuannya maksimal. Tebing seperti itu tidak punya
 * pembenaran ekonomi, dan ia menghukum ketepatan data yang tidak dimiliki siapa pun -
 * PER dan ROE dari Yahoo sendiri punya galat lebih besar dari lebar tebingnya.
 *
 * Sekarang keparahannya kontinu: dua ramp linier yang di-AND-kan lewat `min`, karena kedua
 * syarat memang harus berlaku bersamaan.
 *
 *     PER  <= 4  -> 1,0      PER  >= 12 -> 0,0     (linier di antaranya)
 *     ROE  >= 32 -> 1,0      ROE  <= 18 -> 0,0
 *
 * Di titik ambang lama (PER 8, ROE 25) keparahannya 0,5 - dipotong sebagian, bukan
 * dipotong penuh maupun dibiarkan. Kasus yang tanda tangannya ekstrem tetap dipotong sama
 * dalamnya seperti sebelumnya.
 *
 * NORMALIZED EARNINGS BELUM DIPAKAI. Perbaikan yang benar-benar tepat adalah menilai
 * siklikal dengan laba rata-rata sepanjang siklus, bukan laba TTM. Itu butuh laba tahunan
 * 7-10 tahun ke belakang; aplikasi ini tidak punya sumber datanya (Yahoo memberi 4 periode
 * tahunan, terlalu pendek untuk satu siklus batu bara/nikel) dan `fundamental_history`
 * sendiri baru terisi sejak cron harian mulai berjalan. Perbaikan ini menghilangkan
 * tebingnya, bukan menggantikan normalized earnings.
 *
 * [HIPOTESIS] Keempat titik ramp belum diuji terhadap data historis siklus IDX. Yang sudah
 * pasti benar adalah bahwa satu tebing tunggal SALAH; ramp di bawah adalah perbaikan arah,
 * bukan kalibrasi. Konsekuensi salah tangkap tetap dibuat ringan secara sengaja: valuasi
 * diturunkan, tidak dijadikan negatif.
 */
const PEAK_CYCLE_PER_FULL = 4;
const PEAK_CYCLE_PER_NONE = 12;
const PEAK_CYCLE_ROE_NONE = 18;
const PEAK_CYCLE_ROE_FULL = 32;

function ramp(value: number, zeroAt: number, oneAt: number): number {
  if (zeroAt === oneAt) return value >= oneAt ? 1 : 0;
  const t = (value - zeroAt) / (oneAt - zeroAt);
  return Math.min(1, Math.max(0, t));
}

/**
 * Rasio ROE berjalan terhadap ROE normal emiten itu sendiri, diubah menjadi keparahan 0..1.
 *
 * Ini pengukuran, bukan dugaan: `normalizedRoePct` adalah median ROE 4 tahun buku terakhir
 * (lihat modules/fundamental/service/normalized-earnings.service.ts). Rasio 1,0 berarti
 * emiten sedang mencetak laba sebesar normalnya sendiri.
 *
 *     rasio <= 1,15 -> 0,0     selisih sebesar ini adalah derau tahunan biasa, bukan puncak
 *     rasio >= 2,00 -> 1,0     mencetak dua kali daya laba normalnya sendiri
 *
 * `null` kalau tidak bisa dihitung - pemanggil jatuh ke tanda tangan PER/ROE.
 */
export const EARNINGS_ABOVE_NORMAL_NONE = 1.15;
export const EARNINGS_ABOVE_NORMAL_FULL = 2.0;

export function earningsAboveNormalSeverity(
  currentRoePct: number | null,
  normalizedRoePct: number | null,
): number | null {
  if (currentRoePct == null || !Number.isFinite(currentRoePct)) return null;
  // ROE normal <= 0 membuat rasionya tidak bermakna: pembagian dengan nol, atau tanda yang
  // terbalik pada emiten yang normalnya memang rugi.
  if (normalizedRoePct == null || !Number.isFinite(normalizedRoePct) || normalizedRoePct <= 0) return null;
  return ramp(currentRoePct / normalizedRoePct, EARNINGS_ABOVE_NORMAL_NONE, EARNINGS_ABOVE_NORMAL_FULL);
}

/**
 * Keparahan tanda tangan puncak siklus, 0..1. 0 berarti tidak ada tanda tangan sama sekali.
 *
 * DUA LAPISAN, DIAMBIL YANG TERBESAR - dan itu disengaja, keduanya menangkap kegagalan yang
 * berbeda:
 *
 *   PER + ROE (dugaan)        menangkap keadaan "seluruh jendela adalah tahun boom", saat
 *                             ROE normal ikut tinggi sehingga rasionya tampak wajar. Juga
 *                             satu-satunya lapisan yang tersedia kalau data tahunan kurang.
 *   ROE vs normal (ukuran)    menangkap "tahun ini jauh di atas normal emiten ini sendiri",
 *                             yang tidak bisa disimpulkan dari PER dan ROE saja.
 *
 * `max` dipilih karena konsekuensi kedua lapisan hanya satu arah - valuasi diturunkan,
 * tidak pernah dijadikan negatif - sehingga salah tangkap berbiaya ringan sementara luput
 * berbiaya mahal.
 */
export function peakCycleSeverity(
  profile: SectorProfile,
  per: number | null,
  roe: number | null,
  normalizedRoePct: number | null = null,
): number {
  if (!profile.cyclical) return 0;

  let heuristic = 0;
  if (per != null && roe != null && per > 0) {
    const perSeverity = ramp(per, PEAK_CYCLE_PER_NONE, PEAK_CYCLE_PER_FULL);
    const roeSeverity = ramp(roe, PEAK_CYCLE_ROE_NONE, PEAK_CYCLE_ROE_FULL);
    // `min` = konjungsi: PER murah SAJA bukan tanda puncak siklus, begitu pula ROE tinggi saja.
    heuristic = Math.min(perSeverity, roeSeverity);
  }

  const measured = earningsAboveNormalSeverity(roe, normalizedRoePct) ?? 0;
  return Math.max(heuristic, measured);
}

/** Ada tanda tangan puncak siklus sama sekali? Dipertahankan untuk pemanggil yang hanya
 * butuh ya/tidak; besarannya ada di `peakCycleSeverity`. */
export function isPeakCycleSignature(profile: SectorProfile, per: number | null, roe: number | null): boolean {
  return peakCycleSeverity(profile, per, roe) > 0;
}
