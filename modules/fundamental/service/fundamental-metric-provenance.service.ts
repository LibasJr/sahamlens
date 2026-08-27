import {
  provenancedValue,
  type FinancialValueProvenance,
  type ProvenancedFinancialValue,
} from '@/shared/finance/provenance';

type FinancialScalar = number | string | null;

export interface FundamentalMetricProvenancePayload {
  fundamentals: Record<string, ProvenancedFinancialValue<FinancialScalar>>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isFinancialScalar(value: unknown): value is FinancialScalar {
  return value === null || typeof value === 'number' || typeof value === 'string';
}

function currentProvenance(result: Record<string, unknown>): FinancialValueProvenance {
  const source = asRecord(result.source);
  return {
    source: asOptionalString(source?.provider) ?? 'current-fundamental-provider',
    period: asOptionalString(source?.period),
    retrievedAt: asOptionalString(source?.retrievedAt),
    confidence: 'unknown',
    isEstimated: false,
    note: 'Nilai diteruskan dari snapshot fundamental provider; kualitas sumber dinilai terpisah.',
  };
}

function pitProvenance(result: Record<string, unknown>): FinancialValueProvenance {
  const pit = asRecord(result.pit);
  return {
    source: 'fundamental-history-pit',
    period: asOptionalString(pit?.period_end),
    asOf: asOptionalString(pit?.observed_date),
    confidence: 'unknown',
    isEstimated: false,
    note: 'Nilai point-in-time yang diketahui pada observed_date; beberapa rasio dinormalisasi satuannya untuk kontrak API.',
  };
}

export function buildFundamentalMetricProvenance(
  result: Record<string, unknown>,
): FundamentalMetricProvenancePayload {
  const fundamentals = asRecord(result.fundamentals) ?? {};
  const base = result.mode === 'PIT' ? pitProvenance(result) : currentProvenance(result);

  const mapped: Record<string, ProvenancedFinancialValue<FinancialScalar>> = {};
  for (const [metric, value] of Object.entries(fundamentals)) {
    if (!isFinancialScalar(value)) continue;
    mapped[metric] = provenancedValue(value, { ...base });
  }

  return { fundamentals: mapped };
}
