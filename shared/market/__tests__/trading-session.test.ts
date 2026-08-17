import { describe, expect, it } from 'vitest';
import { isIdxMarketHoursNow, todayDateKeyWIB } from '../trading-session';

describe('trading-session utilities', () => {
  it('returns a WIB date key without manufacturing market data', () => {
    expect(todayDateKeyWIB()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a boolean market-window hint', () => {
    expect(typeof isIdxMarketHoursNow()).toBe('boolean');
  });
});
