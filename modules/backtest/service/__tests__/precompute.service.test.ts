import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../technical', async () => {
  const actual = await vi.importActual<typeof import('../../../technical')>('../../../technical');
  return {
    ...actual,
    fetchYahooHistory: vi.fn(),
  };
});

import { computeTickerSeries, precomputeBacktestData } from '../precompute.service';
import { fetchYahooHistory } from '../../../technical';
import type { OhlcRow } from '../../../technical';

function makeHistory(days: number, startPrice = 1000): OhlcRow[] {
  const rows: OhlcRow[] = [];
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    price += (i % 7 === 0 ? 5 : -2); // pola naik-turun sederhana, bukan random
    const date = new Date(2020, 0, 1 + i).toISOString();
    rows.push({ Date: date, Open: price, High: price + 5, Low: price - 5, Close: price, Volume: 1_000_000 });
  }
  return rows;
}

describe('computeTickerSeries', () => {
  it('mengembalikan null kalau data historis kurang dari buffer lookback 200 hari', () => {
    const history = makeHistory(150);
    expect(computeTickerSeries('TEST.JK', history)).toBeNull();
  });

  it('menghasilkan bars dan decisions sejajar untuk data yang cukup', () => {
    const history = makeHistory(400);
    const result = computeTickerSeries('TEST.JK', history);
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('TEST.JK');
    // 400 hari - 200 buffer = 200 hari keputusan
    expect(result!.bars.length).toBe(200);
    expect(result!.decisions['RSI 14'].length).toBe(200);
    expect(result!.decisions['EMA 20/50 Cross'].length).toBe(200);
    // Setiap keputusan harus salah satu dari 3 nilai yang valid
    const validDecisions = new Set(['BULLISH', 'BEARISH', 'NEUTRAL']);
    result!.decisions['RSI 14'].forEach((d) => expect(validDecisions.has(d)).toBe(true));
  });

  it('memangkas hasil ke RETAIN_DAYS terakhir untuk data yang jauh lebih panjang dari itu', () => {
    const history = makeHistory(1300); // ~5 tahun
    const result = computeTickerSeries('TEST.JK', history);
    expect(result).not.toBeNull();
    expect(result!.bars.length).toBe(560); // RETAIN_DAYS
    expect(result!.decisions['MACD'].length).toBe(560);
  });
});

describe('precomputeBacktestData', () => {
  it('melewati saham yang gagal fetch tanpa menggagalkan yang lain', async () => {
    const goodHistory = makeHistory(400);
    vi.mocked(fetchYahooHistory).mockImplementation(async (ticker: string) => {
      if (ticker === 'BBCA.JK') return null; // simulasikan satu saham gagal fetch
      return { history: goodHistory, currentPrice: goodHistory[goodHistory.length - 1].Close, regularMarketTime: null };
    });

    const result = await precomputeBacktestData();

    expect(result.tickers.find((t) => t.ticker === 'BBCA.JK')).toBeUndefined();
    expect(result.tickers.length).toBeGreaterThan(0);
    expect(result.ihsg.length).toBeGreaterThan(0);
    expect(result.computedAt).toBeTruthy();
  });
});
