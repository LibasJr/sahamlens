/**
 * Penilai keabsahan timestamp data: menolak stempel waktu MASA DEPAN.
 *
 * ===================================================================================
 * KENAPA INI ADA
 * ===================================================================================
 * Perhitungan umur data di repo ini memakai pola:
 *
 *     Math.max(0, now - timestamp)
 *
 * `Math.max(0, ...)` itu terlihat seperti kehati-hatian ("umur tidak boleh negatif"),
 * padahal ia MENGHAPUS BUKTI. Timestamp yang berada di masa depan menghasilkan
 * selisih negatif, lalu dijepit menjadi 0 - yaitu "baru saja diperbarui", nilai
 * paling segar yang mungkin.
 *
 * Akibatnya persis kebalikan dari yang diinginkan: data yang stempel waktunya
 * PALING rusak justru lolos sebagai data PALING segar, lalu boleh memicu sinyal
 * yang bisa ditindak.
 *
 * Pola yang sama muncul di penghitung hari bursa: kursor tanggal yang sudah lewat
 * `now` langsung `break`, menghasilkan "0 hari tertinggal" - juga FRESH.
 *
 * ===================================================================================
 * KENAPA MASA DEPAN ITU FAIL-CLOSED, BUKAN DIBULATKAN
 * ===================================================================================
 * Timestamp masa depan tidak pernah berarti "datanya sangat baru". Ia berarti salah
 * satu dari: jam server/penyedia salah, zona waktu tertukar, parsing keliru, atau
 * baris yang ditulis dengan tanggal salah. Semuanya adalah MASALAH KUALITAS DATA.
 *
 * Karena tidak ada yang bisa tahu yang mana, satu-satunya jawaban yang aman adalah
 * menolak - bukan menebak. Ini konsisten dengan `advisory fail-closed` di seluruh
 * SahamLens: kalau data tidak bisa dipercaya, jangan keluarkan sinyal.
 *
 * ===================================================================================
 * TOLERANSI CLOCK SKEW
 * ===================================================================================
 * Jam mesin tidak pernah sinkron sempurna. Penyedia data bisa mengecap sebuah baris
 * satu-dua detik "di depan" jam kita tanpa ada yang salah. Menolak selisih positif
 * sekecil apa pun akan membuat guard ini berisik dan akhirnya diabaikan - persis
 * kegagalan yang diperingatkan CLAUDE.md untuk penjaga yang memerah pada hal normal.
 *
 * Toleransi 2 menit cukup lebar untuk drift NTP yang wajar, dan jauh lebih sempit
 * daripada ambang kesegaran mana pun yang dipakai untuk sinyal.
 */

/** Selisih ke depan yang masih dianggap drift jam wajar, bukan data rusak. */
export const CLOCK_SKEW_TOLERANCE_MINUTES = 2;

export type TimestampValidity =
  /** Timestamp terbaca dan berada pada atau sebelum waktu server (dalam toleransi). */
  | 'VALID'
  /** String tidak bisa diurai menjadi waktu. */
  | 'UNPARSEABLE'
  /** Timestamp melewati waktu server lebih jauh dari toleransi clock skew. */
  | 'FUTURE';

export interface TimestampAssessment {
  validity: TimestampValidity;
  /**
   * Umur dalam menit. `null` kalau timestamp tidak sah.
   *
   * Sengaja TIDAK dijepit ke 0: pemanggil yang menerima angka negatif kecil
   * (dalam toleransi) melihat keadaan sebenarnya, bukan versi yang sudah dipoles.
   */
  ageMinutes: number | null;
  /** Alasan siap-pakai untuk log dan UI. `null` kalau VALID. */
  reason: string | null;
}

/**
 * Menilai satu timestamp data terhadap waktu server.
 *
 * Mengembalikan penilaian, bukan melempar: pemanggil yang berbeda punya jawaban
 * berbeda untuk data tak sah (blokir sinyal, tandai STALE, catat saja), dan
 * keputusan itu bukan milik fungsi ini.
 */
export function assessDataTimestamp(
  dataAsOf: string | null | undefined,
  now: Date = new Date(),
  toleranceMinutes: number = CLOCK_SKEW_TOLERANCE_MINUTES,
): TimestampAssessment {
  if (dataAsOf == null || String(dataAsOf).trim() === '') {
    return { validity: 'UNPARSEABLE', ageMinutes: null, reason: 'Stempel waktu data kosong.' };
  }

  const timestamp = new Date(dataAsOf).getTime();
  if (!Number.isFinite(timestamp)) {
    return {
      validity: 'UNPARSEABLE',
      ageMinutes: null,
      reason: `Stempel waktu data tidak bisa diurai: ${String(dataAsOf).slice(0, 40)}`,
    };
  }

  const ageMinutes = (now.getTime() - timestamp) / 60_000;

  // Umur negatif = timestamp di masa depan. Di luar toleransi, itu data rusak.
  if (ageMinutes < -toleranceMinutes) {
    const aheadMinutes = Math.abs(ageMinutes);
    return {
      validity: 'FUTURE',
      ageMinutes: null,
      reason:
        `Stempel waktu data berada ${aheadMinutes.toFixed(1)} menit di MASA DEPAN ` +
        `(toleransi ${toleranceMinutes} menit) - jam server/penyedia atau zona waktu ` +
        `bermasalah. Data diperlakukan tidak sah, bukan segar.`,
    };
  }

  return { validity: 'VALID', ageMinutes, reason: null };
}

/** `true` kalau timestamp tidak boleh dipakai untuk sinyal yang bisa ditindak. */
export function isTimestampUnusable(assessment: TimestampAssessment): boolean {
  return assessment.validity !== 'VALID';
}
