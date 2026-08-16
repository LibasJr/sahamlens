import type { BankMetricEvidence, BankMetricKey } from '../repository/bank-fundamental.repository';
import { listBankMetricEvidenceForMaturity } from '../repository/bank-fundamental.repository';

export const BANK_RESEARCH_METRICS: readonly BankMetricKey[] = [
  'NIM_PCT',
  'NPL_GROSS_PCT',
  'CASA_PCT',
  'CAR_PCT',
  'LDR_PCT',
  'COST_OF_CREDIT_PCT',
] as const;

export interface BankTickerMaturity {
  ticker: string;
  periods: number;
  latestPeriod: string | null;
  distinctMetrics: number;
  researchMetricsPresent: number;
  completeResearchPeriods: number;
  reportedRows: number;
  derivedRows: number;
  unspecifiedBasisRows: number;
  pitViolationRows: number;
  sourceTiers: string[];
  bases: string[];
  researchAnalyzable: boolean;
  scoringStatus: 'DATA_ONLY_NOT_VALIDATED';
  warnings: string[];
}

export interface BankEvidenceMaturityReport {
  tickerCount: number;
  evidenceRows: number;
  tickers: BankTickerMaturity[];
  scoringEnabled: false;
  guardrail: string;
}

type MaturityInput = BankMetricEvidence & { ticker: string };

function isPitSafe(row: MaturityInput): boolean {
  if (row.observedDate < row.periodEnd) return false;
  if (row.publishedAt && row.observedDate < row.publishedAt.slice(0, 10)) return false;
  return true;
}

export function buildBankEvidenceMaturity(rows: MaturityInput[]): BankEvidenceMaturityReport {
  const byTicker = new Map<string, MaturityInput[]>();
  for (const row of rows) {
    const ticker = row.ticker.toUpperCase();
    const list = byTicker.get(ticker) ?? [];
    list.push({ ...row, ticker });
    byTicker.set(ticker, list);
  }

  const tickers: BankTickerMaturity[] = [...byTicker.entries()].map(([ticker, items]): BankTickerMaturity => {
    const periods = [...new Set(items.map((row) => row.periodEnd))].sort();
    const metricKeys = [...new Set(items.map((row) => row.metricKey))];
    const researchMetrics = BANK_RESEARCH_METRICS.filter((key) => metricKeys.includes(key));
    const completeResearchPeriods = periods.filter((period) => {
      const periodMetrics = new Set(items.filter((row) => row.periodEnd === period).map((row) => row.metricKey));
      return BANK_RESEARCH_METRICS.every((key) => periodMetrics.has(key));
    }).length;
    const reportedRows = items.filter((row) => row.evidenceType === 'REPORTED').length;
    const derivedRows = items.length - reportedRows;
    const unspecifiedBasisRows = items.filter((row) => row.basis === 'DISCLOSED_UNSPECIFIED').length;
    const pitViolationRows = items.filter((row) => !isPitSafe(row)).length;
    const sourceTiers = [...new Set(items.map((row) => row.sourceTier))].sort();
    const bases = [...new Set(items.map((row) => row.basis))].sort();
    const researchAnalyzable = completeResearchPeriods > 0 && pitViolationRows === 0;
    const warnings: string[] = [];
    if (completeResearchPeriods === 0) warnings.push('Belum ada satu period pun dengan enam research metrics lengkap.');
    if (pitViolationRows > 0) warnings.push(`${pitViolationRows} evidence melanggar PIT boundary.`);
    if (unspecifiedBasisRows > 0) warnings.push(`${unspecifiedBasisRows} evidence masih DISCLOSED_UNSPECIFIED.`);
    if (derivedRows > 0) warnings.push(`${derivedRows} evidence DERIVED harus dianalisis terpisah dari REPORTED.`);
    warnings.push('Tidak ada auto-scoring; maturity report hanya menentukan kelayakan analisis, bukan bobot LensScore.');
    return {
      ticker,
      periods: periods.length,
      latestPeriod: periods.at(-1) ?? null,
      distinctMetrics: metricKeys.length,
      researchMetricsPresent: researchMetrics.length,
      completeResearchPeriods,
      reportedRows,
      derivedRows,
      unspecifiedBasisRows,
      pitViolationRows,
      sourceTiers,
      bases,
      researchAnalyzable,
      scoringStatus: 'DATA_ONLY_NOT_VALIDATED',
      warnings,
    };
  }).sort((a, b) => b.completeResearchPeriods - a.completeResearchPeriods || b.periods - a.periods || a.ticker.localeCompare(b.ticker));

  return {
    tickerCount: tickers.length,
    evidenceRows: rows.length,
    tickers,
    scoringEnabled: false,
    guardrail: 'Bank metrics tetap DATA_ONLY. Scoring baru boleh dirancang setelah histori PIT cukup untuk validation protocol yang ditetapkan dan diuji terpisah.',
  };
}

export async function getBankEvidenceMaturityReport(): Promise<BankEvidenceMaturityReport> {
  return buildBankEvidenceMaturity(await listBankMetricEvidenceForMaturity());
}
