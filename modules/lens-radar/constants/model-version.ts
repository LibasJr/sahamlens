export const SCORE_VERSION = 'lens-score-v1.3.0';
export const VALUATION_VERSION = 'valuation-v1.2.0';
export const SIGNAL_VERSION = 'lens-radar-signal-v1.2.0';
export const DATA_SNAPSHOT_VERSION = 'lens-radar-history-v1.1.0';

export interface ModelVersionStamp {
  score_version: string;
  valuation_version: string;
  signal_version: string;
  data_snapshot_version: string;
  calculation_timestamp: string;
}

export function currentModelVersionStamp(now = new Date()): ModelVersionStamp {
  return {
    score_version: SCORE_VERSION,
    valuation_version: VALUATION_VERSION,
    signal_version: SIGNAL_VERSION,
    data_snapshot_version: DATA_SNAPSHOT_VERSION,
    calculation_timestamp: now.toISOString(),
  };
}

export function partitionByScoreVersion<T extends object>(
  rows: T[],
  requestedVersion: string | null = SCORE_VERSION
): {
  version: string | null;
  accepted: T[];
  rejected: T[];
  rejectedReason: string | null;
  mixed: boolean;
  unversionedCount: number;
} {
  const counts = new Map<string, number>();
  let unversionedCount = 0;

  for (const row of rows) {
    const scoreVersion = (row as { score_version?: string | null }).score_version;
    const version = typeof scoreVersion === 'string' ? scoreVersion.trim() : '';
    if (!version) {
      unversionedCount++;
      continue;
    }
    counts.set(version, (counts.get(version) ?? 0) + 1);
  }

  const version = requestedVersion?.trim() || null;

  if (!version) {
    return {
      version: null,
      accepted: [],
      rejected: rows,
      rejectedReason: rows.length ? 'Semua baris histori belum memiliki versi model.' : null,
      mixed: false,
      unversionedCount,
    };
  }

  const accepted: T[] = [];
  const rejected: T[] = [];
  for (const row of rows) {
    const scoreVersion = (row as { score_version?: string | null }).score_version;
    const rowVersion = typeof scoreVersion === 'string' ? scoreVersion.trim() : '';
    if (rowVersion === version) accepted.push(row);
    else rejected.push(row);
  }

  return {
    version: accepted.length ? version : null,
    accepted,
    rejected,
    rejectedReason: rejected.length ? `Dataset berisi histori campuran/legacy; hanya score_version ${version} yang dipakai.` : null,
    mixed: counts.size > 1,
    unversionedCount,
  };
}
