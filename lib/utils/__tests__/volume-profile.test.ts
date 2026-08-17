import { describe, expect, it } from 'vitest';
import { computeVolumeProfile } from '../volume-profile';

describe('computeVolumeProfile', () => {
  it('menghitung POC (Point of Control) dan Value Area dengan benar', () => {
    const candles = [
      { open: 1000, high: 1050, low: 980, close: 1040, volume: 100_000 },
      { open: 1040, high: 1080, low: 1030, close: 1070, volume: 200_000 },
      { open: 1070, high: 1100, low: 1050, close: 1080, volume: 500_000 }, // High volume node
      { open: 1080, high: 1120, low: 1070, close: 1110, volume: 150_000 },
      { open: 1110, high: 1150, low: 1100, close: 1130, volume: 50_000 },
    ];

    const vp = computeVolumeProfile(candles, 10);

    expect(vp).not.toBeNull();
    expect(vp!.bins.length).toBe(10);
    expect(vp!.totalVolume).toBe(1_000_000);
    expect(vp!.pocPrice).toBeGreaterThanOrEqual(1050);
    expect(vp!.pocPrice).toBeLessThanOrEqual(1100);
    expect(vp!.vahPrice).toBeGreaterThan(vp!.valPrice);
  });

  it('mengembalikan null jika candle kosong', () => {
    expect(computeVolumeProfile([])).toBeNull();
  });
});
