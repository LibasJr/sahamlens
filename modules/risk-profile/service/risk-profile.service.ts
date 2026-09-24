import { queryReadWithRetry } from '@/shared/database/postgres.client';

/**
 * Profil Risiko & Tren — peringkat emiten likuid menurut ciri yang TERBUKTI pada arsip.
 *
 * Semua angka di sini turunan langsung dari deret penutupan di arsip harga SahamLens
 * (`lens_radar_history`). Tidak ada ramalan harga, tidak ada level yang ditebak, dan tidak
 * ada pengganti saat data kurang: kalau sesi tidak cukup, barisnya berstatus
 * INSUFFICIENT_DATA dan halaman menyatakannya apa adanya.
 *
 * Bukti pemilihan ciri (bukan selera): uji lintas-emiten 2021-08-30 → 2026-09-24 pada
 * 915 emiten likuid (`scripts/factor-research.mjs`, laporan
 * docs/factor-research/factor-scan-2026-09-24.md). Yang dipakai di sini hanya ciri dengan
 * IC positif di train DAN OOS:
 *   - volatilitas 60 sesi rendah  (IC train 0,1484 → OOS 0,1056, t 2,26)
 *   - jarak dari puncak 52 minggu (IC train 0,1061 → OOS 0,0452, t 1,37)
 * Peringkat gabungan = rata-rata dua peringkat persentil itu, masing-masing dihitung
 * terhadap seluruh emiten yang lolos ambang likuiditas pada sesi terakhir.
 *
 * Batas yang dinyatakan terbuka:
 *  - Volatilitas = simpangan baku imbal hasil penutupan-ke-penutupan (bukan ATR), karena
 *    arsip tidak menyimpan high/low/volume harian.
 *  - "Puncak 52 minggu" = penutupan tertinggi 252 sesi terakhir; jarak 0% berarti harga
 *    tepat di puncak itu, negatif berarti di bawahnya.
 *  - Peringkat ini BUKAN rekomendasi beli/jual dan bukan janji imbal hasil. Bukti di
 *    atas bersifat kelompok (desil), bukan per emiten.
 */

export const RISK_PROFILE_OPTIONS = {
  /** Sesi minimum agar volatilitas 60 sesi dan puncak 252 sesi punya dasar. */
  minimumSessions: 61,
  /** Jendela puncak 52 minggu (sesi). */
  highWindow: 252,
  /** Jendela volatilitas utama. */
  volatilityWindow: 60,
  /** Jendela volatilitas pendek (ditampilkan sebagai pembanding). */
  volatilityShortWindow: 20,
  /** Jendela untuk puncak imbal hasil harian (uji "hindari lotere"). */
  lotteryWindow: 20,
  /** Ambang likuiditas: rata-rata nilai transaksi 20 hari, sesi terakhir. */
  minimumAvgTradedValue20d: 1_000_000_000,
  /** Jumlah baris yang ditampilkan di halaman. */
  displayLimit: 80,
} as const;

export type RiskProfileStatus = 'OK' | 'INSUFFICIENT_DATA';

export interface RiskProfileRow {
  ticker: string;
  status: RiskProfileStatus;
  sessions: number;
  lastDate: string | null;
  close: number | null;
  /** Simpangan baku imbal hasil harian 60 sesi, dalam persen. */
  volatility60Pct: number | null;
  volatility20Pct: number | null;
  /** Jarak dari penutupan tertinggi 252 sesi, dalam persen (0% = tepat di puncak). */
  distanceFromHigh52wPct: number | null;
  /** Puncak imbal hasil harian 20 sesi, dalam persen. */
  maxDailyReturn20Pct: number | null;
  /** Rata-rata nilai transaksi 20 hari pada sesi terakhir (rupiah). */
  avgTradedValue20d: number | null;
  /** Peringkat persentil 0-100 untuk volatilitas rendah (100 = paling tenang). */
  percentileVolatility: number | null;
  /** Peringkat persentil 0-100 untuk kedekatan ke puncak 52 minggu (100 = paling dekat). */
  percentileProximity: number | null;
  /** Rata-rata dua peringkat di atas, 0-100. */
  compositePercentile: number | null;
  /** Kalimat apa adanya; menjelaskan angka atau sebab tidak tersedia. */
  note: string;
}

export interface RiskProfileData {
  lastSession: string | null;
  evaluated: number;
  eligible: number;
  belowLiquidity: number;
  insufficient: number;
  rows: RiskProfileRow[];
}

export interface RiskPriceRow {
  ticker: string;
  date: string;
  close: number;
  avgValue20d: number | null;
}

type RiskProfileQuery = (text: string, params?: unknown[]) => Promise<{ rows: RiskPriceRow[] }>;

const defaultQuery: RiskProfileQuery = (text, params) => queryReadWithRetry(text, params);

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Simpangan baku contoh (n-1) dari imbal hasil harian berbasis logaritma, dalam persen. */
export function stdevOfLogReturnsPct(closes: number[]): number | null {
  if (closes.length < 3) return null;
  const returns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1];
    const current = closes[index];
    if (previous <= 0 || current <= 0) continue;
    returns.push(Math.log(current / previous));
  }
  if (returns.length < 2) return null;
  const average = mean(returns);
  if (average === null) return null;
  const variance = returns.reduce((total, value) => total + (value - average) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * 100;
}

/** Volatilitas dari `window` sesi terakhir. */
export function volatilityPct(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null;
  return stdevOfLogReturnsPct(closes.slice(-(window + 1)));
}

/** Jarak penutupan terakhir dari penutupan tertinggi `window` sesi terakhir, dalam persen. */
export function distanceFromHighPct(closes: number[], window: number): number | null {
  if (closes.length < window) return null;
  const slice = closes.slice(-window);
  let peak = -Infinity;
  for (const value of slice) if (value > peak) peak = value;
  const last = closes[closes.length - 1];
  if (!Number.isFinite(peak) || peak <= 0 || !Number.isFinite(last)) return null;
  return (last / peak - 1) * 100;
}

/** Puncak imbal hasil harian pada `window` sesi terakhir, dalam persen. */
export function maxDailyReturnPct(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null;
  const slice = closes.slice(-(window + 1));
  let peak = -Infinity;
  for (let index = 1; index < slice.length; index += 1) {
    const previous = slice[index - 1];
    const current = slice[index];
    if (previous <= 0 || current <= 0) continue;
    const value = Math.log(current / previous);
    if (value > peak) peak = value;
  }
  if (!Number.isFinite(peak)) return null;
  return peak * 100;
}

/**
 * Peringkat persentil 0-100 untuk setiap nilai (rata-rata peringkat untuk nilai seri).
 * Arti: "persen emiten lain yang lebih buruk menurut ciri ini". Karena itu:
 *   higherIsBetter = true  → nilai terbesar dapat 100
 *   higherIsBetter = false → nilai terkecil dapat 100 (mis. volatilitas rendah)
 */
export function percentileRanks(values: number[], higherIsBetter: boolean): number[] {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length).fill(0);
  const denominator = Math.max(values.length - 1, 1);
  let position = 0;
  while (position < order.length) {
    let end = position;
    while (end + 1 < order.length && order[end + 1].value === order[position].value) end += 1;
    const averagePosition = (position + end) / 2;
    const share = averagePosition / denominator;
    const percentile = (higherIsBetter ? share : 1 - share) * 100;
    for (let index = position; index <= end; index += 1) ranks[order[index].index] = percentile;
    position = end + 1;
  }
  return ranks;
}

interface TickerSeries {
  ticker: string;
  dates: string[];
  closes: number[];
  lastAvgValue: number | null;
}

function groupSeries(rows: RiskPriceRow[]): TickerSeries[] {
  const byTicker = new Map<string, TickerSeries>();
  for (const row of rows) {
    const existing = byTicker.get(row.ticker);
    if (existing) {
      existing.dates.push(row.date);
      existing.closes.push(row.close);
      existing.lastAvgValue = row.avgValue20d ?? existing.lastAvgValue;
    } else {
      byTicker.set(row.ticker, {
        ticker: row.ticker,
        dates: [row.date],
        closes: [row.close],
        lastAvgValue: row.avgValue20d ?? null,
      });
    }
  }
  return [...byTicker.values()];
}

export async function getRiskProfileData(query: RiskProfileQuery = defaultQuery): Promise<RiskProfileData> {
  const rows = (
    await query(
      `with sesi as (
         select max(date) as terakhir from lens_radar_history
       ),
       unik as (
         select distinct on (ticker, date)
                ticker, date, coalesce(adjusted_close_price, close_price)::float8 as close,
                avg_value_20d::float8 as avg_value
           from lens_radar_history
          where date <= (select terakhir from sesi)
          order by ticker, date desc, calculation_timestamp desc nulls last, updated_at desc
       ),
       deret as (
         select ticker, date, close, avg_value,
                row_number() over (partition by ticker order by date desc) as urutan
           from unik
       )
       select ticker,
              date::text as date,
              close,
              avg_value as "avgValue20d"
         from deret
        where urutan <= $1
        order by ticker asc, date asc`,
      [RISK_PROFILE_OPTIONS.highWindow + 8]
    )
  ).rows;

  if (!rows.length) {
    return { lastSession: null, evaluated: 0, eligible: 0, belowLiquidity: 0, insufficient: 0, rows: [] };
  }

  const series = groupSeries(rows);
  const lastSession = rows[rows.length - 1]?.date ?? null;

  const eligible: RiskProfileRow[] = [];
  let insufficient = 0;
  let belowLiquidity = 0;

  for (const item of series) {
    const lastDate = item.dates[item.dates.length - 1] ?? null;
    const close = item.closes[item.closes.length - 1] ?? null;
    const volatility60 = volatilityPct(item.closes, RISK_PROFILE_OPTIONS.volatilityWindow);
    const volatility20 = volatilityPct(item.closes, RISK_PROFILE_OPTIONS.volatilityShortWindow);
    const distance = distanceFromHighPct(item.closes, RISK_PROFILE_OPTIONS.highWindow);
    const lottery = maxDailyReturnPct(item.closes, RISK_PROFILE_OPTIONS.lotteryWindow);

    const base: RiskProfileRow = {
      ticker: item.ticker,
      status: 'OK',
      sessions: item.closes.length,
      lastDate,
      close,
      volatility60Pct: volatility60,
      volatility20Pct: volatility20,
      distanceFromHigh52wPct: distance,
      maxDailyReturn20Pct: lottery,
      avgTradedValue20d: item.lastAvgValue,
      percentileVolatility: null,
      percentileProximity: null,
      compositePercentile: null,
      note: '',
    };

    if (item.closes.length < RISK_PROFILE_OPTIONS.minimumSessions || volatility60 === null || distance === null) {
      insufficient += 1;
      base.status = 'INSUFFICIENT_DATA';
      base.note = `riwayat ${item.closes.length} sesi — belum cukup untuk puncak ${RISK_PROFILE_OPTIONS.highWindow} sesi`;
      continue;
    }

    if ((item.lastAvgValue ?? 0) < RISK_PROFILE_OPTIONS.minimumAvgTradedValue20d) {
      belowLiquidity += 1;
      base.note = `nilai transaksi 20 hari di bawah ambang Rp ${(RISK_PROFILE_OPTIONS.minimumAvgTradedValue20d / 1e9).toFixed(0)} miliar — tidak diperingkat`;
      continue;
    }

    eligible.push(base);
  }

  const volatilityRanks = percentileRanks(
    eligible.map((row) => row.volatility60Pct as number),
    false
  );
  const proximityRanks = percentileRanks(
    eligible.map((row) => row.distanceFromHigh52wPct as number),
    true
  );
  eligible.forEach((row, index) => {
    row.percentileVolatility = Math.round(volatilityRanks[index]);
    row.percentileProximity = Math.round(proximityRanks[index]);
    row.compositePercentile = Math.round((volatilityRanks[index] + proximityRanks[index]) / 2);
  });

  const rowsOut = [...eligible]
    .sort((a, b) => (b.compositePercentile as number) - (a.compositePercentile as number))
    .slice(0, RISK_PROFILE_OPTIONS.displayLimit);

  return {
    lastSession,
    evaluated: series.length,
    eligible: eligible.length,
    belowLiquidity,
    insufficient,
    rows: rowsOut,
  };
}
