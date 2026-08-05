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
 * Ambang: PER < 8 DAN ROE > 25%. Keduanya sengaja longgar - yang ditangkap hanya kasus
 * yang tanda tangannya jelas, bukan setiap emiten komoditas berlaba baik.
 *
 * [HIPOTESIS] Ambang 8x & 25% belum diuji terhadap data historis siklus batu bara/nikel
 * IDX. Konsekuensi salah tangkap dibuat ringan secara sengaja: valuasi diturunkan ke
 * "wajar", tidak dijadikan negatif.
 */
export function isPeakCycleSignature(profile: SectorProfile, per: number | null, roe: number | null): boolean {
  if (!profile.cyclical) return false;
  if (per == null || roe == null) return false;
  return per > 0 && per < 8 && roe > 25;
}
