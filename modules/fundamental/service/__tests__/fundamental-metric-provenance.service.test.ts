import { describe, expect, it } from 'vitest';
import { buildFundamentalMetricProvenance } from '../fundamental-metric-provenance.service';

describe('buildFundamentalMetricProvenance', () => {
  it('membawa metadata provider current ke setiap metrik tanpa mengubah nilainya', () => {
    const result = buildFundamentalMetricProvenance({
      source: {
        provider: 'Yahoo Finance',
        retrievedAt: '2026-08-27T07:00:00.000Z',
        period: 'Snapshot terbaru yang tersedia',
      },
      fundamentals: {
        trailingPE: 12.5,
        financialCurrency: 'IDR',
        dividendYield: null,
      },
    });

    expect(result.fundamentals.trailingPE).toEqual({
      value: 12.5,
      provenance: expect.objectContaining({
        source: 'Yahoo Finance',
        retrievedAt: '2026-08-27T07:00:00.000Z',
        period: 'Snapshot terbaru yang tersedia',
        confidence: 'unknown',
        isEstimated: false,
      }),
    });
    expect(result.fundamentals.financialCurrency.value).toBe('IDR');
    expect(result.fundamentals.dividendYield.value).toBeNull();
  });

  it('menggunakan observed_date dan period_end untuk provenance PIT', () => {
    const result = buildFundamentalMetricProvenance({
      mode: 'PIT',
      pit: {
        observed_date: '2026-05-02',
        period_end: '2026-03-31',
      },
      fundamentals: {
        trailingPE: 10.1,
        returnOnEquity: 0.18,
      },
    });

    expect(result.fundamentals.returnOnEquity).toEqual({
      value: 0.18,
      provenance: expect.objectContaining({
        source: 'fundamental-history-pit',
        asOf: '2026-05-02',
        period: '2026-03-31',
        confidence: 'unknown',
        isEstimated: false,
      }),
    });
  });

  it('mengabaikan value non-scalar agar provenance finansial tetap typed', () => {
    const result = buildFundamentalMetricProvenance({
      fundamentals: {
        trailingPE: 10,
        nested: { value: 1 },
        list: [1, 2],
      },
    });

    expect(Object.keys(result.fundamentals)).toEqual(['trailingPE']);
  });
});
