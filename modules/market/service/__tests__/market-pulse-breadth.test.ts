import { describe, expect, it } from 'vitest';
import {
  BREADTH_STAGNANT_BAND_PCT,
  classifyBreadthDirection,
} from '../market-pulse.service';

describe('market breadth direction', () => {
  it('mengklasifikasikan quote nyata dengan satu batas yang sama untuk headline dan daftar emiten', () => {
    const quotes = [
      { symbol: 'AAA', changePct: 1.25 },
      { symbol: 'BBB', changePct: BREADTH_STAGNANT_BAND_PCT },
      { symbol: 'CCC', changePct: -BREADTH_STAGNANT_BAND_PCT },
      { symbol: 'DDD', changePct: -1.25 },
    ];

    const grouped = quotes.reduce<Record<string, string[]>>((result, quote) => {
      const direction = classifyBreadthDirection(quote.changePct);
      result[direction] ??= [];
      result[direction].push(quote.symbol);
      return result;
    }, {});

    expect(grouped.ADVANCING).toEqual(['AAA']);
    expect(grouped.UNCHANGED).toEqual(['BBB', 'CCC']);
    expect(grouped.DECLINING).toEqual(['DDD']);
    expect(Object.values(grouped).flat()).toHaveLength(quotes.length);
  });
});
