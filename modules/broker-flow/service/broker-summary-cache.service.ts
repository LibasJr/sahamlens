import { pool } from '@/shared/database/postgres.client';

const SOURCE = 'INDEX_ALPHA_API';

function normalizeTicker(value: string): string {
  const code = value.trim().toUpperCase().replace(/\.JK$/, '');
  return /^[A-Z0-9]{1,12}$/.test(code) ? `${code}.JK` : '';
}

export async function getCachedBrokerTickers(tradeDate: string, tickers: string[]): Promise<Set<string>> {
  const normalized = tickers.map(normalizeTicker).filter(Boolean);
  if (!normalized.length) return new Set();
  try {
    const result = await pool.query(
      `SELECT DISTINCT ticker FROM broker_summary_daily
       WHERE trade_date = $1::date AND source = $2 AND ticker = ANY($3::text[])`,
      [tradeDate, SOURCE, normalized],
    );
    return new Set(result.rows.map((row: { ticker: string }) => row.ticker.replace(/\.JK$/, '')));
  } catch (error: any) {
    if (error?.code === '42P01') return new Set();
    throw error;
  }
}

export type BrokerFlowBadge = { netValue: number; tradeDate: string };

export async function getBrokerFlowBadges(tickers: string[]): Promise<Record<string, BrokerFlowBadge>> {
  const normalized = tickers.map(normalizeTicker).filter(Boolean);
  if (!normalized.length) return {};
  try {
    // Broker dengan arus bersih absolut terbesar dipakai sebagai proxy pelaku dominan.
    // Menjumlahkan seluruh broker akan mendekati nol karena setiap beli memiliki penjual.
    const result = await pool.query(
      `WITH latest AS (
         SELECT ticker, MAX(trade_date) AS trade_date
         FROM broker_summary_daily WHERE source = $1 AND ticker = ANY($2::text[]) GROUP BY ticker
       ), ranked AS (
         SELECT d.ticker, d.trade_date, (d.buy_value - d.sell_value)::float8 AS net_value,
                ROW_NUMBER() OVER (PARTITION BY d.ticker ORDER BY ABS(d.buy_value - d.sell_value) DESC) AS rn
         FROM broker_summary_daily d JOIN latest l ON l.ticker=d.ticker AND l.trade_date=d.trade_date
         WHERE d.source = $1
       ) SELECT ticker, trade_date, net_value FROM ranked WHERE rn = 1`,
      [SOURCE, normalized],
    );
    return Object.fromEntries(result.rows.map((row: any) => [
      String(row.ticker).replace(/\.JK$/, ''),
      { netValue: Number(row.net_value) || 0, tradeDate: String(row.trade_date).slice(0, 10) },
    ]));
  } catch (error: any) {
    if (error?.code === '42P01') return {};
    throw error;
  }
}
