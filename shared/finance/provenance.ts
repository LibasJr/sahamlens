export type FinancialValueConfidence = 'official' | 'calculated' | 'estimated' | 'fallback' | 'stale' | 'unknown';
export type FinancialValueTransformation = 'DIRECT' | 'DERIVED' | 'ESTIMATED';

export interface FinancialValueProvenance {
  source: string;
  period?: string;
  asOf?: string;
  retrievedAt?: string;
  confidence: FinancialValueConfidence;
  isEstimated: boolean;
  transformation?: FinancialValueTransformation;
  note?: string;
}

export interface ProvenancedFinancialValue<T extends number | string | null = number | null> {
  value: T;
  provenance: FinancialValueProvenance;
}

export function provenancedValue<T extends number | string | null>(
  value: T,
  provenance: FinancialValueProvenance,
): ProvenancedFinancialValue<T> {
  return { value, provenance };
}
