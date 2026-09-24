import { describe, expect, it } from 'vitest';
import { shouldCaptureBiRateEvidence } from '../public-macro-dashboard.service';

describe('shouldCaptureBiRateEvidence', () => {
  it('mencatat saat belum ada bukti sama sekali', () => {
    expect(shouldCaptureBiRateEvidence({ liveValuePct: 5.75, latestValuePct: null })).toBe(true);
  });

  it('TIDAK mencatat saat nilainya sama (mencegah kesegaran palsu)', () => {
    expect(shouldCaptureBiRateEvidence({ liveValuePct: 5.75, latestValuePct: 5.75 })).toBe(false);
  });

  it('mencatat saat keputusan berubah', () => {
    expect(shouldCaptureBiRateEvidence({ liveValuePct: 5.5, latestValuePct: 5.75 })).toBe(true);
    expect(shouldCaptureBiRateEvidence({ liveValuePct: 6, latestValuePct: 5.75 })).toBe(true);
  });

  it('menolak nilai live yang tidak masuk akal', () => {
    expect(shouldCaptureBiRateEvidence({ liveValuePct: Number.NaN, latestValuePct: 5.75 })).toBe(false);
  });
});
