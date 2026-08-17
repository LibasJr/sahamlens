// Utilitas kalender/jam pasar untuk membedakan bar harian yang masih terbentuk dari
// bar EOD. Zero Dummy Policy: file ini SENGAJA tidak menyediakan fungsi proyeksi volume
// sesi penuh. Volume parsial tetap parsial; konsumen harus melabelinya atau fail-closed.
const IDX_TIMEZONE = 'Asia/Jakarta';
const SESSION_OPEN_MINUTES = 9 * 60; // 09:00 WIB
// Approximation window only. Hari libur bursa tidak disimpulkan di sini; pemanggil yang
// memeriksa bar live juga wajib mencocokkan tanggal bar dengan todayDateKeyWIB().
const SESSION_CLOSE_MINUTES = 15 * 60;

function nowPartsWIB(): { weekday: number; minutesSinceMidnight: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IDX_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[map.weekday] ?? -1,
    minutesSinceMidnight: parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10),
    dateKey: `${map.year}-${map.month}-${map.day}`,
  };
}

/** Senin-Jumat, dalam jendela pendekatan 09:00-15:00 WIB.
 * Ini BUKAN kalender libur resmi BEI. Untuk mendeteksi bar live, selalu kombinasikan
 * dengan tanggal bar provider === todayDateKeyWIB(). */
export function isIdxMarketHoursNow(): boolean {
  const { weekday, minutesSinceMidnight } = nowPartsWIB();
  if (weekday < 1 || weekday > 5) return false;
  return minutesSinceMidnight >= SESSION_OPEN_MINUTES && minutesSinceMidnight < SESSION_CLOSE_MINUTES;
}

/** Tanggal kalender WIB hari ini, format YYYY-MM-DD. */
export function todayDateKeyWIB(): string {
  return nowPartsWIB().dateKey;
}
