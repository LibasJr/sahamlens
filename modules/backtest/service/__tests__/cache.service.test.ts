import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheMGet: vi.fn(),
}));

import { writeBacktestCache, readBacktestCache } from '../cache.service';
import { cacheGet, cacheSet, cacheMGet } from '../../../../shared/cache/redis-cache';
import type { BacktestIndicatorCache } from '../../types/backtest.types';

const sampleCache: BacktestIndicatorCache = {
  computedAt: '2026-08-01T00:00:00.000Z',
  ihsg: [{ date: '2026-07-31', close: 7000, open: 7000 }],
  tickers: [
    {
      ticker: 'BBCA.JK',
      bars: [{ date: '2026-07-31', close: 9000, open: 9000 }],
      decisions: {
        'EMA 20/50 Cross': ['BULLISH'], 'Volume vs Avg 20D': ['BULLISH'], 'RSI 14': ['NEUTRAL'],
        'MACD': ['BULLISH'], 'Volatility (ATR 14)': ['NEUTRAL'], 'MA Trend IDX (20,50,200)': ['BULLISH'],
        'Support & Resistance': ['NEUTRAL'], 'Market Flow Index': ['BULLISH'], 'SMA Score (5,10,20)': ['BULLISH'],
      },
    },
  ],
};

describe('cache.service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writeBacktestCache menulis satu meta key dan satu key per ticker', async () => {
    await writeBacktestCache(sampleCache);

    expect(vi.mocked(cacheSet)).toHaveBeenCalledTimes(2); // 1 meta + 1 ticker
    const metaCall = vi.mocked(cacheSet).mock.calls.find(([key]) => key.endsWith(':meta'));
    expect(metaCall).toBeTruthy();
    const [, metaValue] = metaCall!;
    expect((metaValue as any).tickers).toEqual(['BBCA.JK']);

    const tickerCall = vi.mocked(cacheSet).mock.calls.find(([key]) => key.includes('BBCA.JK'));
    expect(tickerCall).toBeTruthy();
  });

  it('readBacktestCache mengembalikan null kalau meta key belum ada (cache-miss)', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    const result = await readBacktestCache();
    expect(result).toBeNull();
  });

  it('readBacktestCache menyusun ulang data dari meta + cacheMGet', async () => {
    vi.mocked(cacheGet).mockResolvedValue({
      computedAt: sampleCache.computedAt,
      ihsg: sampleCache.ihsg,
      tickers: ['BBCA.JK'],
    } as any);
    vi.mocked(cacheMGet).mockResolvedValue([sampleCache.tickers[0]] as any);

    const result = await readBacktestCache();

    expect(result).not.toBeNull();
    expect(result!.tickers.length).toBe(1);
    expect(result!.tickers[0].ticker).toBe('BBCA.JK');
    expect(result!.ihsg).toEqual(sampleCache.ihsg);
  });
});
