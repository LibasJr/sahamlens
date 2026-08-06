export interface DatedCloseEntry {
  date: string;
  closePrice: number;
}

export const LENS_RADAR_HOLDING_DAYS = 20;
export const MAX_SANE_DAILY_MOVE = 0.4;

/**
 * Batas bawah tick IDX (saham "gocap"). Hanya boleh diterapkan pada harga RAW.
 * Harga TOTAL_RETURN_ADJUSTED bisa sah berada di bawah 50 setelah faktor split
 * dipakai mundur, jadi memfilter harga adjusted dengan ambang ini akan membuang
 * histori yang valid.
 */
export const MIN_TRADABLE_PRICE_IDR = 50;

/**
 * Drawdown terburuk antar trade, dalam persen (nilai <= 0).
 *
 * Metrik ini SENGAJA bukan drawdown equity curve. Sinyal LensRadar tumpang tindih:
 * ratusan ticker bisa memberi sinyal di hari yang sama, dan tiap trade T+20 masih
 * berjalan saat sinyal berikutnya muncul. Mengalikan ribuan return T+20 secara
 * berurutan seolah-olah satu modal berpindah trade menghasilkan volatility drag
 * (E[log(1+r)] < log(1+E[r])) yang menekan equity ke nol, sehingga drawdown selalu
 * jatuh ke -100% tanpa peduli kualitas sinyal. Lihat DEPLOYMENT.md.
 *
 * Drawdown level portofolio butuh position sizing dan aturan alokasi yang belum ada;
 * sampai itu dibangun, worst-trade adalah angka yang bisa dipertanggungjawabkan.
 */
export function worstTradeDrawdownPct(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((worst, value) => Math.min(worst, value), 0);
}

/**
 * Drawdown pada persentil 95, dalam persen (nilai <= 0): hanya 5% trade yang turun
 * lebih dalam dari angka ini.
 *
 * Persentil diambil dari BESARAN penurunan (nearest-rank), bukan dari nilai bertanda.
 * Mengurutkan drawdown bertanda menaik lalu mengambil P95 akan mengembalikan angka
 * paling dekat ke nol - yaitu trade yang nyaris tidak turun - sehingga justru
 * menyembunyikan risiko yang mau diukur.
 *
 * Berbeda dari worstTradeDrawdownPct yang hanya melihat satu trade terburuk, angka ini
 * tidak ikut bergerak saat satu emiten kolaps.
 */
export function drawdownPercentile95Pct(values: number[]): number | null {
  if (!values.length) return null;
  const magnitudes = values.map((value) => Math.abs(Math.min(0, value))).sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(magnitudes.length * 0.95));
  return -magnitudes[rank - 1];
}

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
