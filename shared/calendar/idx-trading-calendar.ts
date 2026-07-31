// Kalender jam bursa IDX (WIB = UTC+7), dipakai job scheduler yang digerbang jam
// trading (Market Pulse, Breakout Radar, Watchlist Alert) supaya tidak membuang
// invocation/panggilan Yahoo di luar jam bursa (Scheduler Architecture bagian 7).
//
// Sengaja sederhana: hari kerja Senin-Jumat + satu window jam 09:00-16:00 WIB,
// TANPA mengecualikan jeda siang (cukup untuk kebutuhan scheduler - salah
// menganggap jeda siang "buka" jauh lebih murah daripada kompleksitas ekstra).
// Hari libur nasional/bursa TIDAK dicek di sini (butuh sumber data terpisah,
// di-refresh manual tahunan) - dicatat sebagai keterbatasan yang disengaja.

const WIB_OFFSET_HOURS = 7;
const OPEN_HOUR_WIB = 9;
const CLOSE_HOUR_WIB = 16;

function toWibParts(date: Date): { dayOfWeek: number; hour: number } {
  const wibMs = date.getTime() + WIB_OFFSET_HOURS * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  return { dayOfWeek: wib.getUTCDay(), hour: wib.getUTCHours() };
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
