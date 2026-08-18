import { queryReadWithRetry } from '@/shared/database/postgres.client';

// Pembacaan EOD Broker Summary tingkat PASAR (tabel broker_market_daily, diisi oleh
// scripts/import-broker-market-daily.mjs dari CSV resmi BEI).
//
// Beda tegas dari broker-summary-monitor.service.ts: yang itu memantau transaksi broker
// PER EMITEN dengan beli/jual terpisah. Di sini tidak ada emiten dan tidak ada beli/jual
// - endpoint BEI TradingSummary/GetBrokerSummary memang tidak menyediakannya. Jangan
// menambahkan kolom "net buy" atau "top buyer per saham" di modul ini: angka seperti itu
// tidak ada di sumbernya dan hanya bisa muncul dari karangan.

export const BROKER_MARKET_SOURCE = 'IDX_OFFICIAL_API';

const MAX_HISTORY_DATES = 30;

export interface BrokerMarketDateSummary {
  tradeDate: string;
  brokerCount: number;
  totalValue: number;
  lastImportedAt: string | null;
}

export interface BrokerMarketRow {
  brokerCode: string;
  brokerName: string | null;
  volume: number;
  value: number;
  frequency: number;
  /** Porsi nilai transaksi broker ini terhadap total seluruh broker pada hari itu, persen. */
  valueSharePct: number | null;
}

export interface BrokerMarketDaily {
  source: string;
  /** false kalau migration 009 belum dijalankan di database ini. */
  tableReady: boolean;
  dates: BrokerMarketDateSummary[];
  selectedDate: string | null;
  coverage: {
    brokerCount: number;
    totalVolume: number;
    totalValue: number;
    totalFrequency: number;
    lastImportedAt: string | null;
  };
  brokers: BrokerMarketRow[];
}

interface DateRow {
  trade_date: string;
  broker_count: number | string;
  total_value: number | string;
  last_imported_at: string | null;
}

interface CoverageRow {
  broker_count: number | string;
  total_volume: number | string;
  total_value: number | string;
  total_frequency: number | string;
  last_imported_at: string | null;
}

interface BrokerRow {
  broker_code: string;
  broker_name: string | null;
  volume: number | string;
  value: number | string;
  frequency: number | string;
}

/** Postgres mengembalikan BIGINT/NUMERIC sebagai string - dikonversi eksplisit supaya
 * tidak ada penjumlahan string yang diam-diam menghasilkan angka ngawur. */
function numberValue(raw: number | string | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function emptyResult(tableReady: boolean): BrokerMarketDaily {
  return {
    source: BROKER_MARKET_SOURCE,
    tableReady,
    dates: [],
    selectedDate: null,
    coverage: {
      brokerCount: 0,
      totalVolume: 0,
      totalValue: 0,
      totalFrequency: 0,
      lastImportedAt: null,
    },
    brokers: [],
  };
}

/** Validasi tanggal dari query string sebelum dipakai - format ketat YYYY-MM-DD. */
export function normalizeBrokerMarketDate(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function getBrokerMarketDaily(
  input: { date?: string | null } = {}
): Promise<BrokerMarketDaily> {
  const tableCheck = await queryReadWithRetry<{ table_name: string | null }>(
    `SELECT to_regclass('public.broker_market_daily')::text AS table_name`
  );
  if (!tableCheck.rows[0]?.table_name) return emptyResult(false);

  const dateResult = await queryReadWithRetry<DateRow>(
    `
      SELECT
        TO_CHAR(trade_date, 'YYYY-MM-DD') AS trade_date,
        COUNT(DISTINCT broker_code)::int AS broker_count,
        SUM(value)::numeric AS total_value,
        MAX(imported_at)::text AS last_imported_at
      FROM broker_market_daily
      WHERE source = $1
      GROUP BY trade_date
      ORDER BY trade_date DESC
      LIMIT $2
    `,
    [BROKER_MARKET_SOURCE, MAX_HISTORY_DATES]
  );

  const dates = dateResult.rows.map((row) => ({
    tradeDate: row.trade_date,
    brokerCount: numberValue(row.broker_count),
    totalValue: numberValue(row.total_value),
    lastImportedAt: row.last_imported_at,
  }));

  if (dates.length === 0) return emptyResult(true);

  const requested = normalizeBrokerMarketDate(input.date);
  const selectedDate = requested && dates.some((d) => d.tradeDate === requested) ? requested : dates[0]!.tradeDate;

  const [coverageResult, brokerResult] = await Promise.all([
    queryReadWithRetry<CoverageRow>(
      `
        SELECT
          COUNT(DISTINCT broker_code)::int AS broker_count,
          SUM(volume)::numeric AS total_volume,
          SUM(value)::numeric AS total_value,
          SUM(frequency)::numeric AS total_frequency,
          MAX(imported_at)::text AS last_imported_at
        FROM broker_market_daily
        WHERE trade_date = $1::date AND source = $2
      `,
      [selectedDate, BROKER_MARKET_SOURCE]
    ),
    queryReadWithRetry<BrokerRow>(
      `
        SELECT broker_code, broker_name, volume, value, frequency
        FROM broker_market_daily
        WHERE trade_date = $1::date AND source = $2
        ORDER BY value DESC
      `,
      [selectedDate, BROKER_MARKET_SOURCE]
    ),
  ]);

  const coverageRow = coverageResult.rows[0];
  const totalValue = numberValue(coverageRow?.total_value);

  return {
    source: BROKER_MARKET_SOURCE,
    tableReady: true,
    dates,
    selectedDate,
    coverage: {
      brokerCount: numberValue(coverageRow?.broker_count),
      totalVolume: numberValue(coverageRow?.total_volume),
      totalValue,
      totalFrequency: numberValue(coverageRow?.total_frequency),
      lastImportedAt: coverageRow?.last_imported_at ?? null,
    },
    brokers: brokerResult.rows.map((row) => {
      const value = numberValue(row.value);
      return {
        brokerCode: row.broker_code,
        brokerName: row.broker_name,
        volume: numberValue(row.volume),
        value,
        frequency: numberValue(row.frequency),
        valueSharePct: totalValue > 0 ? parseFloat(((value / totalValue) * 100).toFixed(2)) : null,
      };
    }),
  };
}
