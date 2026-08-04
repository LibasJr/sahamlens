import { describe, it, expect } from 'vitest';
import { formatFreshnessLabel } from '../freshness-label';

describe('formatFreshnessLabel', () => {
  it('formats a fresh cache-based label without a stale flag', () => {
    const result = formatFreshnessLabel({ freshness: 'FRESH', timeLabel: '14:32 WIB' });
    expect(result).toEqual({ text: 'Updated 14:32 WIB', stale: false });
  });

  it('formats a cached (not stale) label', () => {
    const result = formatFreshnessLabel({ freshness: 'CACHED', timeLabel: '14:20 WIB' });
    expect(result).toEqual({ text: 'Updated 14:20 WIB', stale: false });
  });

  it('flags STALE as stale and appends the warning sentence', () => {
    const result = formatFreshnessLabel({ freshness: 'STALE', timeLabel: '11:05 WIB' });
    expect(result).toEqual({
      text: 'Updated 11:05 WIB • Data mungkin sudah tidak terbaru.',
      stale: true,
    });
  });

  it('treats market-time DELAYED/EOD as not stale, only STALE/UNKNOWN as stale', () => {
    expect(formatFreshnessLabel({ freshness: 'DELAYED', timeLabel: '14:32 WIB' }).stale).toBe(false);
    expect(formatFreshnessLabel({ freshness: 'EOD', timeLabel: '16:00 WIB' }).stale).toBe(false);
    expect(formatFreshnessLabel({ freshness: 'UNKNOWN', timeLabel: null }).stale).toBe(true);
  });

  it('falls back to a neutral label when there is no timestamp yet', () => {
    const result = formatFreshnessLabel({ freshness: null, timeLabel: null });
    expect(result).toEqual({ text: 'Memuat waktu update...', stale: false });
  });
});
