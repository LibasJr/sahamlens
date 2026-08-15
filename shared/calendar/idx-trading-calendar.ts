// Kalender jam bursa IDX (WIB = UTC+7), dipakai job scheduler yang digerbang jam
// trading supaya tidak membuang invocation/panggilan data di luar jam yang relevan.
//
// Fungsi isTradingHours() dipertahankan dengan perilaku legacy 09:00-16:00 WIB
// karena sudah dapat dipakai scheduler lain. Untuk AI Pick gunakan
// getAiPickScanWindow(), yang mengikuti sesi Pasar Reguler IDX lebih presisi dan
// menyediakan satu jendela final EOD untuk snapshot penutupan.
//
// Hari libur Bursa dikelola eksplisit per tahun, bukan diturunkan dari kalender
// nasional. Sebagian hari libur nasional bukan hari libur perdagangan, dan BEI dapat
// menetapkan libur Bursa tambahan. Perbarui daftar ini setiap BEI menerbitkan
// pengumuman kalender tahunan berikutnya.

const WIB_OFFSET_HOURS = 7;
const OPEN_HOUR_WIB = 9;
const CLOSE_HOUR_WIB = 16;

/** Kalender libur Bursa 2026, sumber: Peng-00171/BEI.POP/09-2025. */
const IDX_MARKET_HOLIDAYS: Record<string, string> = {
  '2026-01-01': 'Tahun Baru Masehi',
  '2026-01-16': 'Isra Mikraj Nabi Muhammad SAW',
  '2026-02-16': 'Cuti bersama Tahun Baru Imlek',
  '2026-02-17': 'Tahun Baru Imlek',
  '2026-03-18': 'Cuti bersama Hari Suci Nyepi',
  '2026-03-19': 'Hari Suci Nyepi',
  '2026-03-20': 'Cuti bersama Idulfitri',
  '2026-03-23': 'Idulfitri',
  '2026-03-24': 'Cuti bersama Idulfitri',
  '2026-04-03': 'Wafat Yesus Kristus',
  '2026-05-01': 'Hari Buruh Internasional',
  '2026-05-14': 'Kenaikan Yesus Kristus',
  '2026-05-15': 'Cuti bersama Kenaikan Yesus Kristus',
  '2026-05-27': 'Cuti bersama Iduladha',
  '2026-05-28': 'Iduladha',
  '2026-06-01': 'Hari Lahir Pancasila',
  '2026-06-16': 'Tahun Baru Islam',
  '2026-08-17': 'Hari Kemerdekaan Republik Indonesia',
  '2026-08-25': 'Maulid Nabi Muhammad SAW',
  '2026-12-24': 'Cuti bersama Natal',
  '2026-12-25': 'Hari Natal',
  '2026-12-31': 'Libur Bursa akhir tahun',
};

function toWibParts(date: Date): { dateKey: string; dayOfWeek: number; hour: number; minute: number; minutes: number } {
  const wibMs = date.getTime() + WIB_OFFSET_HOURS * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  const hour = wib.getUTCHours();
  const minute = wib.getUTCMinutes();
  return {
    dateKey: `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, '0')}-${String(wib.getUTCDate()).padStart(2, '0')}`,
    dayOfWeek: wib.getUTCDay(),
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

export function getIdxMarketHoliday(date: Date): string | null {
  return IDX_MARKET_HOLIDAYS[toWibParts(date).dateKey] ?? null;
}

export function isTradingDay(date: Date): boolean {
  const { dayOfWeek, dateKey } = toWibParts(date);
  return dayOfWeek >= 1 && dayOfWeek <= 5 && !IDX_MARKET_HOLIDAYS[dateKey];
}

export function isTradingHours(date: Date): boolean {
  if (!isTradingDay(date)) return false;
  const { hour } = toWibParts(date);
  return hour >= OPEN_HOUR_WIB && hour < CLOSE_HOUR_WIB;
}

export type AiPickScanWindow = 'REGULAR_SESSION' | 'FINAL_CLOSE' | 'CLOSED';

/**
 * Jendela scan AI Pick berdasarkan Pasar Reguler IDX.
 *
 * Senin-Kamis:
 * - Sesi I  : 09:00-12:00 WIB
 * - Sesi II : 13:30-15:50 WIB
 *
 * Jumat:
 * - Sesi I  : 09:00-11:30 WIB
 * - Sesi II : 14:00-15:50 WIB
 *
 * Final close:
 * - 16:15-16:29 WIB. Dengan QStash setiap 15 menit, ini menghasilkan satu scan pada 16:15 WIB.
 *   Tujuannya menyimpan snapshot final yang tetap fresh untuk user malam hari.
 *
 * Pre-closing/post-closing tidak dipakai sebagai scan intraday tambahan agar tidak
 * membuat full-universe scan berulang saat pembentukan harga penutupan.
 */
export function getAiPickScanWindow(date: Date): AiPickScanWindow {
  const { dayOfWeek, minutes } = toWibParts(date);
  if (!isTradingDay(date)) return 'CLOSED';

  const isFriday = dayOfWeek === 5;
  const session1End = isFriday ? 11 * 60 + 30 : 12 * 60;
  const session2Start = isFriday ? 14 * 60 : 13 * 60 + 30;
  const regularEnd = 15 * 60 + 50; // regular session ends 15:49:59

  const inSession1 = minutes >= 9 * 60 && minutes < session1End;
  const inSession2 = minutes >= session2Start && minutes < regularEnd;
  if (inSession1 || inSession2) return 'REGULAR_SESSION';

  // QStash runs every 15 minutes. This window admits the 16:15 invocation only.
  if (minutes >= 16 * 60 + 15 && minutes < 16 * 60 + 30) return 'FINAL_CLOSE';

  return 'CLOSED';
}
