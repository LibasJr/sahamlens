import { describe, expect, it } from 'vitest';
import {
  atrSeries,
  bollingerSeries,
  cmfSeries,
  emaSeries,
  heikinAshi,
  macdSeries,
  rsiSeries,
  smaSeries,
  type ChartCandle,
} from '@/lib/chart-indicators';

function candles(count = 80): ChartCandle[] {
  return Array.from({ length: count }, (_, index) => ({
    time: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    open: 100 + index,
    high: 103 + index,
    low: 98 + index,
    close: 101 + index,
    volume: 1_000 + index * 10,
  }));
}

describe('chart indicator visual calculations', () => {
  it('builds Heikin Ashi as a derived view without mutating source OHLC', () => {
    const source = candles(5);
    const before = structuredClone(source);
    const derived = heikinAshi(source);

    expect(derived).toHaveLength(source.length);
    expect(derived[0].close).toBe((source[0].open + source[0].high + source[0].low + source[0].close) / 4);
    expect(source).toEqual(before);
  });

  it('respects warm-up periods for moving averages', () => {
    const source = candles(60);
    const sma20 = smaSeries(source, 20);
    const ema20 = emaSeries(source, 20);

    expect(sma20.slice(0, 19).every((value) => value == null)).toBe(true);
    expect(ema20.slice(0, 19).every((value) => value == null)).toBe(true);
    expect(sma20[19]).toBeTypeOf('number');
    expect(ema20[19]).toBeTypeOf('number');
  });

  it('keeps RSI in the canonical 0-100 range', () => {
    const values = rsiSeries(candles(80), 14).filter((value): value is number => value != null);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((value) => value >= 0 && value <= 100)).toBe(true);
  });

  it('produces aligned MACD, ATR, CMF and Bollinger series', () => {
    const source = candles(100);
    const macd = macdSeries(source, 12, 26, 9);
    const atr = atrSeries(source, 14);
    const cmf = cmfSeries(source, 20);
    const bb = bollingerSeries(source, 20, 2);

    expect(macd.macd).toHaveLength(source.length);
    expect(macd.signal).toHaveLength(source.length);
    expect(macd.histogram).toHaveLength(source.length);
    expect(atr).toHaveLength(source.length);
    expect(cmf).toHaveLength(source.length);
    expect(bb.middle).toHaveLength(source.length);
    expect(bb.upper).toHaveLength(source.length);
    expect(bb.lower).toHaveLength(source.length);
    expect(atr.filter((value): value is number => value != null).every((value) => value >= 0)).toBe(true);
    expect(cmf.filter((value): value is number => value != null).every(Number.isFinite)).toBe(true);
  });
});
