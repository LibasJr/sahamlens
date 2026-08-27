export type ResearchDataQualityCode =
  | 'SOURCE_MISSING'
  | 'PERIOD_MISSING'
  | 'PERIOD_MISMATCH'
  | 'DATA_MODE_MISSING'
  | 'DATA_MODE_MISMATCH'
  | 'AS_OF_INVALID'
  | 'AS_OF_FUTURE'
  | 'RETRIEVED_AT_INVALID'
  | 'STALE'
  | 'MODEL_VERSION_MISSING'
  | 'SNAPSHOT_VERSION_MISSING'
  | 'PLACEHOLDER_METADATA'
  | 'VALUE_NON_FINITE'
  | 'VALUE_OUT_OF_RANGE';

export interface ResearchDataQualityIssue {
  code: ResearchDataQualityCode;
  field: string;
  message: string;
}

export interface ResearchNumericConstraint {
  value: number | null | undefined;
  min?: number;
  max?: number;
}

export interface ResearchDataQualityInput {
  source?: string | null;
  period?: string | null;
  expectedPeriod?: string | null;
  dataMode?: 'POINT_IN_TIME' | 'CURRENT' | null;
  asOf?: string | null;
  retrievedAt?: string | null;
  modelVersion?: string | null;
  dataSnapshotVersion?: string | null;
  values?: Record<string, ResearchNumericConstraint>;
}

export interface ResearchDataQualityOptions {
  nowMs?: number;
  maxAgeMs?: number;
  requirePeriod?: boolean;
  requireDataMode?: boolean;
  expectedDataMode?: 'POINT_IN_TIME' | 'CURRENT';
  requireModelVersion?: boolean;
  requireSnapshotVersion?: boolean;
}

const PLACEHOLDER = /\b(?:dummy|mock|placeholder|sample[-_ ]?data|unknown[-_ ]?version)\b/i;

function validTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function assessResearchDataQuality(
  input: ResearchDataQualityInput,
  options: ResearchDataQualityOptions = {},
): ResearchDataQualityIssue[] {
  const issues: ResearchDataQualityIssue[] = [];
  const nowMs = options.nowMs ?? Date.now();
  const source = input.source?.trim() ?? '';
  const period = input.period?.trim() ?? '';

  if (!source) issues.push({ code: 'SOURCE_MISSING', field: 'source', message: 'Sumber data wajib disebut.' });
  if (options.requirePeriod && !period) {
    issues.push({ code: 'PERIOD_MISSING', field: 'period', message: 'Periode data wajib disebut.' });
  }
  if (input.expectedPeriod && period && input.expectedPeriod !== period) {
    issues.push({ code: 'PERIOD_MISMATCH', field: 'period', message: `Periode ${period} tidak sama dengan ${input.expectedPeriod}.` });
  }
  if (options.requireDataMode && !input.dataMode) {
    issues.push({ code: 'DATA_MODE_MISSING', field: 'dataMode', message: 'Mode waktu data wajib disebut.' });
  }
  if (options.expectedDataMode && input.dataMode && options.expectedDataMode !== input.dataMode) {
    issues.push({
      code: 'DATA_MODE_MISMATCH',
      field: 'dataMode',
      message: `Mode data ${input.dataMode} tidak sama dengan ${options.expectedDataMode}.`,
    });
  }

  const retrievedAt = validTimestamp(input.retrievedAt);
  if (retrievedAt == null) {
    issues.push({ code: 'RETRIEVED_AT_INVALID', field: 'retrievedAt', message: 'Waktu pengambilan data tidak valid.' });
  }

  const asOf = validTimestamp(input.asOf);
  if (input.asOf && asOf == null) {
    issues.push({ code: 'AS_OF_INVALID', field: 'asOf', message: 'Waktu observasi data tidak valid.' });
  } else if (asOf != null) {
    if (asOf > nowMs + 5 * 60_000) {
      issues.push({ code: 'AS_OF_FUTURE', field: 'asOf', message: 'Waktu observasi berada di masa depan.' });
    }
    if (options.maxAgeMs != null && nowMs - asOf > options.maxAgeMs) {
      issues.push({ code: 'STALE', field: 'asOf', message: 'Data melewati ambang freshness.' });
    }
  }

  if (options.requireModelVersion && !input.modelVersion?.trim()) {
    issues.push({ code: 'MODEL_VERSION_MISSING', field: 'modelVersion', message: 'Versi model wajib disebut.' });
  }
  if (options.requireSnapshotVersion && !input.dataSnapshotVersion?.trim()) {
    issues.push({ code: 'SNAPSHOT_VERSION_MISSING', field: 'dataSnapshotVersion', message: 'Versi snapshot data wajib disebut.' });
  }

  for (const [field, value] of Object.entries({
    source: input.source,
    modelVersion: input.modelVersion,
    dataSnapshotVersion: input.dataSnapshotVersion,
  })) {
    if (typeof value === 'string' && PLACEHOLDER.test(value)) {
      issues.push({ code: 'PLACEHOLDER_METADATA', field, message: 'Metadata placeholder/dummy tidak boleh masuk output riset.' });
    }
  }

  for (const [field, constraint] of Object.entries(input.values ?? {})) {
    const value = constraint.value;
    if (value == null) continue;
    if (!Number.isFinite(value)) {
      issues.push({ code: 'VALUE_NON_FINITE', field, message: 'Nilai numerik harus finite.' });
      continue;
    }
    if ((constraint.min != null && value < constraint.min) || (constraint.max != null && value > constraint.max)) {
      issues.push({ code: 'VALUE_OUT_OF_RANGE', field, message: 'Nilai numerik berada di luar rentang yang mungkin.' });
    }
  }

  return issues;
}
