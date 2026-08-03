import { describe, it, expect } from 'vitest';
import { resolveFundamental } from '../ai-pick-scan.service';

describe('resolveFundamental', () => {
  it('memakai data snapshot kalau tickernya ada', () => {
    const snapshot = {
      'BBCA.JK': { per: 20, pbv: 4, roe: 18, der: 0.3, currentRatio: 1.5, revenueGrowth: 12 },
    };

    expect(resolveFundamental(snapshot, 'BBCA.JK').per).toBe(20);
  });

  it('snapshot null menghasilkan semua field null, bukan error', () => {
    const result = resolveFundamental(null, 'BBCA.JK');

    expect(result).toEqual({
      per: null, pbv: null, roe: null, der: null, currentRatio: null, revenueGrowth: null,
    });
  });

  it('ticker yang tidak ada di snapshot menghasilkan semua field null', () => {
    const snapshot = {
      'BBCA.JK': { per: 20, pbv: 4, roe: 18, der: 0.3, currentRatio: 1.5, revenueGrowth: 12 },
    };

    expect(resolveFundamental(snapshot, 'ANTM.JK').per).toBeNull();
  });
});
