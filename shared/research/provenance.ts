import type { FinancialValueConfidence } from '@/shared/finance/provenance';

/** Audit trail for model/research outputs rather than one financial metric. */
export interface ResearchOutputProvenance {
  source: string;
  period?: string;
  asOf?: string;
  retrievedAt: string;
  confidence: FinancialValueConfidence;
  isEstimated: boolean;
  modelVersion?: string | null;
  universeVersion?: string | null;
  dataSnapshotVersion?: string | null;
  transformation?: string;
  note?: string;
}

export function researchOutputProvenance(
  provenance: ResearchOutputProvenance,
): ResearchOutputProvenance {
  return provenance;
}
