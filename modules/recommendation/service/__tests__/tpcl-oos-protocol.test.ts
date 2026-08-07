import { describe, expect, it } from 'vitest';
import { DEFAULT_TRADING_SETUP_PARAMETERS } from '../trading-setup';

describe('TP/CL forward OOS protocol freeze', () => {
  it('keeps the frozen baseline parameters stable', () => {
    expect(DEFAULT_TRADING_SETUP_PARAMETERS).toEqual({
      supportBufferAtr: 0.25,
      minStopDistanceAtr: 0.75,
      fallbackStopAtr: 1.5,
      minLongRr: 1.5,
      tp1R: 2,
      tp2R: 3,
    });
  });

  it('freeze-date comparison is strictly post-freeze', () => {
    const freeze = '2026-08-07';
    expect('2026-08-07' > freeze).toBe(false);
    expect('2026-08-08' > freeze).toBe(true);
  });
});
