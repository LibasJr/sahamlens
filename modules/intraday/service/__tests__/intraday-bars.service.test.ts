import { describe, it, expect } from 'vitest';
import {
  assessIntradayBars,
  expectedBarsPerDay,
  isExchangeTradingDay,
  isInsideSession,
  sessionsForDate,
  toWibIso,
  wibDateKeyToUnix,
  wibStamp,
  type RawIntradayBar,
} from '../intraday-bars.service';
import { DEFAULT_INTRADAY_CALENDAR } from '../../constants/intraday-model';

// 2026-08-10 adalah hari Senin.
const MONDAY = '2026-08-10';
const FRIDAY = '2026-08-14';
const SATURDAY = '2026-08-15';

function bar(dateKey: string, minute: number, overrides: Partial<RawIntradayBar> = {}): RawIntradayBar {
  return {
    unixSeconds: wibDateKeyToUnix(dateKey, minute),
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 1000,
    ...overrides,
  };
}

describe('waktu WIB', () => {
  it('memetakan unix ke tanggal dan menit WIB, bukan UTC', () => {
    // 02:00 UTC = 09:00 WIB pada hari yang sama.
    const unix = Date.parse('2026-08-10T02:00:00Z') / 1000;
    expect(wibStamp(unix)).toEqual({ dateKey: '2026-08-10', minute: 9 * 60, weekday: 1 });
  });

  it('tidak menggeser tanggal untuk bar sore WIB yang sudah lewat tengah malam UTC-mundur', () => {
    // 08:45 UTC = 15:45 WIB.
    const unix = Date.parse('2026-08-10T08:45:00Z') / 1000;
    const stamp = wibStamp(unix);
    expect(stamp.dateKey).toBe('2026-08-10');
    expect(stamp.minute).toBe(15 * 60 + 45);
  });

  it('wibDateKeyToUnix adalah kebalikan wibStamp', () => {
    const unix = wibDateKeyToUnix(MONDAY, 9 * 60 + 30);
    expect(wibStamp(unix)).toEqual({ dateKey: MONDAY, minute: 570, weekday: 1 });
  });

  it('toWibIso selalu membawa offset +07:00 eksplisit', () => {
    expect(toWibIso(wibDateKeyToUnix(MONDAY, 9 * 60))).toBe('2026-08-10T09:00:00+07:00');
  });
});

describe('kalender bursa', () => {
  it('Sabtu bukan hari bursa', () => {
    expect(isExchangeTradingDay(SATURDAY, DEFAULT_INTRADAY_CALENDAR)).toBe(false);
    expect(isExchangeTradingDay(MONDAY, DEFAULT_INTRADAY_CALENDAR)).toBe(true);
  });

  it('hari libur bursa yang dikonfigurasi ikut ditolak', () => {
    const calendar = { ...DEFAULT_INTRADAY_CALENDAR, exchangeHolidays: [MONDAY] };
    expect(isExchangeTradingDay(MONDAY, calendar)).toBe(false);
  });

  it('Jumat memakai jam sesi yang berbeda dari Senin-Kamis', () => {
    const monday = sessionsForDate(MONDAY, DEFAULT_INTRADAY_CALENDAR);
    const friday = sessionsForDate(FRIDAY, DEFAULT_INTRADAY_CALENDAR);
    expect(monday[0]!.endMinute).toBe(12 * 60);
    expect(friday[0]!.endMinute).toBe(11 * 60 + 30);
    expect(friday[1]!.startMinute).toBe(14 * 60);
  });

  it('menit di jeda sesi siang berada di luar sesi', () => {
    const sessions = sessionsForDate(MONDAY, DEFAULT_INTRADAY_CALENDAR);
    expect(isInsideSession(12 * 60 + 30, sessions)).toBe(false);
    expect(isInsideSession(9 * 60, sessions)).toBe(true);
    expect(isInsideSession(15 * 60 + 45, sessions)).toBe(true);
  });

  it('jumlah bar yang diharapkan mengikuti panjang sesi hari itu', () => {
    // Senin: (12:00-09:00) + (15:50-13:30) = 180 + 140 menit = 64 bar 5 menit.
    expect(expectedBarsPerDay(MONDAY, DEFAULT_INTRADAY_CALENDAR)).toBe(64);
    // Jumat: (11:30-09:00) + (15:50-14:00) = 150 + 110 = 52 bar.
    expect(expectedBarsPerDay(FRIDAY, DEFAULT_INTRADAY_CALENDAR)).toBe(52);
  });
});

describe('pemeriksaan kualitas bar', () => {
  it('membuang bar null di jeda sesi tanpa menganggapnya kerusakan data', () => {
    const raw = [bar(MONDAY, 9 * 60), bar(MONDAY, 12 * 60 + 30, { open: null, high: null, low: null, close: null, volume: null })];
    const { bars, quality } = assessIntradayBars({ ticker: 'BBCA.JK', rawBars: raw });
    expect(bars).toHaveLength(1);
    // Bar 12:30 ditolak karena DI LUAR SESI, bukan karena null - itu perbedaan penting.
    expect(quality.rejectedByReason.OUTSIDE_SESSION).toBe(1);
    expect(quality.rejectedByReason.NULL_OHLCV).toBe(0);
  });

  it('menolak bar null yang berada DI DALAM sesi sebagai NULL_OHLCV', () => {
    const raw = [bar(MONDAY, 10 * 60, { close: null })];
    const { bars, quality } = assessIntradayBars({ ticker: 'KAEF.JK', rawBars: raw });
    expect(bars).toHaveLength(0);
    expect(quality.rejectedByReason.NULL_OHLCV).toBe(1);
  });

  it('menolak high < low, open/close di luar rentang, harga <= 0, dan volume negatif', () => {
    const raw = [
      bar(MONDAY, 9 * 60, { high: 90, low: 95 }),
      bar(MONDAY, 9 * 60 + 5, { open: 200 }),
      bar(MONDAY, 9 * 60 + 10, { close: 0 }),
      bar(MONDAY, 9 * 60 + 15, { volume: -5 }),
    ];
    const { bars, quality } = assessIntradayBars({ ticker: 'X.JK', rawBars: raw });
    expect(bars).toHaveLength(0);
    expect(quality.rejectedByReason.HIGH_BELOW_LOW).toBe(1);
    expect(quality.rejectedByReason.OPEN_CLOSE_OUTSIDE_RANGE).toBe(1);
    expect(quality.rejectedByReason.NON_POSITIVE_PRICE).toBe(1);
    expect(quality.rejectedByReason.NEGATIVE_VOLUME).toBe(1);
  });

  it('mendeteksi timestamp duplikat dan tidak berurutan', () => {
    const first = bar(MONDAY, 9 * 60);
    const raw = [first, { ...first }, bar(MONDAY, 9 * 60 + 5), { ...bar(MONDAY, 9 * 60 - 5) }];
    const { quality } = assessIntradayBars({ ticker: 'X.JK', rawBars: raw });
    expect(quality.rejectedByReason.DUPLICATE_TIMESTAMP).toBe(1);
    expect(quality.rejectedByReason.OUT_OF_ORDER_TIMESTAMP).toBe(1);
  });

  it('menandai timezone provider yang bukan Asia/Jakarta', () => {
    const { quality } = assessIntradayBars({
      ticker: 'X.JK',
      rawBars: [bar(MONDAY, 9 * 60)],
      providerTimezone: 'America/New_York',
      providerGmtOffsetSeconds: -14400,
    });
    expect(quality.timezoneMismatch).toBe(true);
  });

  it('menandai hari dengan lonjakan harga ekstrem sebagai kandidat aksi korporasi', () => {
    const raw = [
      bar(MONDAY, 9 * 60, { open: 100, high: 100, low: 100, close: 100 }),
      bar(MONDAY, 9 * 60 + 5, { open: 50, high: 50, low: 50, close: 50 }),
    ];
    const { quality } = assessIntradayBars({ ticker: 'X.JK', rawBars: raw });
    expect(quality.days[0]!.status).toBe('CORPORATE_ACTION_SUSPECT');
    expect(quality.unusableDates).toContain(MONDAY);
  });

  it('menandai hari tanpa volume sama sekali sebagai suspend/tidak diperdagangkan', () => {
    const raw = [bar(MONDAY, 9 * 60, { volume: 0 }), bar(MONDAY, 9 * 60 + 5, { volume: 0 })];
    const { quality } = assessIntradayBars({ ticker: 'X.JK', rawBars: raw });
    expect(quality.days[0]!.status).toBe('SUSPENDED_OR_NO_TRADE');
  });

  it('menandai hari dengan bar jauh dari lengkap sebagai INCOMPLETE', () => {
    const raw = [bar(MONDAY, 9 * 60), bar(MONDAY, 9 * 60 + 5)];
    const { quality } = assessIntradayBars({ ticker: 'X.JK', rawBars: raw });
    expect(quality.days[0]!.validBars).toBe(2);
    expect(quality.days[0]!.expectedBars).toBe(64);
    expect(quality.days[0]!.status).toBe('INCOMPLETE');
  });

  it('bar pada hari Sabtu ditolak sebagai bukan hari bursa', () => {
    const { bars, quality } = assessIntradayBars({ ticker: 'X.JK', rawBars: [bar(SATURDAY, 10 * 60)] });
    expect(bars).toHaveLength(0);
    expect(quality.rejectedByReason.NOT_A_TRADING_DAY).toBe(1);
  });
});

describe('acuan hari bursa dan hari yang hilang total', () => {
  const TUESDAY = '2026-08-11';

  it('tanpa acuan, hari yang datanya hilang total TIDAK terlihat sama sekali', () => {
    const { quality } = assessIntradayBars({ ticker: 'X.JK', rawBars: [bar(MONDAY, 9 * 60)] });
    expect(quality.days.map((d) => d.tradingDate)).toEqual([MONDAY]);
    expect(quality.missingDates).toEqual([]);
    expect(quality.referenceCalendarUsed).toBe(false);
  });

  it('dengan acuan, hari bursa berjalan yang nihil bar dilaporkan sebagai MISSING_DAY', () => {
    const { quality } = assessIntradayBars({
      ticker: 'X.JK',
      rawBars: [bar(MONDAY, 9 * 60)],
      referenceTradingDates: [MONDAY, TUESDAY],
    });
    expect(quality.referenceCalendarUsed).toBe(true);
    expect(quality.missingDates).toEqual([TUESDAY]);
    const tuesday = quality.days.find((d) => d.tradingDate === TUESDAY)!;
    expect(tuesday.status).toBe('MISSING_DAY');
    expect(tuesday.validBars).toBe(0);
    expect(tuesday.completenessPct).toBe(0);
    expect(tuesday.missingBars).toBe(tuesday.expectedBars);
    expect(quality.unusableDates).toContain(TUESDAY);
  });

  it('acuan yang memuat akhir pekan tidak menciptakan MISSING_DAY palsu', () => {
    const { quality } = assessIntradayBars({
      ticker: 'X.JK',
      rawBars: [bar(MONDAY, 9 * 60)],
      referenceTradingDates: [MONDAY, SATURDAY],
    });
    expect(quality.missingDates).toEqual([]);
  });

  it('hari yang hilang total menurunkan kelengkapan keseluruhan, tidak disembunyikan', () => {
    // Hari penuh = KEDUA sesi, bukan 64 bar beruntun dari 09:00 (itu akan menembus
    // jeda siang dan sebagian barnya ditolak sebagai di luar sesi).
    const fullDay = [
      ...Array.from({ length: 36 }, (_, i) => bar(MONDAY, 9 * 60 + i * 5)),
      ...Array.from({ length: 28 }, (_, i) => bar(MONDAY, 13 * 60 + 30 + i * 5)),
    ];
    const withoutReference = assessIntradayBars({ ticker: 'X.JK', rawBars: fullDay });
    const withReference = assessIntradayBars({
      ticker: 'X.JK',
      rawBars: fullDay,
      referenceTradingDates: [MONDAY, TUESDAY],
    });
    // Hari Senin memang lengkap - tapi emiten ini kehilangan SELURUH hari Selasa.
    expect(withoutReference.quality.completenessPct).toBe(100);
    expect(withReference.quality.completenessPct).toBeLessThan(100);
  });
});
