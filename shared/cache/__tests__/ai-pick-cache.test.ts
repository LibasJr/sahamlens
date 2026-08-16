import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_LIQUID_UNIVERSE_TARGET_SIZE,
  ACTIVE_LIQUID_UNIVERSE_VERSION,
} from '@/modules/market/constants/ai-pick-universe';

vi.mock('../redis-cache', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

import { cacheGet, cacheSet } from '../redis-cache';
import { COMPUTED_CACHE_KEY } from '../computed-keys';
import { inspectAiPickScoresCache, readAiPickScores, writeAiPickScores } from '../ai-pick-cache';

describe('ai-pick universe cache', () => {
  beforeEach(() => {
    vi.mocked(cacheSet).mockReset();
    vi.mocked(cacheGet).mockReset();
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

    expect(cacheSet).toHaveBeenCalledTimes(2);
    const [key, payload] = vi.mocked(cacheSet).mock.calls[0];
    expect(String(key)).toContain(ACTIVE_LIQUID_UNIVERSE_VERSION);
    expect(payload).toMatchObject({
      universeVersion: ACTIVE_LIQUID_UNIVERSE_VERSION,
      universeSize: ACTIVE_LIQUID_UNIVERSE_TARGET_SIZE,
    });
  });

  it('memakai snapshot legacy sesi terakhir saat cache universe aktif belum ada', async () => {
    vi.mocked(cacheGet)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        computedAt: '2026-08-14T09:00:00.000Z',
        scores: [],
        bearishSymbols: [],
      });

    const result = await readAiPickScores();

    expect(result).toMatchObject({
      universeVersion: 'idx-liquid-v1-109',
      universeSize: 109,
      computedAt: '2026-08-14T09:00:00.000Z',
    });
  });

  it('melaporkan sumber snapshot cadangan untuk monitor admin', async () => {
    vi.mocked(cacheGet)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        computedAt: '2026-08-14T09:00:00.000Z',
        scores: [],
        bearishSymbols: [],
      });

    await expect(inspectAiPickScoresCache()).resolves.toMatchObject({
      source: 'last-successful',
      data: { computedAt: '2026-08-14T09:00:00.000Z' },
    });
  });
});
