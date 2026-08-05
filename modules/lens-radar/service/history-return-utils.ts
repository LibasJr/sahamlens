export interface DatedCloseEntry {
  date: string;
  closePrice: number;
}

export const LENS_RADAR_HOLDING_DAYS = 20;
export const MAX_SANE_DAILY_MOVE = 0.4;

export function buildTradingCalendar(rows: { date: string }[]): string[] {
  return Array.from(new Set(rows.map((row) => row.date))).sort();
}

export function barAtTradingOffset<T extends { date: string }>(
  byDate: Map<string, T>,
  calendar: string[],
  fromIndex: number,
  offset: number,
  tolerance = 2
): T | null {
  const target = fromIndex + offset;
  const probes = [0];
  for (let i = 1; i <= tolerance; i++) probes.push(-i, i);

  for (const probe of probes) {
    const idx = target + probe;
    if (idx < 0 || idx >= calendar.length) continue;
    const bar = byDate.get(calendar[idx]);
    if (bar) return bar;
  }
  return null;
}

export function hasCorporateActionGap(
  series: DatedCloseEntry[],
  fromDate: string,
  toDate: string,
  maxSaneDailyMove = MAX_SANE_DAILY_MOVE
): boolean {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const from = sorted.findIndex((row) => row.date === fromDate);
  const to = sorted.findIndex((row) => row.date === toDate);
  if (from < 0 || to < 0 || to <= from) return false;

  for (let i = from + 1; i <= to; i++) {
    const prev = sorted[i - 1]?.closePrice;
    const curr = sorted[i]?.closePrice;
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= 0 || curr <= 0) return true;
    if (Math.abs(curr / prev - 1) > maxSaneDailyMove) return true;
  }
  return false;
}

export function decorrelateByTicker<T extends { ticker: string; signalDate: string }>(
  observations: T[],
  holdingDays = LENS_RADAR_HOLDING_DAYS
): T[] {
  const calendar = buildTradingCalendar(observations.map((obs) => ({ date: obs.signalDate })));
  const calendarIndex = new Map(calendar.map((date, index) => [date, index]));
  const byTicker = new Map<string, T[]>();

  for (const obs of observations) {
    const list = byTicker.get(obs.ticker) ?? [];
    list.push(obs);
    byTicker.set(obs.ticker, list);
  }

  const kept: T[] = [];
  for (const list of Array.from(byTicker.values())) {
    list.sort((a: T, b: T) => a.signalDate.localeCompare(b.signalDate));
    let lastKeptCalendarIndex = -Infinity;
    for (const obs of list) {
      const idx = calendarIndex.get(obs.signalDate);
      if (idx == null) continue;
      if (idx - lastKeptCalendarIndex >= holdingDays) {
        kept.push(obs);
        lastKeptCalendarIndex = idx;
      }
    }
  }

  return kept;
}
