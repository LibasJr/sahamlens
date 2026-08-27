import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/backtest', () => ({
  readBacktestCache: vi.fn(),
  precomputeBacktestData: vi.fn(),
  writeBacktestCache: vi.fn(),
  simulateBacktest: vi.fn(),
  calculateBacktestSignificance: vi.fn(),
}));

import { readBacktestCache, simulateBacktest } from '@/modules/backtest';
import { runBacktestSimulation } from '../backtest-run.service';

describe('runBacktestSimulation request boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([null, 'invalid', 123, [], true])(
    'rejects non-object payload %p before touching cache or simulator',
    async (payload) => {
      const result = await runBacktestSimulation(payload, { isGuest: true });

      expect(result).toEqual({
        ok: false,
        status: 400,
        body: { error: 'Pilih minimal 1 filter' },
      });
      expect(readBacktestCache).not.toHaveBeenCalled();
      expect(simulateBacktest).not.toHaveBeenCalled();
    },
  );

  it('rejects mixed known and unknown filters before touching cache', async () => {
    const result = await runBacktestSimulation(
      {
        filters: ['RSI 14', { injected: true }],
        modal: 10_000_000,
        period: 12,
      },
      { isGuest: false },
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      body: { error: 'Filter tidak dikenal' },
    });
    expect(readBacktestCache).not.toHaveBeenCalled();
    expect(simulateBacktest).not.toHaveBeenCalled();
  });

  it('keeps normal validation semantics for a typed filter with invalid modal', async () => {
    const result = await runBacktestSimulation(
      { filters: ['RSI 14'], modal: 'not-a-number', period: 12 },
      { isGuest: false },
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      body: { error: 'Modal awal harus lebih dari 0' },
    });
    expect(readBacktestCache).not.toHaveBeenCalled();
    expect(simulateBacktest).not.toHaveBeenCalled();
  });
});
