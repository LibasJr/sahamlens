import { pool } from '@/shared/database/postgres.client';

export type MacroInputKey =
  | 'RISK_FREE_RATE_PCT'
  | 'EQUITY_RISK_PREMIUM_PCT'
  | 'MAX_PERPETUAL_GROWTH_PCT'
  | 'BI_RATE_PCT'
  | 'INFLATION_TARGET_MID_PCT'
  | 'INFLATION_TARGET_UPPER_PCT';

export type MacroEvidenceType =
  | 'MARKET_OBSERVATION'
  | 'RESEARCH_ESTIMATE'
  | 'POLICY_TARGET'
  | 'POLICY_RATE'
  | 'MODEL_POLICY';

export type MacroSourceTier =
  | 'GOVERNMENT_OFFICIAL'
  | 'ACADEMIC_RESEARCH'
  | 'INTERNAL_MODEL_POLICY';

export interface MacroInputEvidence {
  id: number;
  inputKey: MacroInputKey;
  valuePct: number;
  marketDate: string | null;
  observedDate: string;
  usableFromDate: string;
  evidenceType: MacroEvidenceType;
  sourceTier: MacroSourceTier;
  sourceName: string;
  sourceUrl: string | null;
  methodology: string;
  notes: string | null;
  createdAt: string;
}

function num(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Nilai macro evidence bukan angka valid: ${String(value)}`);
  return n;
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapEvidenceRow(row: Record<string, unknown>): MacroInputEvidence {
  return {
    id: Number(row.id),
    inputKey: String(row.input_key) as MacroInputKey,
    valuePct: num(row.value_pct),
    marketDate: row.market_date == null ? null : dateOnly(row.market_date),
    observedDate: dateOnly(row.observed_date),
    usableFromDate: dateOnly(row.usable_from_date),
    evidenceType: String(row.evidence_type) as MacroEvidenceType,
    sourceTier: String(row.source_tier) as MacroSourceTier,
    sourceName: String(row.source_name),
    sourceUrl: row.source_url == null ? null : String(row.source_url),
    methodology: String(row.methodology),
    notes: row.notes == null ? null : String(row.notes),
    createdAt: iso(row.created_at),
  };
}

/**
 * Return only evidence that was already usable on `asOfDate`.
 * `usable_from_date`, not market_date, is the anti-look-ahead boundary.
 */
export async function getMacroInputEvidenceAsOf(
  inputKey: MacroInputKey,
  asOfDate?: string,
): Promise<MacroInputEvidence | null> {
  try {
    const params: unknown[] = [inputKey];
    let asOf = '';
    if (asOfDate) {
      params.push(asOfDate);
      asOf = 'AND usable_from_date <= $2::date';
    }
    const { rows } = await pool.query(
      `SELECT id, input_key, value_pct, market_date, observed_date, usable_from_date,
              evidence_type, source_tier, source_name, source_url, methodology,
              notes, created_at
         FROM macro_input_evidence
        WHERE input_key = $1
          ${asOf}
        ORDER BY usable_from_date DESC, observed_date DESC, id DESC
        LIMIT 1`,
      params,
    );
    return rows[0] ? mapEvidenceRow(rows[0]) : null;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return null;
    throw error;
  }
}

export async function listMacroInputEvidence(limit = 200): Promise<MacroInputEvidence[]> {
  try {
    const { rows } = await pool.query(
      `SELECT id, input_key, value_pct, market_date, observed_date, usable_from_date,
              evidence_type, source_tier, source_name, source_url, methodology,
              notes, created_at
         FROM macro_input_evidence
        ORDER BY usable_from_date DESC, input_key ASC, id DESC
        LIMIT $1`,
      [Math.max(1, Math.min(limit, 2000))],
    );
    return rows.map(mapEvidenceRow);
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return [];
    throw error;
  }
}

/** Legacy bundle retained only for old audit data. New imports use macro_input_evidence. */
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

function mapLegacyRow(row: Record<string, unknown>): ValuationMacroAssumption {
  return {
    id: Number(row.id),
    effectiveDate: dateOnly(row.effective_date),
    observedDate: dateOnly(row.observed_date),
    riskFreeRatePct: num(row.risk_free_rate_pct),
    equityRiskPremiumPct: num(row.equity_risk_premium_pct),
    maxPerpetualGrowthPct: num(row.max_perpetual_growth_pct),
    source: String(row.source),
    sourceUrl: row.source_url == null ? null : String(row.source_url),
    notes: row.notes == null ? null : String(row.notes),
    createdAt: iso(row.created_at),
  };
}

export async function getValuationMacroAssumptionAsOf(asOfDate?: string): Promise<ValuationMacroAssumption | null> {
  try {
    const params: unknown[] = [];
    const where = asOfDate
      ? (() => { params.push(asOfDate); return 'WHERE effective_date <= $1::date AND observed_date <= $1::date'; })()
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
    return rows[0] ? mapLegacyRow(rows[0]) : null;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return null;
    throw error;
  }
}
