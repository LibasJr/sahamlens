import { describe, expect, it } from 'vitest';
import type { BankMetricEvidence } from '../../repository/bank-fundamental.repository';
import { buildBankEvidenceMaturity } from '../bank-evidence-maturity.service';

function row(metricKey: BankMetricEvidence['metricKey'], overrides: Partial<BankMetricEvidence & { ticker: string }> = {}) {
  return {
    ticker: 'BBCA.JK',
    metricKey,
    value: 1,
    unit: metricKey === 'PPOP_IDR' ? 'IDR' as const : 'PCT' as const,
    basis: 'CONSOLIDATED' as const,
    evidenceType: 'REPORTED' as const,
    observedDate: '2026-08-16',
    periodEnd: '2026-06-30',
    publishedAt: '2026-07-29T00:00:00.000Z',
    sourceDocumentDate: '2026-07-29',
    sourceTier: 'ISSUER_IR' as const,
    sourceTitle: 'Official',
    sourceUrl: 'https://example.com',
    notes: null,
    evidenceFingerprint: `${metricKey}-1`,
    ...overrides,
  };
}

describe('bank evidence maturity', () => {
  it('marks a complete PIT-safe research period as analyzable but never scoring-enabled', () => {
    const metrics: BankMetricEvidence['metricKey'][] = ['NIM_PCT','NPL_GROSS_PCT','CASA_PCT','CAR_PCT','LDR_PCT','COST_OF_CREDIT_PCT'];
    const report = buildBankEvidenceMaturity(metrics.map((metric) => row(metric)));
    expect(report.scoringEnabled).toBe(false);
    expect(report.tickers[0].completeResearchPeriods).toBe(1);
    expect(report.tickers[0].researchAnalyzable).toBe(true);
    expect(report.tickers[0].scoringStatus).toBe('DATA_ONLY_NOT_VALIDATED');
  });

  it('fails research analyzability when PIT boundary is violated', () => {
    const metrics: BankMetricEvidence['metricKey'][] = ['NIM_PCT','NPL_GROSS_PCT','CASA_PCT','CAR_PCT','LDR_PCT','COST_OF_CREDIT_PCT'];
    const report = buildBankEvidenceMaturity(metrics.map((metric) => row(metric, { observedDate: '2026-06-01' })));
    expect(report.tickers[0].pitViolationRows).toBe(6);
    expect(report.tickers[0].researchAnalyzable).toBe(false);
  });
});
