import { pool } from '../../../shared/database/postgres.client';

export interface BankFundamentalSnapshot {
  ticker: string;
  observedDate: string;
  periodEnd: string;
  publishedAt: string | null;
  nimPct: number | null;
  nplGrossPct: number | null;
  nplNetPct: number | null;
  casaPct: number | null;
  carPct: number | null;
  ldrPct: number | null;
  costOfCreditPct: number | null;
  costToIncomePct: number | null;
  coverageRatioPct: number | null;
  ppopIdr: number | null;
  source: string;
  sourceUrl: string;
}

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function date(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
function mapRow(row: Record<string, unknown>): BankFundamentalSnapshot {
  return {
    ticker: String(row.ticker),
    observedDate: date(row.observed_date),
    periodEnd: date(row.period_end),
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    nimPct: n(row.nim_pct), nplGrossPct: n(row.npl_gross_pct), nplNetPct: n(row.npl_net_pct),
    casaPct: n(row.casa_pct), carPct: n(row.car_pct), ldrPct: n(row.ldr_pct),
    costOfCreditPct: n(row.cost_of_credit_pct), costToIncomePct: n(row.cost_to_income_pct),
    coverageRatioPct: n(row.coverage_ratio_pct), ppopIdr: n(row.ppop_idr),
    source: String(row.source), sourceUrl: String(row.source_url),
  };
}

export async function getBankFundamentalAsOf(ticker: string, asOf?: string | null): Promise<BankFundamentalSnapshot | null> {
  try {
    const params: unknown[] = [ticker.toUpperCase()];
    let where = 'ticker = $1';
    if (asOf) {
      params.push(asOf);
      where += ' AND observed_date <= $2::date';
    }
    const { rows } = await pool.query(
      `SELECT * FROM bank_fundamental_history
       WHERE ${where}
       ORDER BY observed_date DESC, period_end DESC
       LIMIT 1`,
      params,
    );
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return null; // migration not applied yet: DATA_ONLY absent, no fake fallback.
    throw error;
  }
}
