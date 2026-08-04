export type FreshnessValue = 'FRESH' | 'CACHED' | 'STALE' | 'DELAYED' | 'EOD' | 'UNKNOWN';

interface FormatFreshnessLabelInput {
  freshness?: FreshnessValue | null;
  timeLabel?: string | null;
}

interface FreshnessLabelResult {
  text: string;
  stale: boolean;
}

const STALE_VALUES: ReadonlySet<FreshnessValue> = new Set<FreshnessValue>(['STALE', 'UNKNOWN']);

export function formatFreshnessLabel({ freshness, timeLabel }: FormatFreshnessLabelInput): FreshnessLabelResult {
  if (freshness == null && !timeLabel) {
    return { text: 'Memuat waktu update...', stale: false };
  }
  const stale = freshness != null && STALE_VALUES.has(freshness);
  const label = timeLabel ?? '--:--';
  const text = stale
    ? `Updated ${label} • Data mungkin sudah tidak terbaru.`
    : `Updated ${label}`;
  return { text, stale };
}
