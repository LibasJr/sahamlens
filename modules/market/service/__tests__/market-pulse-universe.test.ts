import { describe, expect, it } from 'vitest';
import { AI_PICK_UNIVERSE } from '../../constants/ai-pick-universe';
import {
  MARKET_BREADTH_STOCKS,
  MARKET_BREADTH_UNIVERSE_TARGET_SIZE,
} from '../market-pulse.service';

describe('market breadth universe', () => {
  it('memakai tepat 100 emiten dari universe likuid aktif tanpa duplikat', () => {
    expect(MARKET_BREADTH_STOCKS).toHaveLength(MARKET_BREADTH_UNIVERSE_TARGET_SIZE);
    expect(new Set(MARKET_BREADTH_STOCKS).size).toBe(MARKET_BREADTH_UNIVERSE_TARGET_SIZE);
    expect(MARKET_BREADTH_STOCKS.every((ticker) => AI_PICK_UNIVERSE.includes(ticker))).toBe(true);
  });
});
