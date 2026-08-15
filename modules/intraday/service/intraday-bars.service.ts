// Sumber & kualitas bar intraday LensIntraday.
//
// Provider: endpoint chart v8 Yahoo Finance yang SUDAH dipakai aplikasi ini untuk
// data harian (modules/technical/service/yahoo-history.service.ts) dan untuk
// sparkline 5 menit IHSG (modules/market/service/market-pulse.service.ts) - jadi
// tidak ada provider/credential baru yang diperkenalkan di sini.
//
// Batas yang diverifikasi empiris 2026-08-15 terhadap BBCA.JK/TLKM.JK/BUMI.JK/^JKSE:
//   - interval 5m  -> lookback maksimum 60 hari kalender
//   - 87 bar/hari, 09:00-16:10 WIB, meta.exchangeTimezoneName = "Asia/Jakarta"
//   - jeda sesi siang muncul sebagai bar ber-OHLCV null (BUKAN bar yang hilang)
//   - 15:50 & 15:55 null (pre-closing), 16:00 bar lelang penutupan bervolume besar
//   - emiten tipis (mis. KAEF.JK) punya null tersebar sepanjang hari
//
// Karena itu "candle null" TIDAK otomatis berarti data rusak: di jeda sesi ia justru
// data yang benar. Pemeriksaan di bawah membedakan keduanya lewat kalender sesi.

import {
  DEFAULT_INTRADAY_CALENDAR,
  INTRADAY_BAR_INTERVAL,
  INTRADAY_BAR_INTERVAL_MINUTES,
  INTRADAY_MAX_LOOKBACK_DAYS,
  INTRADAY_PROVIDER,
  INTRADAY_TIMEZONE,
  WIB_OFFSET_SECONDS,
  type IntradayCalendarConfig,
  type IntradaySessionWindow,
} from '../constants/intraday-model';

// ---------------------------------------------------------------------------
// Waktu WIB
// ---------------------------------------------------------------------------

export interface WibStamp {
  /** YYYY-MM-DD tanggal kalender WIB. */
  dateKey: string;
  /** Menit sejak tengah malam WIB. */
  minute: number;
  /** 0=Minggu .. 6=Sabtu, dalam WIB. */
  weekday: number;
}

/**
 * WIB adalah UTC+7 tetap (Indonesia tidak memakai DST), jadi pergeseran offset
 * konstan aman dan deterministik - tidak perlu Intl.DateTimeFormat per bar, yang
 * akan dipanggil ratusan ribu kali saat backfill.
 */
export function wibStamp(unixSeconds: number): WibStamp {
  const shifted = new Date((unixSeconds + WIB_OFFSET_SECONDS) * 1000);
  return {
    dateKey: shifted.toISOString().slice(0, 10),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** Kebalikan wibStamp: awal hari WIB (00:00) sebagai unix detik. */
export function wibDateKeyToUnix(dateKey: string, minute = 0): number {
  return Date.parse(`${dateKey}T00:00:00Z`) / 1000 - WIB_OFFSET_SECONDS + minute * 60;
}

export function formatWibMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** ISO 8601 dengan offset WIB eksplisit, supaya UI/DB tidak pernah menebak zona. */
export function toWibIso(unixSeconds: number): string {
  return `${new Date((unixSeconds + WIB_OFFSET_SECONDS) * 1000).toISOString().slice(0, 19)}+07:00`;
}

export function sessionsForDate(dateKey: string, calendar: IntradayCalendarConfig): IntradaySessionWindow[] {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  if (weekday === 5) return calendar.fridaySessions;
  return calendar.regularSessions;
}

export function isExchangeTradingDay(dateKey: string, calendar: IntradayCalendarConfig): boolean {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !calendar.exchangeHolidays.includes(dateKey);
}

export function isInsideSession(minute: number, sessions: IntradaySessionWindow[]): boolean {
  return sessions.some((s) => minute >= s.startMinute && minute < s.endMinute);
}

/** Berapa bar yang SEHARUSNYA ada di dalam sesi reguler untuk satu hari. */
export function expectedBarsPerDay(dateKey: string, calendar: IntradayCalendarConfig): number {
  return sessionsForDate(dateKey, calendar).reduce(
    (sum, s) => sum + Math.floor((s.endMinute - s.startMinute) / INTRADAY_BAR_INTERVAL_MINUTES),
    0
  );
}

// ---------------------------------------------------------------------------
// Tipe bar
// ---------------------------------------------------------------------------

export interface RawIntradayBar {
  unixSeconds: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface IntradayBar {
  ticker: string;
  unixSeconds: number;
  tradingDate: string;
  wibMinute: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type BarRejectReason =
  | 'OUTSIDE_SESSION'
  | 'NULL_OHLCV'
  | 'NON_POSITIVE_PRICE'
  | 'HIGH_BELOW_LOW'
  | 'OPEN_CLOSE_OUTSIDE_RANGE'
  | 'NEGATIVE_VOLUME'
  | 'DUPLICATE_TIMESTAMP'
  | 'OUT_OF_ORDER_TIMESTAMP'
  | 'NOT_A_TRADING_DAY';

export type IntradayDayStatus =
  | 'OK'
  | 'INCOMPLETE'
  | 'SUSPENDED_OR_NO_TRADE'
  | 'CORPORATE_ACTION_SUSPECT'
  // Hari bursa yang TERBUKTI berjalan (IHSG punya bar) tetapi emiten ini tidak punya
  // satu bar pun. Tanpa status ini, kegagalan paling parah justru tidak terlihat:
  // hari yang datanya hilang total sekadar TIDAK MUNCUL di laporan, dan kelengkapan
  // terhitung 100% dari hari-hari yang kebetulan ada.
  | 'MISSING_DAY';

export interface IntradayDayQuality {
  tradingDate: string;
  expectedBars: number;
  validBars: number;
  missingBars: number;
  zeroVolumeBars: number;
  completenessPct: number;
  status: IntradayDayStatus;
  /** Lonjakan harga antar bar berurutan yang melebihi ambang - kandidat aksi korporasi. */
  maxAbsBarMovePct: number | null;
}

export interface IntradayQualityReport {
  ticker: string;
  provider: string;
  interval: string;
  timezone: string;
  rawBars: number;
  validBars: number;
  rejectedBars: number;
  rejectedByReason: Record<BarRejectReason, number>;
  days: IntradayDayQuality[];
  completenessPct: number;
  /** Hari yang datanya tidak layak dipakai sama sekali. */
  unusableDates: string[];
  timezoneMismatch: boolean;
  /** Bar terakhir yang tersedia, ISO WIB. null kalau tidak ada bar valid. */
  lastBarWibIso: string | null;
  /** Hari bursa yang berjalan menurut acuan tetapi emiten ini tidak punya bar sama sekali. */
  missingDates: string[];
  /** Apakah laporan ini memakai acuan hari bursa nyata atau hanya hari yang ada barnya. */
  referenceCalendarUsed: boolean;
}

const EMPTY_REJECTS = (): Record<BarRejectReason, number> => ({
  OUTSIDE_SESSION: 0,
  NULL_OHLCV: 0,
  NON_POSITIVE_PRICE: 0,
  HIGH_BELOW_LOW: 0,
  OPEN_CLOSE_OUTSIDE_RANGE: 0,
  NEGATIVE_VOLUME: 0,
  DUPLICATE_TIMESTAMP: 0,
  OUT_OF_ORDER_TIMESTAMP: 0,
  NOT_A_TRADING_DAY: 0,
});

/** Di atas ini, gerakan satu bar 5 menit lebih mungkin aksi korporasi daripada pasar. */
export const CORPORATE_ACTION_BAR_MOVE_PCT = 20;
/** Hari dengan kelengkapan di bawah ini tidak dipakai untuk sinyal apa pun. */
export const MIN_DAY_COMPLETENESS_PCT = 80;

// ---------------------------------------------------------------------------
// Pemeriksaan kualitas - fungsi murni, bisa diuji tanpa jaringan
// ---------------------------------------------------------------------------

export function assessIntradayBars(input: {
  ticker: string;
  rawBars: RawIntradayBar[];
  calendar?: IntradayCalendarConfig;
  providerTimezone?: string | null;
  providerGmtOffsetSeconds?: number | null;
  /**
   * Hari bursa yang BENAR-BENAR berjalan, biasanya diturunkan dari bar IHSG
   * (lihat fetchExchangeTradingDates). Kalender weekday saja tidak cukup: hari libur
   * bursa juga hari kerja, dan tanpa acuan ini "libur" dan "data hilang" terlihat sama.
   */
  referenceTradingDates?: string[];
}): { bars: IntradayBar[]; quality: IntradayQualityReport } {
  const calendar = input.calendar ?? DEFAULT_INTRADAY_CALENDAR;
  const rejects = EMPTY_REJECTS();
  const bars: IntradayBar[] = [];

  const timezoneMismatch =
    (input.providerTimezone != null && input.providerTimezone !== INTRADAY_TIMEZONE) ||
    (input.providerGmtOffsetSeconds != null && input.providerGmtOffsetSeconds !== WIB_OFFSET_SECONDS);

  const seen = new Set<number>();
  let previousUnix = Number.NEGATIVE_INFINITY;

  // Bar di luar sesi (pre-opening, pre-closing, lelang penutupan, post-trading) tetap
  // dihitung sebagai "raw" tapi tidak pernah masuk populasi - harga lelang penutupan
  // bukan harga yang bisa dieksekusi sebagai exit intraday.
  for (const raw of input.rawBars) {
    if (!Number.isFinite(raw.unixSeconds)) {
      rejects.OUT_OF_ORDER_TIMESTAMP++;
      continue;
    }
    if (seen.has(raw.unixSeconds)) {
      rejects.DUPLICATE_TIMESTAMP++;
      continue;
    }
    if (raw.unixSeconds < previousUnix) {
      rejects.OUT_OF_ORDER_TIMESTAMP++;
      continue;
    }
    seen.add(raw.unixSeconds);
    previousUnix = raw.unixSeconds;

    const stamp = wibStamp(raw.unixSeconds);
    if (!isExchangeTradingDay(stamp.dateKey, calendar)) {
      rejects.NOT_A_TRADING_DAY++;
      continue;
    }
    if (!isInsideSession(stamp.minute, sessionsForDate(stamp.dateKey, calendar))) {
      rejects.OUTSIDE_SESSION++;
      continue;
    }
    const { open, high, low, close, volume } = raw;
    if (open == null || high == null || low == null || close == null || volume == null) {
      rejects.NULL_OHLCV++;
      continue;
    }
    if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) {
      rejects.NON_POSITIVE_PRICE++;
      continue;
    }
    if (high < low) {
      rejects.HIGH_BELOW_LOW++;
      continue;
    }
    if (open > high || open < low || close > high || close < low) {
      rejects.OPEN_CLOSE_OUTSIDE_RANGE++;
      continue;
    }
    if (!Number.isFinite(volume) || volume < 0) {
      rejects.NEGATIVE_VOLUME++;
      continue;
    }

    bars.push({
      ticker: input.ticker,
      unixSeconds: raw.unixSeconds,
      tradingDate: stamp.dateKey,
      wibMinute: stamp.minute,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  const byDate = new Map<string, IntradayBar[]>();
  for (const bar of bars) {
    const list = byDate.get(bar.tradingDate);
    if (list) list.push(bar);
    else byDate.set(bar.tradingDate, [bar]);
  }

  // Hari bursa yang harus DIPERTANGGUNGJAWABKAN. Kalau acuan tersedia, hari yang
  // barnya nol pun ikut dilaporkan; tanpa acuan, hanya hari yang ada barnya - dan
  // itu keterbatasan yang dinyatakan lewat referenceCalendarUsed, bukan disembunyikan.
  const referenceDates = (input.referenceTradingDates ?? []).filter((date) =>
    isExchangeTradingDay(date, calendar)
  );
  const accountedDates = Array.from(new Set([...Array.from(byDate.keys()), ...referenceDates])).sort();

  const days: IntradayDayQuality[] = [];
  const unusableDates: string[] = [];
  const missingDates: string[] = [];
  for (const tradingDate of accountedDates) {
    const dayBars = byDate.get(tradingDate) ?? [];
    if (dayBars.length === 0) {
      missingDates.push(tradingDate);
      unusableDates.push(tradingDate);
      days.push({
        tradingDate,
        expectedBars: expectedBarsPerDay(tradingDate, calendar),
        validBars: 0,
        missingBars: expectedBarsPerDay(tradingDate, calendar),
        zeroVolumeBars: 0,
        completenessPct: 0,
        status: 'MISSING_DAY',
        maxAbsBarMovePct: null,
      });
      continue;
    }
    const expected = expectedBarsPerDay(tradingDate, calendar);
    const zeroVolumeBars = dayBars.filter((b) => b.volume === 0).length;
    const completenessPct = expected > 0 ? (dayBars.length / expected) * 100 : 0;

    let maxAbsBarMovePct: number | null = null;
    for (let i = 1; i < dayBars.length; i++) {
      const prev = dayBars[i - 1]!.close;
      const move = Math.abs(dayBars[i]!.close / prev - 1) * 100;
      if (maxAbsBarMovePct == null || move > maxAbsBarMovePct) maxAbsBarMovePct = move;
    }

    let status: IntradayDayStatus = 'OK';
    if (zeroVolumeBars === dayBars.length) status = 'SUSPENDED_OR_NO_TRADE';
    else if (maxAbsBarMovePct != null && maxAbsBarMovePct > CORPORATE_ACTION_BAR_MOVE_PCT) status = 'CORPORATE_ACTION_SUSPECT';
    else if (completenessPct < MIN_DAY_COMPLETENESS_PCT) status = 'INCOMPLETE';

    if (status !== 'OK') unusableDates.push(tradingDate);

    days.push({
      tradingDate,
      expectedBars: expected,
      validBars: dayBars.length,
      missingBars: Math.max(0, expected - dayBars.length),
      zeroVolumeBars,
      completenessPct: Math.round(completenessPct * 100) / 100,
      status,
      maxAbsBarMovePct: maxAbsBarMovePct == null ? null : Math.round(maxAbsBarMovePct * 100) / 100,
    });
  }

  const expectedTotal = days.reduce((sum, d) => sum + d.expectedBars, 0);
  const lastBar = bars.length ? bars[bars.length - 1]! : null;

  return {
    bars,
    quality: {
      ticker: input.ticker,
      provider: INTRADAY_PROVIDER,
      interval: INTRADAY_BAR_INTERVAL,
      timezone: INTRADAY_TIMEZONE,
      rawBars: input.rawBars.length,
      validBars: bars.length,
      rejectedBars: input.rawBars.length - bars.length,
      rejectedByReason: rejects,
      days,
      completenessPct: expectedTotal > 0 ? Math.round((bars.length / expectedTotal) * 10000) / 100 : 0,
      unusableDates,
      timezoneMismatch,
      lastBarWibIso: lastBar ? toWibIso(lastBar.unixSeconds) : null,
      missingDates,
      referenceCalendarUsed: referenceDates.length > 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Acuan hari bursa
// ---------------------------------------------------------------------------

/**
 * Hari bursa yang BENAR-BENAR berjalan, diturunkan dari bar IHSG (^JKSE).
 *
 * Ini menggantikan daftar hari libur bursa yang di-hardcode. Daftar semacam itu
 * harus ditulis dari sumber resmi dan diperbarui tiap tahun; menebaknya di kode
 * justru menciptakan kalender yang salah dengan percaya diri. IHSG di sisi lain
 * adalah bukti langsung: kalau indeksnya bergerak hari itu, bursa buka.
 *
 * Mengembalikan null kalau IHSG sendiri tidak bisa diambil - pemanggil harus
 * melanjutkan TANPA acuan (dan melaporkan referenceCalendarUsed=false), bukan
 * menganggap semua weekday hari bursa.
 */
export async function fetchExchangeTradingDates(
  options: { lookbackDays?: number; calendar?: IntradayCalendarConfig; timeoutMs?: number } = {}
): Promise<string[] | null> {
  const benchmark = await fetchIntradayBars('^JKSE', options);
  if (benchmark.error || !benchmark.bars.length) return null;
  return Array.from(new Set(benchmark.bars.map((bar) => bar.tradingDate))).sort();
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface IntradayFetchResult {
  ticker: string;
  bars: IntradayBar[];
  quality: IntradayQualityReport;
  retrievedAt: string;
  error: string | null;
}

/** `BBCA` -> `BBCA.JK`. Sudah bersuffix dibiarkan (mis. indeks `^JKSE`). */
export function toYahooSymbol(ticker: string): string {
  const upper = ticker.trim().toUpperCase();
  if (upper.startsWith('^') || upper.includes('.')) return upper;
  return `${upper}.JK`;
}

export async function fetchIntradayBars(
  ticker: string,
  options: {
    lookbackDays?: number;
    calendar?: IntradayCalendarConfig;
    timeoutMs?: number;
    referenceTradingDates?: string[];
  } = {}
): Promise<IntradayFetchResult> {
  const lookbackDays = Math.min(options.lookbackDays ?? INTRADAY_MAX_LOOKBACK_DAYS, INTRADAY_MAX_LOOKBACK_DAYS);
  const symbol = toYahooSymbol(ticker);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${lookbackDays}d&interval=${INTRADAY_BAR_INTERVAL}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  const retrievedAt = new Date().toISOString();

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return emptyFetchResult(ticker, retrievedAt, `provider HTTP ${res.status}`);
    }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) {
      const providerError = data?.chart?.error?.description;
      return emptyFetchResult(ticker, retrievedAt, providerError ? String(providerError) : 'provider tidak mengembalikan bar');
    }

    const timestamps: number[] = result.timestamp;
    const q = result.indicators.quote[0];
    const rawBars: RawIntradayBar[] = timestamps.map((unixSeconds, i) => ({
      unixSeconds,
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close: q.close?.[i] ?? null,
      volume: q.volume?.[i] ?? null,
    }));

    const assessed = assessIntradayBars({
      ticker: ticker.trim().toUpperCase(),
      rawBars,
      calendar: options.calendar,
      providerTimezone: result.meta?.exchangeTimezoneName ?? null,
      providerGmtOffsetSeconds: result.meta?.gmtoffset ?? null,
      referenceTradingDates: options.referenceTradingDates,
    });

    return { ticker: ticker.trim().toUpperCase(), ...assessed, retrievedAt, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    // Pesan provider tidak pernah memuat credential (URL publik tanpa token), tapi
    // yang diteruskan tetap hanya nama error - bukan objek/URL mentah.
    return emptyFetchResult(ticker, retrievedAt, err instanceof Error ? err.name : 'fetch gagal');
  }
}

function emptyFetchResult(ticker: string, retrievedAt: string, error: string): IntradayFetchResult {
  const normalized = ticker.trim().toUpperCase();
  return {
    ticker: normalized,
    bars: [],
    quality: {
      ticker: normalized,
      provider: INTRADAY_PROVIDER,
      interval: INTRADAY_BAR_INTERVAL,
      timezone: INTRADAY_TIMEZONE,
      rawBars: 0,
      validBars: 0,
      rejectedBars: 0,
      rejectedByReason: EMPTY_REJECTS(),
      days: [],
      completenessPct: 0,
      unusableDates: [],
      timezoneMismatch: false,
      lastBarWibIso: null,
      missingDates: [],
      referenceCalendarUsed: false,
    },
    retrievedAt,
    error,
  };
}
