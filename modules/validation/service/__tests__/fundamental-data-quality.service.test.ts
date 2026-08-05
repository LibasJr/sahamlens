import { describe, expect, it } from 'vitest';
import { scoreFundamentalDataQuality } from '../fundamental-data-quality.service';

describe('scoreFundamentalDataQuality', () => {
  it('lulus saat PER/PBV/ROE konsisten dengan price, EPS, dan BVPS', () => {
    const result = scoreFundamentalDataQuality({
      price: 1000,
      eps: 100,
      bvps: 500,
      per: 10,
      pbv: 2,
      roePct: 20,
    });

    expect(result.score).toBe(100);
    expect(result.flags).toEqual([]);
    expect(result.checks.every((c) => c.passed === true)).toBe(true);
  });

  it('menurunkan skor saat PBV tidak cocok dengan price / BVPS', () => {
    const result = scoreFundamentalDataQuality({
      price: 1000,
      eps: 100,
      bvps: 500,
      per: 10,
      pbv: 200,
      roePct: 20,
    });

    expect(result.score).toBe(75);
    expect(result.flags).toContain('PBV_PRICE_BVPS_MISMATCH');
  });

  it('tidak mengarang identity check saat input utama hilang', () => {
    const result = scoreFundamentalDataQuality({
      price: 1000,
      eps: null,
      bvps: null,
      per: null,
      pbv: null,
      roePct: null,
    });

    expect(result.score).toBe(70);
    expect(result.flags).toContain('3_IDENTITY_CHECK_MISSING');
  });
});
