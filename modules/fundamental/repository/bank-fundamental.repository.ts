import { pool } from '../../../shared/database/postgres.client';

export type BankMetricKey =
  | 'NIM_PCT'
  | 'NPL_GROSS_PCT'
  | 'NPL_NET_PCT'
  | 'CASA_PCT'
  | 'CAR_PCT'
  | 'LDR_PCT'
  | 'COST_OF_CREDIT_PCT'
  | 'COST_TO_INCOME_PCT'
  | 'COVERAGE_RATIO_PCT'
  | 'PPOP_IDR';

export interface BankMetricEvidence {
  metricKey: BankMetricKey;
  value: number;
  unit: 'PCT' | 'IDR';
  basis: 'BANK_ONLY' | 'CONSOLIDATED' | 'DISCLOSED_UNSPECIFIED';
  evidenceType: 'REPORTED' | 'DERIVED';
  observedDate: string;
  periodEnd: string;
  publishedAt: string | null;
  sourceDocumentDate: string | null;
  sourceTier: 'ISSUER_IR' | 'IDX_FILING' | 'OJK' | 'OTHER_OFFICIAL';
  sourceTitle: string;
  sourceUrl: string;
  notes: string | null;
  evidenceFingerprint: string;
}

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
  evidence: BankMetricEvidence[];
  evidenceMode: 'METRIC_EVIDENCE' | 'LEGACY_WIDE_ROW';
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
function timestamp(v: unknown): string | null {
  if (v == null) return null;
  const parsed = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function mapLegacyRow(row: Record<string, unknown>): BankFundamentalSnapshot {
  return {
    ticker: String(row.ticker),
    observedDate: date(row.observed_date),
    periodEnd: date(row.period_end),
    publishedAt: timestamp(row.published_at),
    nimPct: n(row.nim_pct), nplGrossPct: n(row.npl_gross_pct), nplNetPct: n(row.npl_net_pct),
    casaPct: n(row.casa_pct), carPct: n(row.car_pct), ldrPct: n(row.ldr_pct),
    costOfCreditPct: n(row.cost_of_credit_pct), costToIncomePct: n(row.cost_to_income_pct),
    coverageRatioPct: n(row.coverage_ratio_pct), ppopIdr: n(row.ppop_idr),
    source: String(row.source), sourceUrl: String(row.source_url), evidence: [], evidenceMode: 'LEGACY_WIDE_ROW',
  };
}
function mapEvidenceRow(row: Record<string, unknown>): BankMetricEvidence {
  return {
    metricKey: String(row.metric_key) as BankMetricKey,
    value: Number(row.value),
    unit: String(row.unit) as 'PCT' | 'IDR',
    basis: String(row.basis) as BankMetricEvidence['basis'],
    evidenceType: String(row.evidence_type) as BankMetricEvidence['evidenceType'],
    observedDate: date(row.observed_date),
    periodEnd: date(row.period_end),
    publishedAt: timestamp(row.published_at),
    sourceDocumentDate: row.source_document_date == null ? null : date(row.source_document_date),
    sourceTier: String(row.source_tier) as BankMetricEvidence['sourceTier'],
    sourceTitle: String(row.source_title),
    sourceUrl: String(row.source_url),
    notes: row.notes == null ? null : String(row.notes),
    evidenceFingerprint: String(row.evidence_fingerprint),
  };
}

const METRIC_TO_FIELD: Record<BankMetricKey, keyof Pick<BankFundamentalSnapshot,
  'nimPct'|'nplGrossPct'|'nplNetPct'|'casaPct'|'carPct'|'ldrPct'|'costOfCreditPct'|'costToIncomePct'|'coverageRatioPct'|'ppopIdr'>> = {
  NIM_PCT: 'nimPct', NPL_GROSS_PCT: 'nplGrossPct', NPL_NET_PCT: 'nplNetPct', CASA_PCT: 'casaPct',
  CAR_PCT: 'carPct', LDR_PCT: 'ldrPct', COST_OF_CREDIT_PCT: 'costOfCreditPct', COST_TO_INCOME_PCT: 'costToIncomePct',
  COVERAGE_RATIO_PCT: 'coverageRatioPct', PPOP_IDR: 'ppopIdr',
};

async function getMetricEvidenceSnapshot(ticker: string, asOf?: string | null): Promise<BankFundamentalSnapshot | null> {
  const params: unknown[] = [ticker.toUpperCase()];
  let asOfClause = '';
  if (asOf) { params.push(asOf); asOfClause = 'AND observed_date <= $2::date'; }
  const periodResult = await pool.query(
    `SELECT period_end::text AS period_end
     FROM bank_metric_evidence
     WHERE ticker = $1 ${asOfClause}
     ORDER BY period_end DESC, observed_date DESC, created_at DESC
     LIMIT 1`,
    params,
  );
  const periodEnd = periodResult.rows[0]?.period_end ? String(periodResult.rows[0].period_end).slice(0, 10) : null;
  if (!periodEnd) return null;

  const evidenceParams: unknown[] = [ticker.toUpperCase(), periodEnd];
  let evidenceAsOf = '';
  if (asOf) { evidenceParams.push(asOf); evidenceAsOf = 'AND observed_date <= $3::date'; }
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (metric_key)
       metric_key,value,unit,basis,evidence_type,observed_date,period_end,published_at,source_document_date,
       source_tier,source_title,source_url,notes,evidence_fingerprint,created_at
     FROM bank_metric_evidence
     WHERE ticker = $1 AND period_end = $2::date ${evidenceAsOf}
     ORDER BY metric_key, observed_date DESC, created_at DESC`,
    evidenceParams,
  );
  if (!rows.length) return null;
  const evidence = rows.map((r) => mapEvidenceRow(r));
  const base: BankFundamentalSnapshot = {
    ticker: ticker.toUpperCase(), observedDate: evidence.map(x=>x.observedDate).sort().at(-1) ?? periodEnd, periodEnd,
    publishedAt: evidence.map(x=>x.publishedAt).filter((x): x is string=>Boolean(x)).sort().at(-1) ?? null,
    nimPct:null,nplGrossPct:null,nplNetPct:null,casaPct:null,carPct:null,ldrPct:null,costOfCreditPct:null,costToIncomePct:null,coverageRatioPct:null,ppopIdr:null,
    source: evidence.length === 1 ? evidence[0].sourceTitle : 'MULTI_SOURCE_BANK_EVIDENCE',
    sourceUrl: evidence[0]?.sourceUrl ?? '', evidence, evidenceMode:'METRIC_EVIDENCE',
  };
  for (const item of evidence) {
    const field = METRIC_TO_FIELD[item.metricKey];
    (base[field] as number | null) = item.value;
  }
  return base;
}

export async function getBankFundamentalAsOf(ticker: string, asOf?: string | null): Promise<BankFundamentalSnapshot | null> {
  try {
    const metricSnapshot = await getMetricEvidenceSnapshot(ticker, asOf);
    if (metricSnapshot) return metricSnapshot;
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== '42P01') throw error;
  }

  try {
    const params: unknown[] = [ticker.toUpperCase()];
    let where = 'ticker = $1';
    if (asOf) { params.push(asOf); where += ' AND observed_date <= $2::date'; }
    const { rows } = await pool.query(
      `SELECT * FROM bank_fundamental_history WHERE ${where} ORDER BY observed_date DESC, period_end DESC LIMIT 1`, params,
    );
    return rows[0] ? mapLegacyRow(rows[0]) : null;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return null;
    throw error;
  }
}

export async function getBankMetricEvidenceAdminSummary() {
  try {
    const [totals, byTicker, recent] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int evidence_rows, COUNT(DISTINCT ticker)::int tickers, COUNT(DISTINCT period_end)::int periods,
                         MAX(observed_date)::text latest_observed
                  FROM bank_metric_evidence`),
      pool.query(`SELECT ticker, COUNT(*)::int evidence_rows, COUNT(DISTINCT metric_key)::int metrics,
                         MAX(period_end)::text latest_period, MAX(observed_date)::text latest_observed,
                         COUNT(*) FILTER (WHERE evidence_type='DERIVED')::int derived_rows,
                         COUNT(*) FILTER (WHERE basis='DISCLOSED_UNSPECIFIED')::int unspecified_basis_rows
                  FROM bank_metric_evidence GROUP BY ticker ORDER BY latest_period DESC, ticker ASC`),
      pool.query(`SELECT ticker,metric_key,value::float8 value,unit,basis,evidence_type,period_end::text,observed_date::text,
                         source_tier,source_title,source_url,notes
                  FROM bank_metric_evidence ORDER BY created_at DESC LIMIT 50`),
    ]);
    return { totals: totals.rows[0] ?? { evidence_rows:0,tickers:0,periods:0,latest_observed:null }, byTicker: byTicker.rows, recent: recent.rows };
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return { totals:{evidence_rows:0,tickers:0,periods:0,latest_observed:null},byTicker:[],recent:[] };
    throw error;
  }
}

/**
 * Read-only evidence feed for maturity/validation research. This intentionally
 * returns raw per-metric rows rather than a synthesized latest snapshot so that
 * period coverage, basis consistency, and PIT violations remain auditable.
 */
export async function listBankMetricEvidenceForMaturity(limit = 10000): Promise<Array<BankMetricEvidence & { ticker: string }>> {
  try {
    const { rows } = await pool.query(
      `SELECT ticker,metric_key,value,unit,basis,evidence_type,observed_date,period_end,published_at,
              source_document_date,source_tier,source_title,source_url,notes,evidence_fingerprint,created_at
         FROM bank_metric_evidence
        ORDER BY ticker ASC, period_end ASC, observed_date ASC, metric_key ASC, created_at ASC
        LIMIT $1`,
      [Math.max(1, Math.min(limit, 100000))],
    );
    return rows.map((row) => ({ ticker: String(row.ticker).toUpperCase(), ...mapEvidenceRow(row) }));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return [];
    throw error;
  }
}

export interface BankMetricCollectorAdminSummary {
  latestRun: {
    runId: string;
    mode: string;
    status: string;
    tickers: string[];
    sourcePagesChecked: number;
    documentsDiscovered: number;
    documentsParsed: number;
    evidenceCandidates: number;
    evidenceInserted: number;
    evidenceExisting: number;
    quarantined: number;
    startedAt: string;
    finishedAt: string | null;
  } | null;
  recentQuarantine: Array<{
    ticker: string;
    periodEnd: string | null;
    metricKey: string;
    reason: string | null;
    sourceTitle: string;
    sourceUrl: string;
    rawExcerpt: string | null;
    createdAt: string;
  }>;
}

export async function getBankMetricCollectorAdminSummary(): Promise<BankMetricCollectorAdminSummary> {
  try {
    const [runResult, quarantineResult] = await Promise.all([
      pool.query(`SELECT run_id,mode,status,tickers,source_pages_checked,documents_discovered,documents_parsed,
                         evidence_candidates,evidence_inserted,evidence_existing,quarantined,started_at,finished_at
                    FROM bank_metric_collection_runs
                   ORDER BY started_at DESC LIMIT 1`),
      pool.query(`SELECT ticker,period_end::text,metric_key,reason,source_title,source_url,raw_excerpt,created_at
                    FROM bank_metric_collection_candidates
                   WHERE status='QUARANTINED'
                   ORDER BY created_at DESC LIMIT 25`),
    ]);
    const r = runResult.rows[0] as Record<string, unknown> | undefined;
    return {
      latestRun: r ? {
        runId: String(r.run_id), mode: String(r.mode), status: String(r.status),
        tickers: Array.isArray(r.tickers) ? r.tickers.map(String) : [],
        sourcePagesChecked: Number(r.source_pages_checked ?? 0), documentsDiscovered: Number(r.documents_discovered ?? 0),
        documentsParsed: Number(r.documents_parsed ?? 0), evidenceCandidates: Number(r.evidence_candidates ?? 0),
        evidenceInserted: Number(r.evidence_inserted ?? 0), evidenceExisting: Number(r.evidence_existing ?? 0),
        quarantined: Number(r.quarantined ?? 0), startedAt: timestamp(r.started_at) ?? '', finishedAt: timestamp(r.finished_at),
      } : null,
      recentQuarantine: quarantineResult.rows.map((row: Record<string, unknown>) => ({
        ticker: String(row.ticker), periodEnd: row.period_end == null ? null : date(row.period_end), metricKey: String(row.metric_key),
        reason: row.reason == null ? null : String(row.reason), sourceTitle: String(row.source_title), sourceUrl: String(row.source_url),
        rawExcerpt: row.raw_excerpt == null ? null : String(row.raw_excerpt), createdAt: timestamp(row.created_at) ?? '',
      })),
    };
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return { latestRun: null, recentQuarantine: [] };
    throw error;
  }
}
