import { queryReadWithRetry } from '@/shared/database/postgres.client';

/**
 * Pemindai Harga Masuk - level harga yang dihitung dari arsip harga SahamLens sendiri.
 *
 * Semua angka di sini turunan langsung dari arsip (lens_radar_history: adjusted close
 * per sesi). Tidak ada angka dari luar, tidak ada taksiran analis, tidak ada nilai
 * pengganti saat data kurang. Kalau sesi yang tersedia tidak cukup, hasilnya
 * INSUFFICIENT_DATA dan halaman menyatakannya apa adanya.
 *
 * Batas yang dinyatakan terbuka:
 *  - Volatilitas di sini volatilitas penutupan-ke-penutupan (close-to-close), bukan ATR
 *    intraday, karena arsip tidak menyimpan high/low.
 *  - Level support/resistance adalah nilai penutupan terendah/tertinggi pada jendela
 *    pengamatan, bukan garis teori apa pun.
 *  - Rasio risiko/imbal adalah aritmetika murni dari tiga angka di atas.
 */

export const ENTRY_SCAN_OPTIONS = {
  /** Jumlah sesi minimum agar level dan volatilitas punya dasar. */
  minimumSessions: 60,
  /** Jendela untuk mencari level penutupan terendah/tertinggi. */
  levelWindow: 20,
  /** Jendela untuk menghitung volatilitas harian. */
  volatilityWindow: 20,
  /** Jarak henti rugi diukur dalam kelipatan volatilitas harian. */
  stopVolatilityMultiple: 2,
} as const;

export type EntryScanStatus = 'OK' | 'INSUFFICIENT_DATA';

export interface EntryScanResult {
  ticker: string;
  status: EntryScanStatus;
  sessions: number;
  lastDate: string | null;
  lastClose: number | null;
  support: number | null;
  resistance: number | null;
  volatilityPct: number | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  riskReward: number | null;
  /** Kalimat alasan apa adanya; menjelaskan angka atau sebab tidak tersedia. */
  note: string;
}

export interface EntryScanRow {
  ticker: string;
  date: string;
  close: number;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Simpangan baku contoh (n-1) dari imbal hasil harian berbasis logaritma. */
export function stdevOfLogReturns(closes: number[]): number | null {
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
  return Math.sqrt(variance);
}

/**
 * Menghitung level harga masuk dari deret penutupan satu emiten.
 * `closes` harus urut dari sesi terlama ke terbaru.
 */
export function buildEntryScan(ticker: string, closes: number[], dates: string[]): EntryScanResult {
  const sessions = closes.length;
  const empty: EntryScanResult = {
    ticker,
    status: 'INSUFFICIENT_DATA',
    sessions,
    lastDate: null,
    lastClose: null,
    support: null,
    resistance: null,
    volatilityPct: null,
    entry: null,
    stop: null,
    target: null,
    riskReward: null,
    note: '',
  };

  if (sessions < ENTRY_SCAN_OPTIONS.minimumSessions) {
    return {
      ...empty,
      note: `Arsip hanya memuat ${sessions} sesi untuk emiten ini; minimal ${ENTRY_SCAN_OPTIONS.minimumSessions} sesi agar level dan volatilitas punya dasar.`,
    };
  }

  const lastClose = closes[sessions - 1];
  const lastDate = dates[sessions - 1] ?? null;
  const levelSlice = closes.slice(-ENTRY_SCAN_OPTIONS.levelWindow);
  const support = Math.min(...levelSlice);
  const resistance = Math.max(...levelSlice);
  const volatility = stdevOfLogReturns(closes.slice(-ENTRY_SCAN_OPTIONS.volatilityWindow));

  if (!Number.isFinite(lastClose) || volatility === null) {
    return { ...empty, lastDate, lastClose, note: 'Arsip tidak memberi penutupan atau volatilitas yang bisa dihitung untuk emiten ini.' };
  }

  const entry = support;
  const stop = support * (1 - ENTRY_SCAN_OPTIONS.stopVolatilityMultiple * volatility);
  const target = resistance;
  const risk = entry - stop;
  const reward = target - entry;

  let riskReward: number | null = null;
  let note: string;
  if (risk <= 0) {
    note = 'Harga henti rugi tidak berada di bawah level masuk, jadi rasio risiko/imbal tidak dapat dihitung.';
  } else if (reward <= 0) {
    note = 'Level penutupan tertinggi jendela tidak berada di atas level masuk, jadi rasio risiko/imbal tidak dapat dihitung.';
  } else {
    riskReward = reward / risk;
    note = `Level dari penutupan terendah/tertinggi ${ENTRY_SCAN_OPTIONS.levelWindow} sesi; henti rugi ${ENTRY_SCAN_OPTIONS.stopVolatilityMultiple} kali volatilitas harian.`;
  }

  return {
    ticker,
    status: 'OK',
    sessions,
    lastDate,
    lastClose,
    support,
    resistance,
    volatilityPct: volatility * 100,
    entry,
    stop,
    target,
    riskReward,
    note,
  };
}

export interface EntryScanData {
  date: string | null;
  options: typeof ENTRY_SCAN_OPTIONS;
  /** Emiten dengan rasio risiko/imbal terhitung, urut dari terbesar. */
  rows: EntryScanResult[];
  /** Emiten yang arsipnya belum cukup; ditampilkan terpisah, bukan disamarkan. */
  insufficient: EntryScanResult[];
  totalTickers: number;
}

export type EntryScanQuery = (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

const defaultQuery: EntryScanQuery = (text, params) => queryReadWithRetry(text, params);

export async function getEntryScanData(query: EntryScanQuery = defaultQuery): Promise<EntryScanData> {
  const result = await query(
    `with batas as (
       select max(date) as sesi_terakhir from lens_radar_history
     ),
     deret as (
       select h.ticker,
              h.date::text as tanggal,
              coalesce(h.adjusted_close_price, h.close_price)::float8 as penutupan,
              row_number() over (partition by h.ticker order by h.date desc) as urutan
         from lens_radar_history h, batas
        where h.date >= batas.sesi_terakhir - interval '200 days'
          and coalesce(h.adjusted_close_price, h.close_price) is not null
     )
     select ticker, tanggal, penutupan, urutan
       from deret
      where urutan <= 120
      order by ticker, tanggal`
  );

  const series = new Map<string, { dates: string[]; closes: number[] }>();
  for (const row of result.rows) {
    const ticker = String(row.ticker);
    const date = String(row.tanggal);
    const close = Number(row.penutupan);
    if (!Number.isFinite(close)) continue;
    const bucket = series.get(ticker) ?? { dates: [], closes: [] };
    bucket.dates.push(date);
    bucket.closes.push(close);
    series.set(ticker, bucket);
  }

  const evaluated: EntryScanResult[] = [];
  for (const [ticker, bucket] of series.entries()) {
    evaluated.push(buildEntryScan(ticker, bucket.closes, bucket.dates));
  }

  const rows = evaluated
    .filter((row) => row.status === 'OK' && row.riskReward !== null)
    .sort((left, right) => (right.riskReward ?? 0) - (left.riskReward ?? 0) || left.ticker.localeCompare(right.ticker));
  const insufficient = evaluated
    .filter((row) => row.status === 'INSUFFICIENT_DATA' || row.riskReward === null)
    .sort((left, right) => left.ticker.localeCompare(right.ticker));

  const dateResult = await query(`select max(date)::text as sesi_terakhir from lens_radar_history`);
  const date = (dateResult.rows[0]?.sesi_terakhir as string | null) ?? null;

  return { date, options: ENTRY_SCAN_OPTIONS, rows, insufficient, totalTickers: series.size };
}