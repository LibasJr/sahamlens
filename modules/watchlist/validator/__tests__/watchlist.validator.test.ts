import { describe, expect, it } from 'vitest';
import { alertSchema } from '../watchlist.validator';

describe('alertSchema', () => {
  it('menolak alert berbasis threshold tanpa target angka', () => {
    const result = alertSchema.safeParse({
      symbol: 'BBCA.JK',
      conditionType: 'LENS_SCORE_ABOVE',
      targetValue: null,
    });

    expect(result.success).toBe(false);
  });

  it('mengizinkan alert LensScore ketika target angka tersedia', () => {
    const result = alertSchema.safeParse({
      symbol: 'BBCA.JK',
      conditionType: 'LENS_SCORE_ABOVE',
      targetValue: 75,
    });

    expect(result.success).toBe(true);
  });

  it('tetap mengizinkan alert RSI tanpa target karena threshold-nya tetap', () => {
    const result = alertSchema.safeParse({
      symbol: 'BBCA.JK',
      conditionType: 'RSI_OVERSOLD',
      targetValue: null,
    });

    expect(result.success).toBe(true);
  });
});
