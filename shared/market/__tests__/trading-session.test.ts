import { describe, expect, it } from 'vitest';
import { sessionVolumeProgressFraction } from '../trading-session';

describe('sessionVolumeProgressFraction', () => {
  it('memakai profil U-shape: 30 menit pertama lebih tebal dari asumsi linear', () => {
    const linearThirtyMinutes = 30 / 360;

    expect(sessionVolumeProgressFraction(30)).toBeGreaterThan(linearThirtyMinutes);
    expect(sessionVolumeProgressFraction(30)).toBeCloseTo(0.18, 4);
  });

  it('tidak membagi nyaris nol pada menit awal', () => {
    expect(sessionVolumeProgressFraction(0)).toBe(0.05);
  });

  it('mencapai 100% setelah sesi selesai', () => {
    expect(sessionVolumeProgressFraction(999)).toBe(1);
  });
});
