import { isTradingDay, getIdxMarketHoliday } from '@/shared/calendar/idx-trading-calendar';

export function isMarketOpen(d: Date = new Date()): boolean {
  if (!isTradingDay(d)) return false;

  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const map: Record<string, string> = {};
  parts.forEach(p => { map[p.type] = p.value; });
  const weekday = map.weekday;
  const minutes = parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10);
  const isFriday = weekday === 'Fri';
  const session1 = minutes >= 9 * 60 && minutes <= 11 * 60 + 30;
  const session2 = isFriday ? (minutes >= 14 * 60 && minutes <= 15 * 60 + 49) : (minutes >= 13 * 60 + 30 && minutes <= 15 * 60 + 49);
  return session1 || session2;
}

export function getMarketStatus(d: Date = new Date()): { isOpen: boolean; label: string; holidayName: string | null } {
  const holiday = getIdxMarketHoliday(d);
  if (holiday) {
    return { isOpen: false, label: `Libur Bursa (${holiday})`, holidayName: holiday };
  }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const map: Record<string, string> = {};
  parts.forEach(p => { map[p.type] = p.value; });
  const weekday = map.weekday;
  if (weekday === 'Sat' || weekday === 'Sun') {
    return { isOpen: false, label: 'Libur Akhir Pekan', holidayName: null };
  }
  const open = isMarketOpen(d);
  return {
    isOpen: open,
    label: open ? 'Bursa Buka' : 'Bursa Tutup',
    holidayName: null,
  };
}
