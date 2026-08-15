import { describe, expect, it } from 'vitest';
import { sourceTimestampFromChart } from '../market-summary.service';

describe('market summary source timestamp', () => {
  it('memakai waktu quote provider, bukan waktu server saat request diproses', () => {
    expect(sourceTimestampFromChart({
      meta: { regularMarketTime: 1_785_366_000 },
      timestamp: [1_785_000_000],
    })).toBe(new Date(1_785_366_000 * 1000).toISOString());
  });

  it('mengambil bar terakhir bila quote tidak mengirim regularMarketTime', () => {
    expect(sourceTimestampFromChart({
      timestamp: [1_785_000_000, 1_785_172_800, null, Number.NaN],
    })).toBe(new Date(1_785_172_800 * 1000).toISOString());
  });

  it('fail closed ketika provider tidak memberi timestamp yang valid', () => {
    expect(sourceTimestampFromChart({ meta: {}, timestamp: [] })).toBeNull();
  });
});
