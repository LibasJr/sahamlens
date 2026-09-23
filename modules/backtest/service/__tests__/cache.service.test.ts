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

  it('menulis shard snapshot dulu lalu mempublikasikan pointer active terakhir', async () => {
    await writeBacktestCache(sampleCache);

    expect(vi.mocked(cacheSet)).toHaveBeenCalledTimes(2); // 1 ticker + 1 pointer/meta
    const calls = vi.mocked(cacheSet).mock.calls;
    expect(calls[0][0]).toContain(':snapshot:');
    expect(calls[0][0]).toContain(':ticker:BBCA.JK');
    expect(calls[1][0].endsWith(':active')).toBe(true);
    expect(calls[1][1]).toMatchObject({
      snapshotId: expect.any(String),
      tickers: ['BBCA.JK'],
    });
    expect(calls[0][0]).toContain((calls[1][1] as any).snapshotId);
  });

  it('tidak mempublikasikan pointer bila penulisan shard gagal', async () => {
    vi.mocked(cacheSet).mockRejectedValueOnce(new Error('shard failed'));
    await expect(writeBacktestCache(sampleCache)).rejects.toThrow('shard failed');
    expect(vi.mocked(cacheSet)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cacheSet).mock.calls[0][0]).toContain(':snapshot:');
  });

  it('readBacktestCache mengembalikan null kalau meta key belum ada (cache-miss)', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    const result = await readBacktestCache();
    expect(result).toBeNull();
  });

  it('readBacktestCache menyusun ulang data dari meta + cacheMGet', async () => {
    vi.mocked(cacheGet).mockResolvedValue({
      snapshotId: 'snapshot-1',
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
    expect(vi.mocked(cacheMGet).mock.calls[0][0][0]).toContain('snapshot-1');
  });

  it('menganggap snapshot tidak lengkap sebagai unavailable, bukan hasil kosong', async () => {
    vi.mocked(cacheGet).mockResolvedValue({
      snapshotId: 'snapshot-partial',
      computedAt: sampleCache.computedAt,
      ihsg: sampleCache.ihsg,
      tickers: ['BBCA.JK'],
    } as any);
    vi.mocked(cacheMGet).mockResolvedValue([null]);

    await expect(readBacktestCache()).resolves.toBeNull();
  });

  it('menolak shard dari ticker/generasi yang tidak cocok', async () => {
    vi.mocked(cacheGet).mockResolvedValue({
      snapshotId: 'snapshot-wrong',
      computedAt: sampleCache.computedAt,
      ihsg: sampleCache.ihsg,
      tickers: ['BBCA.JK'],
    } as any);
    vi.mocked(cacheMGet).mockResolvedValue([{ ...sampleCache.tickers[0], ticker: 'TLKM.JK' }] as any);

    await expect(readBacktestCache()).resolves.toBeNull();
  });
});
