import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_LIQUID_UNIVERSE_TARGET_SIZE,
  ACTIVE_LIQUID_UNIVERSE_VERSION,
} from '@/modules/market/constants/ai-pick-universe';

vi.mock('../redis-cache', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

import { cacheSet } from '../redis-cache';
import { COMPUTED_CACHE_KEY } from '../computed-keys';
import { writeAiPickScores } from '../ai-pick-cache';

describe('ai-pick universe cache', () => {
  beforeEach(() => {
    vi.mocked(cacheSet).mockReset();
  });

  it('screener cache key dibedakan oleh versi universe aktif', () => {
    expect(COMPUTED_CACHE_KEY.SCREENER_UNIVERSE).toContain(ACTIVE_LIQUID_UNIVERSE_VERSION);
  });

  it('writeAiPickScores menyimpan metadata universe v2 bersama payload', async () => {
    await writeAiPickScores({
      computedAt: '2026-08-15T10:00:00.000Z',
      scores: [],
      bearishSymbols: [],
    });

    expect(cacheSet).toHaveBeenCalledTimes(1);
    const [key, payload] = vi.mocked(cacheSet).mock.calls[0];
    expect(String(key)).toContain(ACTIVE_LIQUID_UNIVERSE_VERSION);
    expect(payload).toMatchObject({
      universeVersion: ACTIVE_LIQUID_UNIVERSE_VERSION,
      universeSize: ACTIVE_LIQUID_UNIVERSE_TARGET_SIZE,
    });
  });
});
