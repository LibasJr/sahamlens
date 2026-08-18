import { describe, expect, it } from 'vitest';
import {
  calculatePivotPoints,
  calculate52WeekRange,
  calculateATR,
  calculateMultiTimeframeTrends,
  detectCandlestickPatterns,
  calculateTradingPlan,
  buildTechnicalSuite,
  type OHLCVCandle,
} from '../technical-levels';

describe('technical-levels calculation engine', () => {
  const mockCandles: OHLCVCandle[] = Array.from({ length: 50 }, (_, i) => ({
    time: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: 1000 + i * 10,
    high: 1020 + i * 10,
    low: 990 + i * 10,
    close: 1015 + i * 10,
    volume: 50000 + i * 1000,
  }));

  it('calculates Classic, Fibonacci, and Camarilla pivot points correctly', () => {
    const pivots = calculatePivotPoints(1100, 1000, 1050);
    // PP = (1100 + 1000 + 1050) / 3 = 1050
    expect(pivots.CLASSIC.pp).toBe(1050);
    expect(pivots.CLASSIC.r1).toBe(1100); // 2 * 1050 - 1000 = 1100
    expect(pivots.CLASSIC.s1).toBe(1000); // 2 * 1050 - 1100 = 1000

    expect(pivots.FIBONACCI.pp).toBe(1050);
    expect(pivots.FIBONACCI.r1).toBe(1088); // 1050 + 0.382 * 100 = 1088
    expect(pivots.FIBONACCI.s1).toBe(1012); // 1050 - 0.382 * 100 = 1012

    expect(pivots.CAMARILLA.pp).toBe(1050);
  });

  it('calculates 52-week high, low, and position percentage', () => {
    const range = calculate52WeekRange(mockCandles);
    expect(range).not.toBeNull();
    expect(range?.low52w).toBe(990);
    expect(range?.high52w).toBe(1020 + 49 * 10);
    expect(range?.positionPct).toBeGreaterThan(0);
    expect(range?.positionPct).toBeLessThanOrEqual(100);
  });

  it('calculates ATR and dynamic trading plan', () => {
    const atr = calculateATR(mockCandles, 14);
    expect(atr).not.toBeNull();
    expect(atr!).toBeGreaterThan(0);

    const pivots = calculatePivotPoints(1500, 1400, 1450);
    const plan = calculateTradingPlan(mockCandles, pivots);
    expect(plan).not.toBeNull();
    expect(plan?.stopLoss).toBeLessThan(plan!.currentPrice);
    expect(plan?.targetPrice1).toBeGreaterThan(plan!.currentPrice);
    expect(plan?.targetPrice2).toBeGreaterThan(plan!.targetPrice1);
  });

  it('keeps ATR unavailable when candle history is insufficient', () => {
    expect(calculateATR([])).toBeNull();
    expect(calculateATR([mockCandles[0]])).toBeNull();
  });

  it('detects candlestick patterns like Bullish Engulfing and Hammer', () => {
    const engulfingCandles: OHLCVCandle[] = [
      { time: '2026-01-01', open: 1000, high: 1020, low: 980, close: 1010, volume: 1000 },
      { time: '2026-01-02', open: 1010, high: 1015, low: 970, close: 975, volume: 1000 }, // Bearish
      { time: '2026-01-03', open: 970, high: 1030, low: 965, close: 1025, volume: 5000 }, // Huge green engulfing
    ];

    const patterns = detectCandlestickPatterns(engulfingCandles);
    expect(patterns.some((p) => p.id === 'BULLISH_ENGULFING')).toBe(true);
  });


  it('does not confirm candlestick patterns from a partial session with estimated open', () => {
    const candles: OHLCVCandle[] = [
      { time: '2025-12-31', open: 990, high: 1010, low: 980, close: 1000, volume: 1000 },
      { time: '2026-01-01', open: 1000, high: 1020, low: 980, close: 1010, volume: 1000 },
      { time: '2026-01-02', open: 1010, high: 1015, low: 970, close: 975, volume: 1000 },
      { time: '2026-01-03', open: 970, high: 1030, low: 965, close: 1025, volume: 5000 },
      // Secara bentuk ini bisa terlihat bearish, tetapi open-nya proxy visual dan sesi belum final.
      { time: '2026-01-04', open: 1025, high: 1040, low: 950, close: 960, volume: 2000, sessionStatus: 'PARTIAL', openEstimated: true },
    ];

    const patterns = detectCandlestickPatterns(candles);
    expect(patterns.some((p) => p.id === 'BULLISH_ENGULFING')).toBe(true);
    // Pattern tetap berasal dari sesi lengkap 3 Jan, bukan bar partial 4 Jan.
    const suite = buildTechnicalSuite(candles);
    expect(suite?.dataQuality.latestObservationPartial).toBe(true);
    expect(suite?.dataQuality.latestOpenEstimated).toBe(true);
    expect(suite?.dataQuality.patternAsOf).toBe('2026-01-03');
  });

  it('uses completed sessions for ATR while allowing live price as the trading-plan reference', () => {
    const completed: OHLCVCandle[] = Array.from({ length: 20 }, (_, i) => ({
      time: `2026-02-${String(i + 1).padStart(2, '0')}`,
      open: 1000 + i * 5,
      high: 1020 + i * 5,
      low: 990 + i * 5,
      close: 1010 + i * 5,
      volume: 100000,
    }));
    const partial: OHLCVCandle = {
      time: '2026-02-21', open: 1105, high: 1150, low: 1090, close: 1140, volume: 20000,
      sessionStatus: 'PARTIAL', openEstimated: true,
    };
    const candles = [...completed, partial];
    const pivots = calculatePivotPoints(completed.at(-1)!.high, completed.at(-1)!.low, completed.at(-1)!.close);
    const plan = calculateTradingPlan(candles, pivots, partial.close);
    expect(plan?.currentPrice).toBe(1140);
    expect(plan?.atr14).toBe(Math.round(calculateATR(completed, 14)!));
  });

  it('assembles full TechnicalSuiteResult cleanly', () => {
    const suite = buildTechnicalSuite(mockCandles);
    expect(suite).not.toBeNull();
    expect(suite?.pivots.CLASSIC).toBeDefined();
    expect(suite?.trends.length).toBe(3);
    expect(suite?.tradingPlan).toBeDefined();
  });
});
