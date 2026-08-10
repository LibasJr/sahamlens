import { pool } from '@/shared/database/postgres.client';

export interface BrokerPeriodViewRow {
  brokerCode: string;
  brokerType: string | null;
  buyValue: number;
  sellValue: number;
  netValue: number;
}

export interface BrokerPeriodView {
  ticker: string;
  startDate: string;
  endDate: string;
  asOfDate: string;
  source: string;
  importedAt: string | null;
  rows: BrokerPeriodViewRow[];
  totalBuyValue: number;
  totalSellValue: number;
  netSubsetValue: number;
}

function normalizeTicker(raw: string): string {
  const code = raw.trim().toUpperCase().replace(/\.JK$/, '');
  return /^[A-Z0-9]{1,12}$/.test(code) ? `${code}.JK` : '';
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
}

export async function getLatestBrokerPeriodSummary(rawTicker: string): Promise<BrokerPeriodView | null> {
  const ticker = normalizeTicker(rawTicker);
  if (!ticker) return null;

  try {
    const latest = await pool.query(
      `SELECT start_date, end_date, as_of_date, source, imported_at
       FROM broker_summary_period
       WHERE ticker = $1
       ORDER BY end_date DESC, start_date DESC, imported_at DESC
       LIMIT 1`,
      [ticker],
    );

    if (!latest.rows.length) return null;
    const meta = latest.rows[0]!;
    const startDate = asDate(meta.start_date);
    const endDate = asDate(meta.end_date);
    const source = String(meta.source ?? 'UNKNOWN');

    const result = await pool.query(
      `SELECT broker_code, broker_type, buy_value, sell_value, net_value
       FROM broker_summary_period
       WHERE ticker = $1
         AND start_date = $2::date
         AND end_date = $3::date
         AND source = $4
       ORDER BY ABS(net_value) DESC, broker_code ASC`,
      [ticker, startDate, endDate, source],
    );

    const rows: BrokerPeriodViewRow[] = result.rows.map((row: any) => ({
      brokerCode: String(row.broker_code ?? ''),
      brokerType: row.broker_type ? String(row.broker_type) : null,
      buyValue: asNumber(row.buy_value),
      sellValue: asNumber(row.sell_value),
      netValue: asNumber(row.net_value),
    }));

    return {
      ticker,
      startDate,
      endDate,
      asOfDate: asDate(meta.as_of_date),
      source,
      importedAt: meta.imported_at instanceof Date ? meta.imported_at.toISOString() : meta.imported_at ? String(meta.imported_at) : null,
      rows,
      totalBuyValue: rows.reduce((sum, row) => sum + row.buyValue, 0),
      totalSellValue: rows.reduce((sum, row) => sum + row.sellValue, 0),
      netSubsetValue: rows.reduce((sum, row) => sum + row.netValue, 0),
    };
  } catch (error: any) {
    // Instalasi lama yang belum pernah mengimpor Broker Distribution belum punya tabel ini.
    if (error?.code === '42P01') return null;
    console.error('[broker-period-query] failed', error);
    return null;
  }
}
