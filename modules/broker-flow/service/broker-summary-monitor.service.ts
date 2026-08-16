import { queryReadWithRetry } from '@/shared/database/postgres.client';
import { getLastRun, type JobRunLog } from '@/shared/scheduler/job-run-log.repository';

const AUTOMATED_SOURCE = 'INDEX_ALPHA_API';
const MAX_HISTORY_DATES = 31;
const MAX_BROKER_ROWS = 50;

interface DateSummaryRow {
  trade_date: string;
  row_count: number | string;
  ticker_count: number | string;
  broker_count: number | string;
  last_imported_at: string | null;
}

interface CoverageRow {
  row_count: number | string;
  ticker_count: number | string;
  broker_count: number | string;
  total_buy_value: number | string | null;
  total_sell_value: number | string | null;
  total_buy_volume: number | string | null;
  total_sell_volume: number | string | null;
  total_buy_frequency: number | string | null;
  total_sell_frequency: number | string | null;
  last_imported_at: string | null;
}

interface BrokerAggregateRow {
  broker_code: string;
  buy_value: number | string;
  sell_value: number | string;
  buy_volume: number | string;
  sell_volume: number | string;
  buy_frequency: number | string;
  sell_frequency: number | string;
  net_value: number | string;
}

export interface BrokerMonitorDateSummary {
  tradeDate: string;
  rowCount: number;
  tickerCount: number;
  brokerCount: number;
  lastImportedAt: string | null;
}

export interface BrokerMonitorRow {
  brokerCode: string;
  buyValue: number;
  sellValue: number;
  buyVolume: number;
  sellVolume: number;
  buyFrequency: number;
  sellFrequency: number;
  avgBuyValuePerTrade: number | null;
  avgSellValuePerTrade: number | null;
  netValue: number;
}

export interface BrokerSummaryMonitor {
  source: typeof AUTOMATED_SOURCE;
  tableReady: boolean;
  job: JobRunLog | null;
  dates: BrokerMonitorDateSummary[];
  selectedDate: string | null;
  selectedTicker: string | null;
  availableTickers: string[];
  coverage: {
    rowCount: number;
    tickerCount: number;
    brokerCount: number;
    totalBuyValue: number;
    totalSellValue: number;
    totalBuyVolume: number;
    totalSellVolume: number;
    totalBuyFrequency: number;
    totalSellFrequency: number;
    lastImportedAt: string | null;
  };
  brokers: BrokerMonitorRow[];
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeBrokerMonitorTicker(value: string | null | undefined): string | null {
  const ticker = (value ?? '').trim().toUpperCase().replace(/\.JK$/i, '');
  if (!ticker) return null;
  return /^[A-Z][A-Z0-9-]{0,9}$/.test(ticker) ? ticker : null;
}

function emptyMonitor(job: JobRunLog | null): BrokerSummaryMonitor {
  return {
    source: AUTOMATED_SOURCE,
    tableReady: false,
    job,
    dates: [],
    selectedDate: null,
    selectedTicker: null,
    availableTickers: [],
    coverage: {
      rowCount: 0,
      tickerCount: 0,
      brokerCount: 0,
      totalBuyValue: 0,
      totalSellValue: 0,
      totalBuyVolume: 0,
      totalSellVolume: 0,
      totalBuyFrequency: 0,
      totalSellFrequency: 0,
      lastImportedAt: null,
    },
    brokers: [],
  };
}

export async function getBrokerSummaryMonitor(input: {
  date?: string | null;
  ticker?: string | null;
} = {}): Promise<BrokerSummaryMonitor> {
  const [job, tableCheck] = await Promise.all([
    getLastRun('broker-summary-scan'),
    queryReadWithRetry<{ table_name: string | null }>(
      `SELECT to_regclass('public.broker_summary_daily')::text AS table_name`,
    ),
  ]);

  if (!tableCheck.rows[0]?.table_name) return emptyMonitor(job);

  const dateResult = await queryReadWithRetry<DateSummaryRow>(
    `
      SELECT
        trade_date::text AS trade_date,
        COUNT(*)::int AS row_count,
        COUNT(DISTINCT ticker)::int AS ticker_count,
        COUNT(DISTINCT broker_code)::int AS broker_count,
        MAX(imported_at)::text AS last_imported_at
      FROM broker_summary_daily
      WHERE source = $1
      GROUP BY trade_date
      ORDER BY trade_date DESC
      LIMIT $2
    `,
    [AUTOMATED_SOURCE, MAX_HISTORY_DATES],
  );

  const dates = dateResult.rows.map((row) => ({
    tradeDate: row.trade_date,
    rowCount: numberValue(row.row_count),
    tickerCount: numberValue(row.ticker_count),
    brokerCount: numberValue(row.broker_count),
    lastImportedAt: row.last_imported_at,
  }));
  if (dates.length === 0) {
    return { ...emptyMonitor(job), tableReady: true };
  }

  const requestedDate = typeof input.date === 'string' && dates.some((item) => item.tradeDate === input.date)
    ? input.date
    : dates[0]!.tradeDate;
  const selectedTicker = normalizeBrokerMonitorTicker(input.ticker);

  const [tickerResult, coverageResult, brokerResult] = await Promise.all([
    queryReadWithRetry<{ ticker: string }>(
      `
        SELECT DISTINCT ticker
        FROM broker_summary_daily
        WHERE source = $1 AND trade_date = $2
        ORDER BY ticker
      `,
      [AUTOMATED_SOURCE, requestedDate],
    ),
    queryReadWithRetry<CoverageRow>(
      `
        SELECT
          COUNT(*)::int AS row_count,
          COUNT(DISTINCT ticker)::int AS ticker_count,
          COUNT(DISTINCT broker_code)::int AS broker_count,
          COALESCE(SUM(buy_value), 0)::text AS total_buy_value,
          COALESCE(SUM(sell_value), 0)::text AS total_sell_value,
          COALESCE(SUM(buy_volume), 0)::text AS total_buy_volume,
          COALESCE(SUM(sell_volume), 0)::text AS total_sell_volume,
          COALESCE(SUM(buy_frequency), 0)::text AS total_buy_frequency,
          COALESCE(SUM(sell_frequency), 0)::text AS total_sell_frequency,
          MAX(imported_at)::text AS last_imported_at
        FROM broker_summary_daily
        WHERE source = $1
          AND trade_date = $2
          AND ($3::text IS NULL OR ticker = $3)
      `,
      [AUTOMATED_SOURCE, requestedDate, selectedTicker],
    ),
    queryReadWithRetry<BrokerAggregateRow>(
      `
        SELECT
          broker_code,
          COALESCE(SUM(buy_value), 0)::text AS buy_value,
          COALESCE(SUM(sell_value), 0)::text AS sell_value,
          COALESCE(SUM(buy_volume), 0)::text AS buy_volume,
          COALESCE(SUM(sell_volume), 0)::text AS sell_volume,
          COALESCE(SUM(buy_frequency), 0)::text AS buy_frequency,
          COALESCE(SUM(sell_frequency), 0)::text AS sell_frequency,
          COALESCE(SUM(buy_value - sell_value), 0)::text AS net_value
        FROM broker_summary_daily
        WHERE source = $1
          AND trade_date = $2
          AND ($3::text IS NULL OR ticker = $3)
        GROUP BY broker_code
        ORDER BY ABS(SUM(buy_value - sell_value)) DESC, broker_code
        LIMIT $4
      `,
      [AUTOMATED_SOURCE, requestedDate, selectedTicker, MAX_BROKER_ROWS],
    ),
  ]);

  const coverageRow = coverageResult.rows[0];
  return {
    source: AUTOMATED_SOURCE,
    tableReady: true,
    job,
    dates,
    selectedDate: requestedDate,
    selectedTicker,
    availableTickers: tickerResult.rows.map((row) => row.ticker),
    coverage: {
      rowCount: numberValue(coverageRow?.row_count),
      tickerCount: numberValue(coverageRow?.ticker_count),
      brokerCount: numberValue(coverageRow?.broker_count),
      totalBuyValue: numberValue(coverageRow?.total_buy_value),
      totalSellValue: numberValue(coverageRow?.total_sell_value),
      totalBuyVolume: numberValue(coverageRow?.total_buy_volume),
      totalSellVolume: numberValue(coverageRow?.total_sell_volume),
      totalBuyFrequency: numberValue(coverageRow?.total_buy_frequency),
      totalSellFrequency: numberValue(coverageRow?.total_sell_frequency),
      lastImportedAt: coverageRow?.last_imported_at ?? null,
    },
    brokers: brokerResult.rows.map((row) => {
      const buyValue = numberValue(row.buy_value);
      const sellValue = numberValue(row.sell_value);
      const buyFrequency = numberValue(row.buy_frequency);
      const sellFrequency = numberValue(row.sell_frequency);
      return {
        brokerCode: row.broker_code,
        buyValue,
        sellValue,
        buyVolume: numberValue(row.buy_volume),
        sellVolume: numberValue(row.sell_volume),
        buyFrequency,
        sellFrequency,
        avgBuyValuePerTrade: buyFrequency > 0 ? buyValue / buyFrequency : null,
        avgSellValuePerTrade: sellFrequency > 0 ? sellValue / sellFrequency : null,
        netValue: numberValue(row.net_value),
      };
    }),
  };
}
