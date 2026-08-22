import { describe, expect, it } from 'vitest';
import {
  adxSeriesForChart,
  atrSeries,
  bollingerSeries,
  cmfSeries,
  emaSeries,
  heikinAshi,
  macdSeries,
  obvSeriesForChart,
  rsiSeries,
  smaSeries,
  stochasticSeriesForChart,
  williamsRSeriesForChart,
  type ChartCandle,
} from '@/lib/chart-indicators';
import { calculateStochastic } from '@/modules/technical/service/stochastic';
import { calculateWilliamsR } from '@/modules/technical/service/williams-r';
import { calculateAdx } from '@/modules/technical/service/adx';

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

  // Stochastic/Williams %R/ADX/OBV (2026-08-22) - dihitung lewat implementasi kanonis
  // di modules/technical/service/. Test di bawah tidak mengulang golden test formula
  // (sudah ada di modules/technical/service/__tests__/) - fokusnya cuma satu hal: deret
  // "bertahap" untuk chart (stochasticSeriesForChart dst) di INDEX TERAKHIR menghasilkan
  // angka yang SAMA PERSIS dengan memanggil fungsi kanonis langsung atas seluruh histori
  // itu. Kalau dua jalur ini berbeda, garis yang dilihat pengguna di chart bukan angka
  // yang sama dengan yang dipakai analyzer/scoring - persis kelas bug yang berulang kali
  // terjadi di app ini (RSI/EMA/ATR, lihat komentar riwayat bug di ema.ts/atr.ts).
  it('stochasticSeriesForChart pada bar terakhir cocok dengan calculateStochastic langsung', () => {
    const source = candles(60);
    const { k, d } = stochasticSeriesForChart(source, 14);
    const bars = source.map((c) => ({ high: c.high, low: c.low, close: c.close }));
    const direct = calculateStochastic(bars, 14);

    expect(k[k.length - 1]).toBeCloseTo(direct!.k, 10);
    expect(d[d.length - 1]).toBeCloseTo(direct!.d, 10);
    expect(k.slice(0, 17).every((value) => value == null)).toBe(true); // warm-up: 14+3+3-2=18 bar
    expect(k.filter((v): v is number => v != null).every((v) => v >= 0 && v <= 100)).toBe(true);
  });

  it('williamsRSeriesForChart pada bar terakhir cocok dengan calculateWilliamsR langsung', () => {
    const source = candles(60);
    const series = williamsRSeriesForChart(source, 14);
    const bars = source.map((c) => ({ high: c.high, low: c.low, close: c.close }));
    const direct = calculateWilliamsR(bars, 14);

    expect(series[series.length - 1]).toBeCloseTo(direct!, 10);
    expect(series.slice(0, 13).every((value) => value == null)).toBe(true); // warm-up: period=14
    expect(series.filter((v): v is number => v != null).every((v) => v >= -100 && v <= 0)).toBe(true);
  });

  it('adxSeriesForChart pada bar terakhir cocok dengan calculateAdx langsung', () => {
    const source = candles(80);
    const { adx, plusDi, minusDi } = adxSeriesForChart(source, 14);
    const bars = source.map((c) => ({ high: c.high, low: c.low, close: c.close }));
    const direct = calculateAdx(bars, 14);

    expect(adx[adx.length - 1]).toBeCloseTo(direct!.adx, 10);
    expect(plusDi[plusDi.length - 1]).toBeCloseTo(direct!.plusDi, 10);
    expect(minusDi[minusDi.length - 1]).toBeCloseTo(direct!.minusDi, 10);
    expect(adx.slice(0, 27).every((value) => value == null)).toBe(true); // warm-up: 2*period=28 bar
    expect(adx.filter((v): v is number => v != null).every((v) => v >= 0 && v <= 100)).toBe(true);
  });

  it('obvSeriesForChart selalu terdefinisi penuh (kumulatif, tidak ada warm-up)', () => {
    const source = candles(30);
    const series = obvSeriesForChart(source);

    expect(series).toHaveLength(source.length);
    expect(series[0]).toBe(0);
    expect(series.every(Number.isFinite)).toBe(true);
    // Deret `candles()` di atas MONOTON naik (close = 101+index tiap bar), jadi setiap
    // hari adalah hari "naik" - OBV harus naik kumulatif sepanjang deret.
    for (let i = 1; i < series.length; i += 1) expect(series[i]).toBeGreaterThan(series[i - 1]);
  });
});
