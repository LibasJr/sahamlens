// Kalender jam bursa IDX (WIB = UTC+7), dipakai job scheduler yang digerbang jam
// trading supaya tidak membuang invocation/panggilan data di luar jam yang relevan.
//
// Fungsi isTradingHours() dipertahankan dengan perilaku legacy 09:00-16:00 WIB
// karena sudah dapat dipakai scheduler lain. Untuk AI Pick gunakan
// getAiPickScanWindow(), yang mengikuti sesi Pasar Reguler IDX lebih presisi dan
// menyediakan satu jendela final EOD untuk snapshot penutupan.
//
// Catatan: hari libur Bursa belum dikelola di file ini. Pada hari libur weekday,
// QStash masih bisa memanggil route, tetapi guard hanya berbasis weekday/jam.

const WIB_OFFSET_HOURS = 7;
const OPEN_HOUR_WIB = 9;
const CLOSE_HOUR_WIB = 16;

function toWibParts(date: Date): { dayOfWeek: number; hour: number; minute: number; minutes: number } {
  const wibMs = date.getTime() + WIB_OFFSET_HOURS * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  const hour = wib.getUTCHours();
  const minute = wib.getUTCMinutes();
  return {
    dayOfWeek: wib.getUTCDay(),
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

export function isTradingDay(date: Date): boolean {
  const { dayOfWeek } = toWibParts(date);
  return dayOfWeek >= 1 && dayOfWeek <= 5;
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
  if (dayOfWeek < 1 || dayOfWeek > 5) return 'CLOSED';

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
