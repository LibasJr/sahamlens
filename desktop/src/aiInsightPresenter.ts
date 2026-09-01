type RecordValue = Record<string, unknown>;

export type AIInsightEvidence = { label: string; value: string };
export type PresentedAIInsight = {
  ticker: string;
  score: number | null;
  category: string;
  consensus: string;
  coverage: number | null;
  modelValidated: boolean | null;
  modelReason: string;
  freshness: string;
  dataTimestamp: string | null;
  supportingReasons: string[];
  riskFlags: string[];
  evidence: AIInsightEvidence[];
};

function asRecord(value: unknown): RecordValue {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asText(value: unknown, fallback = '—'): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatPrice(value: number): string {
  return value.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
}

function recommendationList(payload: unknown): unknown[] {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const recommendations = data.recommendations ?? root.recommendations;
  return Array.isArray(recommendations) ? recommendations : [];
}

export function presentAIInsight(payload: unknown, requestedTicker: string): PresentedAIInsight | null {
  const normalizedTicker = requestedTicker.trim().toUpperCase().replace('.JK', '');
  const recommendation = recommendationList(payload)
    .map(asRecord)
    .find((item) => asText(item.ticker, '').toUpperCase().replace('.JK', '') === normalizedTicker);
  if (!recommendation) return null;

  const root = asRecord(payload);
  const data = asRecord(root.data);
  const validation = asRecord(data.modelValidation ?? root.modelValidation);
  const meta = asRecord(recommendation._meta);
  const score = asNumber(recommendation.totalScore ?? recommendation.lensScore ?? recommendation.lens_score ?? recommendation.score);
  const coverage = asNumber(recommendation.coverage ?? recommendation.coveragePct);
  const evidence: AIInsightEvidence[] = [];
  const addEvidence = (label: string, value: unknown, format: (number: number) => string = (number) => formatNumber(number)) => {
    if (typeof value === 'number' && Number.isFinite(value)) evidence.push({ label, value: format(value) });
    else if (typeof value === 'string' && value.trim()) evidence.push({ label, value });
  };

  addEvidence('Harga', recommendation.price, formatPrice);
  addEvidence('Perubahan', recommendation.changePct, (value) => `${value >= 0 ? '+' : ''}${formatNumber(value, 2)}%`);
  addEvidence('Skor fundamental', recommendation.fundamentalScore);
  addEvidence('Skor valuasi', recommendation.valuationScore);
  addEvidence('Flow', recommendation.foreignFlow);
  addEvidence('Eligibility', recommendation.eligibilityStatus);

  return {
    ticker: asText(recommendation.ticker, normalizedTicker),
    score,
    category: asText(recommendation.scoringKategori ?? asRecord(recommendation.decision).action, 'Belum dikategorikan'),
    consensus: asText(recommendation.consensus, 'Belum ada konsensus'),
    coverage,
    modelValidated: typeof validation.validated === 'boolean' ? validation.validated : null,
    modelReason: asText(validation.reasonCode, 'Status validasi tidak tersedia'),
    freshness: asText(meta.freshness ?? asRecord(recommendation.dataQuality).freshness, 'UNKNOWN'),
    dataTimestamp: typeof recommendation.dataTimestamp === 'string' ? recommendation.dataTimestamp : null,
    supportingReasons: asStrings(recommendation.topReasons ?? asRecord(recommendation.explainability).supporting_reasons),
    riskFlags: asStrings(recommendation.riskFlags ?? asRecord(recommendation.explainability).risk_flags),
    evidence,
  };
}
