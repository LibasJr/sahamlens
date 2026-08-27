import type { FinancialValueConfidence } from '@/shared/finance/provenance';
import { assessResearchDataQuality } from '@/shared/research/data-quality';

/** Audit trail for model/research outputs rather than one financial metric. */
export interface ResearchOutputProvenance {
  source: string;
  period?: string;
  dataMode: 'POINT_IN_TIME' | 'CURRENT';
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
  const blocking = assessResearchDataQuality(provenance, {
    requirePeriod: true,
    requireDataMode: true,
    expectedDataMode: 'POINT_IN_TIME',
    requireModelVersion: true,
    requireSnapshotVersion: true,
  });
  if (blocking.length > 0) {
    throw new Error(`RESEARCH_DATA_QUALITY:${blocking.map((issue) => `${issue.code}:${issue.field}`).join(',')}`);
  }
  return provenance;
}
