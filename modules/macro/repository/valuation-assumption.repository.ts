import { pool } from '@/shared/database/postgres.client';

export interface ValuationMacroAssumption {
  id: number;
  effectiveDate: string;
  observedDate: string;
  riskFreeRatePct: number;
  equityRiskPremiumPct: number;
  maxPerpetualGrowthPct: number;
  source: string;
  sourceUrl: string | null;
  notes: string | null;
  createdAt: string;
}

function num(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Nilai macro assumption bukan angka valid: ${String(value)}`);
  return n;
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRow(row: Record<string, unknown>): ValuationMacroAssumption {
  return {
    id: Number(row.id),
    effectiveDate: String(row.effective_date),
    observedDate: String(row.observed_date),
    riskFreeRatePct: num(row.risk_free_rate_pct),
    equityRiskPremiumPct: num(row.equity_risk_premium_pct),
    maxPerpetualGrowthPct: num(row.max_perpetual_growth_pct),
    source: String(row.source),
    sourceUrl: row.source_url == null ? null : String(row.source_url),
    notes: row.notes == null ? null : String(row.notes),
    createdAt: iso(row.created_at),
  };
}

/**
 * Macro assumptions are versioned/PIT evidence. This repository deliberately has
 * no synthetic fallback. If the migration/table is absent or no official row has
 * been imported, callers receive null and must keep the frozen model assumption.
 */
export async function getValuationMacroAssumptionAsOf(
  asOfDate?: string,
): Promise<ValuationMacroAssumption | null> {
  try {
    const params: unknown[] = [];
    const where = asOfDate
      ? (() => {
          params.push(asOfDate);
          return 'WHERE effective_date <= $1::date AND observed_date <= $1::date';
        })()
      : '';
    const { rows } = await pool.query(
      `SELECT id, effective_date, observed_date, risk_free_rate_pct,
              equity_risk_premium_pct, max_perpetual_growth_pct, source,
              source_url, notes, created_at
         FROM macro_assumption_history
         ${where}
        ORDER BY effective_date DESC, observed_date DESC, id DESC
        LIMIT 1`,
      params,
    );
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (error) {
    // 42P01 = migration not applied. Fail closed rather than fabricating history.
    if ((error as { code?: string } | null)?.code === '42P01') return null;
    throw error;
  }
}

export async function listValuationMacroAssumptions(limit = 100): Promise<ValuationMacroAssumption[]> {
  try {
    const { rows } = await pool.query(
      `SELECT id, effective_date, observed_date, risk_free_rate_pct,
              equity_risk_premium_pct, max_perpetual_growth_pct, source,
              source_url, notes, created_at
         FROM macro_assumption_history
        ORDER BY effective_date DESC, observed_date DESC, id DESC
        LIMIT $1`,
      [Math.max(1, Math.min(limit, 1000))],
    );
    return rows.map(mapRow);
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return [];
    throw error;
  }
}
