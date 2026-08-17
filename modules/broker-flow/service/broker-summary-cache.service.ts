import { pool } from '@/shared/database/postgres.client';
import { PUBLIC_BROKER_DAILY_SOURCE } from './broker-summary-integrity';

const SOURCE = PUBLIC_BROKER_DAILY_SOURCE;

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

export type BrokerFlowBadge = { brokerCode: string; netValue: number; tradeDate: string };

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
         SELECT d.ticker, d.trade_date, d.broker_code, (d.buy_value - d.sell_value)::float8 AS net_value,
                ROW_NUMBER() OVER (PARTITION BY d.ticker ORDER BY ABS(d.buy_value - d.sell_value) DESC) AS rn
         FROM broker_summary_daily d JOIN latest l ON l.ticker=d.ticker AND l.trade_date=d.trade_date
         WHERE d.source = $1
       ) SELECT ticker, trade_date, broker_code, net_value FROM ranked WHERE rn = 1`,
      [SOURCE, normalized],
    );
    const entries: Array<[string, BrokerFlowBadge]> = [];
    for (const row of result.rows) {
      const netValue = Number((row as any).net_value);
      const brokerCode = String((row as any).broker_code ?? '').trim().toUpperCase();
      if (!Number.isFinite(netValue) || !brokerCode) continue;
      entries.push([
        String((row as any).ticker).replace(/\.JK$/, ''),
        { brokerCode, netValue, tradeDate: String((row as any).trade_date).slice(0, 10) },
      ]);
    }
    return Object.fromEntries(entries);
  } catch (error: any) {
    if (error?.code === '42P01') return {};
    throw error;
  }
}
