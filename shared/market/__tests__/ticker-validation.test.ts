import { describe, expect, it } from 'vitest';
import { normalizeIdxTickerParam } from '../ticker-validation';

describe('normalizeIdxTickerParam', () => {
  it('normalizes IDX equity tickers', () => {
    expect(normalizeIdxTickerParam('bbca')).toBe('BBCA.JK');
    expect(normalizeIdxTickerParam('BBRI.JK')).toBe('BBRI.JK');
  });

  it('rejects path/cache-key injection characters', () => {
    expect(normalizeIdxTickerParam('../BBCA')).toBeNull();
    expect(normalizeIdxTickerParam('BBCA:other')).toBeNull();
    expect(normalizeIdxTickerParam('BBCA/../../x')).toBeNull();
  });

  it('only allows the explicit market index where requested', () => {
    expect(normalizeIdxTickerParam('^JKSE')).toBeNull();
    expect(normalizeIdxTickerParam('^JKSE', { allowMarketIndex: true })).toBe('^JKSE');
  });
});
