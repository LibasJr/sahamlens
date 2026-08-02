import { describe, it, expect } from 'vitest';
import { simulateBacktest } from '../simulate.service';
import type { BacktestIndicatorCache, IndicatorName, Decision } from '../../types/backtest.types';

const ALL_INDICATORS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];

function neutralDecisions(days: number): Record<IndicatorName, Decision[]> {
  const map = {} as Record<IndicatorName, Decision[]>;
  ALL_INDICATORS.forEach((name) => { map[name] = new Array(days).fill('NEUTRAL'); });
  return map;
}

function dateAt(i: number): string {
  const d = new Date(2024, 0, 1 + i);
  return d.toISOString().split('T')[0];
}

function makeCache(days: number): BacktestIndicatorCache {
  const bars = Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: 1000, open: 1000 }));
  return {
    computedAt: '2026-08-01T00:00:00.000Z',
    ihsg: bars.map((b) => ({ ...b })),
    tickers: [{ ticker: 'TEST.JK', bars: bars.map((b) => ({ ...b })), decisions: neutralDecisions(days) }],
  };
}

describe('simulateBacktest', () => {
  it('tidak ada trade kalau filter tidak pernah semua BULLISH - metrik nol, bukan NaN/Infinity', () => {
    const cache = makeCache(66); // 3 bulan ~= 66 hari bursa
    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    expect(result.totalTrades).toBe(0);
    expect(result.winRatePct).toBe(0);
    expect(Number.isFinite(result.winRatePct)).toBe(true);
    expect(Number.isFinite(result.returnPct)).toBe(true);
    expect(result.equityCurve[0]).toBe(100_000_000);
  });

  it('sinyal hari D baru dieksekusi di OPEN hari D+1 (bukan close hari yang sama) - anti look-ahead', () => {
    const days = 66;
    const cache = makeCache(days);
    const decisions = cache.tickers[0].decisions;
    const bars = cache.tickers[0].bars;

    // BULLISH terus dari hari 0 sampai hari 20, lalu balik NEUTRAL - harga naik terus
    // supaya trade ini profit (memverifikasi arah pnl juga benar setelah fee/slippage).
    for (let i = 0; i < days; i++) {
      decisions['RSI 14'][i] = i <= 20 ? 'BULLISH' : 'NEUTRAL';
      bars[i].close = 1000 + i * 10;
      bars[i].open = 1000 + i * 10;
    }

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    expect(result.totalTrades).toBe(1);
    // Sinyal muncul hari 0, tapi baru bisa dieksekusi di open hari 1 - bukan hari 0.
    expect(result.trades[0].entryDate).toBe(dateAt(1));
    // Sinyal berbalik hari 21, dieksekusi di open hari 22.
    expect(result.trades[0].date).toBe(dateAt(22));
    expect(result.trades[0].pnlPct).toBeGreaterThan(0);
    expect(result.winRatePct).toBe(100);
  });

  it('buy/sell price sudah net slippage+fee, bukan harga open mentah', () => {
    const days = 66; // >= periodMonths*22 hari bursa, kalau kurang ticker ini kefilter (index.size check)
    const cache = makeCache(days);
    const decisions = cache.tickers[0].decisions;
    const bars = cache.tickers[0].bars;
    decisions['RSI 14'] = new Array(days).fill('BULLISH');
    bars.forEach((b) => { b.close = 1000; b.open = 1000; });

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    // Entry hari 1 di open 1000, harus LEBIH MAHAL dari 1000 (slippage+fee beli).
    expect(result.trades[0].buy).toBeGreaterThan(1000);
    // Force-close di harga close 1000, harus LEBIH MURAH dari 1000 (slippage+fee jual).
    expect(result.trades[0].sell).toBeLessThan(1000);
    // Harga beli & jual sama-sama 1000 sebelum biaya -> net PnL harus negatif (cuma
    // bayar fee bolak-balik, tidak ada pergerakan harga sama sekali).
    expect(result.trades[0].pnlPct).toBeLessThan(0);
  });

  it('maksimal 5 posisi terbuka bersamaan, equal-weight dari ekuitas saat itu', () => {
    const days = 66;
    const cache: BacktestIndicatorCache = {
      computedAt: '2026-08-01T00:00:00.000Z',
      ihsg: Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: 1000, open: 1000 })),
      tickers: Array.from({ length: 8 }, (_, tIdx) => ({
        ticker: `T${tIdx}.JK`,
        bars: Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: 1000, open: 1000 })),
        // Semua 8 saham sinyal BULLISH terus sepanjang periode - cuma 5 yang boleh terisi.
        decisions: (() => {
          const m = {} as Record<IndicatorName, Decision[]>;
          ALL_INDICATORS.forEach((name) => { m[name] = new Array(days).fill(name === 'RSI 14' ? 'BULLISH' : 'NEUTRAL'); });
          return m;
        })(),
      })),
    };

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    // Tidak ada exit (sinyal BULLISH terus), jadi posisi terbuka di-force-close di
    // akhir periode - totalTrades harus PERSIS 5 (bukan 8), membuktikan cap slot.
    expect(result.totalTrades).toBe(5);
  });

  it('posisi yang masih terbuka di akhir periode di-force-close, bukan diabaikan', () => {
    const days = 66;
    const cache = makeCache(days);
    // BULLISH dari awal sampai akhir, tidak pernah exit sebelum periode habis.
    cache.tickers[0].decisions['RSI 14'] = new Array(days).fill('BULLISH');
    cache.tickers[0].bars.forEach((b, i) => { b.close = 1000 + i; b.open = 1000 + i; });

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    expect(result.totalTrades).toBe(1);
    expect(result.trades[0].date).toBe(dateAt(days - 1)); // exit dipaksa di hari terakhir
  });

  it('alpha vs IHSG dihitung dari perbandingan return strategi vs return IHSG di window yang sama', () => {
    const days = 66;
    const cache = makeCache(days);
    cache.ihsg.forEach((b, i) => { b.close = 7000 + i * 5; }); // IHSG naik terus

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    const expectedIhsgReturn = ((cache.ihsg[days - 1].close - cache.ihsg[0].close) / cache.ihsg[0].close) * 100;
    expect(result.ihsgReturnPct).toBeCloseTo(expectedIhsgReturn, 1);
    expect(result.alphaPct).toBeCloseTo(result.returnPct - result.ihsgReturnPct, 1);
  });
});
