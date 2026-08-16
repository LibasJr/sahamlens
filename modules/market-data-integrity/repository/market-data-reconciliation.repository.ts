import { pool } from '@/shared/database/postgres.client';
import type { CloseReconciliationRow, MarketIntegrityView } from '../types';

function iso(value: unknown): string | null {
  return value == null ? null : value instanceof Date ? value.toISOString() : String(value);
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export async function startReconciliationRun(input: {
  runId: string;
  primarySource: string;
  secondarySource: string;
  universeCount: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO market_data_reconciliation_runs
     (run_id,primary_source,secondary_source,status,universe_count)
     VALUES($1,$2,$3,'RUNNING',$4)`,
    [input.runId, input.primarySource, input.secondarySource, input.universeCount],
  );
}

export async function finishReconciliationRun(input: {
  runId: string;
  tradeDate: string | null;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  compared: number;
  matches: number;
  mismatches: number;
  primaryOnly: number;
  secondaryOnly: number;
  noData: number;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `UPDATE market_data_reconciliation_runs SET
       trade_date=$2,status=$3,compared_count=$4,match_count=$5,mismatch_count=$6,
       primary_only_count=$7,secondary_only_count=$8,no_data_count=$9,detail=$10::jsonb,finished_at=now()
     WHERE run_id=$1`,
    [input.runId, input.tradeDate, input.status, input.compared, input.matches, input.mismatches, input.primaryOnly, input.secondaryOnly, input.noData, JSON.stringify(input.detail ?? {})],
  );
}

export async function upsertCloseReconciliation(row: CloseReconciliationRow): Promise<void> {
  await pool.query(
    `INSERT INTO market_close_reconciliation
     (ticker,trade_date,primary_source,secondary_source,primary_close,secondary_close,diff_abs,diff_pct,status,
      primary_observed_at,secondary_observed_at,run_id,detail,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,now())
     ON CONFLICT(ticker,trade_date,primary_source,secondary_source) DO UPDATE SET
       primary_close=EXCLUDED.primary_close,secondary_close=EXCLUDED.secondary_close,
       diff_abs=EXCLUDED.diff_abs,diff_pct=EXCLUDED.diff_pct,status=EXCLUDED.status,
       primary_observed_at=EXCLUDED.primary_observed_at,secondary_observed_at=EXCLUDED.secondary_observed_at,
       run_id=EXCLUDED.run_id,detail=EXCLUDED.detail,updated_at=now()`,
    [row.ticker, row.tradeDate, row.primarySource, row.secondarySource, row.primaryClose, row.secondaryClose, row.diffAbs, row.diffPct, row.status, row.primaryObservedAt, row.secondaryObservedAt, row.runId, JSON.stringify(row.detail)],
  );
}

export async function getLatestMarketIntegrity(ticker: string): Promise<MarketIntegrityView | null> {
  try {
    const { rows } = await pool.query(
      `SELECT ticker,trade_date,status,primary_close,secondary_close,diff_abs,diff_pct,primary_source,secondary_source
       FROM market_close_reconciliation WHERE ticker=$1 ORDER BY trade_date DESC LIMIT 1`,
      [ticker],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      ticker: String(row.ticker),
      tradeDate: dateOnly(row.trade_date),
      status: String(row.status) as MarketIntegrityView['status'],
      primaryClose: row.primary_close == null ? null : Number(row.primary_close),
      secondaryClose: row.secondary_close == null ? null : Number(row.secondary_close),
      diffAbs: row.diff_abs == null ? null : Number(row.diff_abs),
      diffPct: row.diff_pct == null ? null : Number(row.diff_pct),
      primarySource: String(row.primary_source),
      secondarySource: String(row.secondary_source),
      underReview: row.status !== 'MATCH',
    };
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return null;
    throw error;
  }
}

export async function getReconciliationSummary(limit = 20): Promise<Array<Record<string, unknown>>> {
  try {
    const { rows } = await pool.query(
      `SELECT run_id,trade_date,primary_source,secondary_source,status,universe_count,compared_count,
              match_count,mismatch_count,primary_only_count,secondary_only_count,no_data_count,started_at,finished_at,detail
       FROM market_data_reconciliation_runs ORDER BY started_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((row: Record<string, unknown>) => ({
      ...row,
      trade_date: row.trade_date == null ? null : dateOnly(row.trade_date),
      started_at: iso(row.started_at),
      finished_at: iso(row.finished_at),
    }));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return [];
    throw error;
  }
}

export async function getLatestReconciliationIssues(limit = 100): Promise<Array<Record<string, unknown>>> {
  try {
    const { rows } = await pool.query(
      `SELECT ticker,trade_date,status,primary_close,secondary_close,diff_abs,diff_pct,primary_source,secondary_source,updated_at
       FROM market_close_reconciliation
       WHERE status <> 'MATCH'
       ORDER BY trade_date DESC, CASE status WHEN 'MISMATCH' THEN 0 ELSE 1 END, ticker
       LIMIT $1`,
      [limit],
    );
    return rows.map((row: Record<string, unknown>) => ({
      ...row,
      trade_date: dateOnly(row.trade_date),
      updated_at: iso(row.updated_at),
    }));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return [];
    throw error;
  }
}
