import { describe, expect, it } from 'vitest';
import { MANUAL_MARKET_REFERENCE_REVIEWS } from '../manual-reference-review';

describe('manual market reference freshness', () => {
  it('semua referensi manual punya review window valid dan bukan identity claim terselubung', () => {
    for (const item of MANUAL_MARKET_REFERENCE_REVIEWS) {
      expect(Date.parse(item.reviewedAt)).toBeLessThan(Date.parse(item.reviewBy));
      expect(item.identityClaim).toBe(false);
      expect(item.purpose.toLowerCase()).toContain('bukan');
    }
  });
});
