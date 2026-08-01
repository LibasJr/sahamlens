import { describe, it, expect } from 'vitest';
import { computeLiveSignal } from '../live-signal.service';
import type { BacktestIndicatorCache, IndicatorName, Decision, TickerIndicatorSeries } from '../../types/backtest.types';

const ALL_INDICATORS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];

function neutralDecisions(days: number): Record<IndicatorName, Decision[]> {
  const map = {} as Record<IndicatorName, Decision[]>;
  ALL_INDICATORS.forEach((name) => { map[name] = new Array(days).fill('NEUTRAL'); });
  return map;
}

// Bikin 1 ticker dengan 3 hari histori - cuma hari TERAKHIR yang dipakai
// computeLiveSignal, tapi butuh >1 hari supaya bentuk data realistis.
function makeTicker(
  ticker: string,
  price: number,
  lastDayOverrides: Partial<Record<IndicatorName, Decision>>
): TickerIndicatorSeries {
  const days = 3;
  const decisions = neutralDecisions(days);
  (Object.keys(lastDayOverrides) as IndicatorName[]).forEach((name) => {
    decisions[name][days - 1] = lastDayOverrides[name]!;
  });
  return {
    ticker,
    bars: [
      { date: '2026-07-30', close: price - 10 },
      { date: '2026-07-31', close: price - 5 },
      { date: '2026-08-01', close: price },
    ],
    decisions,
  };
}

function makeCache(tickers: TickerIndicatorSeries[]): BacktestIndicatorCache {
  return { computedAt: '2026-08-01T16:00:00.000Z', ihsg: [], tickers };
}

describe('computeLiveSignal', () => {
  it('saham cocok kalau SEMUA filter BULLISH di hari terakhir', () => {
    const cache = makeCache([
      makeTicker('BBCA.JK', 9000, { 'RSI 14': 'BULLISH', MACD: 'BULLISH' }),
    ]);
    const result = computeLiveSignal(cache, ['RSI 14', 'MACD']);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].symbol).toBe('BBCA.JK');
    expect(result.matches[0].price).toBe(9000);
    expect(result.dataAsOf).toBe('2026-08-01T16:00:00.000Z');
  });

  it('saham TIDAK cocok kalau salah satu filter tidak BULLISH', () => {
    const cache = makeCache([
      makeTicker('BBCA.JK', 9000, { 'RSI 14': 'BULLISH', MACD: 'NEUTRAL' }),
    ]);
    const result = computeLiveSignal(cache, ['RSI 14', 'MACD']);

    expect(result.matches).toHaveLength(0);
  });

  it('skor dihitung dari SEMUA 9 indikator, bukan cuma yang dipakai sebagai filter', () => {
    const cache = makeCache([
      makeTicker('BBCA.JK', 9000, {
        'RSI 14': 'BULLISH', // filter
        MACD: 'BULLISH', // bukan filter, tapi ikut dihitung skor
        'EMA 20/50 Cross': 'BULLISH', // bukan filter, tapi ikut dihitung skor
      }),
    ]);
    const result = computeLiveSignal(cache, ['RSI 14']);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].score).toBe(3);
  });

  it('urutan hasil dari skor tertinggi ke terendah', () => {
    const cache = makeCache([
      makeTicker('LOW.JK', 1000, { 'RSI 14': 'BULLISH' }),
      makeTicker('HIGH.JK', 2000, { 'RSI 14': 'BULLISH', MACD: 'BULLISH', 'EMA 20/50 Cross': 'BULLISH' }),
    ]);
    const result = computeLiveSignal(cache, ['RSI 14']);

    expect(result.matches.map((m) => m.symbol)).toEqual(['HIGH.JK', 'LOW.JK']);
  });

  it('tie-break alfabetis kalau skor sama', () => {
    const cache = makeCache([
      makeTicker('ZETA.JK', 1000, { 'RSI 14': 'BULLISH' }),
      makeTicker('ALPHA.JK', 1000, { 'RSI 14': 'BULLISH' }),
    ]);
    const result = computeLiveSignal(cache, ['RSI 14']);

    expect(result.matches.map((m) => m.symbol)).toEqual(['ALPHA.JK', 'ZETA.JK']);
  });

  it('hasil kosong kalau tidak ada saham yang cocok', () => {
    const cache = makeCache([
      makeTicker('BBCA.JK', 9000, { 'RSI 14': 'NEUTRAL' }),
    ]);
    const result = computeLiveSignal(cache, ['RSI 14']);

    expect(result.matches).toEqual([]);
  });

  it('saham dengan bar terakhir BUKAN hari bursa terakhir (suspend/halt) tidak ikut cocok', () => {
    const cache: BacktestIndicatorCache = {
      computedAt: '2026-08-01T16:00:00.000Z',
      ihsg: [
        { date: '2026-07-30', close: 7000 },
        { date: '2026-07-31', close: 7010 },
        { date: '2026-08-01', close: 7020 }, // hari bursa terakhir
      ],
      tickers: [
        makeTicker('STALE.JK', 1000, { 'RSI 14': 'BULLISH' }), // bar terakhirnya 2026-08-01 juga di helper - override di bawah
      ],
    };
    // makeTicker's last bar date is '2026-08-01' - force it stale by rewriting the last bar's date
    cache.tickers[0].bars[2].date = '2026-07-25'; // saham ini berhenti update jauh sebelum hari bursa terakhir

    const result = computeLiveSignal(cache, ['RSI 14']);

    expect(result.matches).toEqual([]);
  });

  it('saham dengan bar terakhir SAMA dengan hari bursa terakhir tetap cocok', () => {
    const cache: BacktestIndicatorCache = {
      computedAt: '2026-08-01T16:00:00.000Z',
      ihsg: [
        { date: '2026-07-31', close: 7010 },
        { date: '2026-08-01', close: 7020 },
      ],
      tickers: [makeTicker('FRESH.JK', 9000, { 'RSI 14': 'BULLISH' })], // last bar date is '2026-08-01' per makeTicker
    };

    const result = computeLiveSignal(cache, ['RSI 14']);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].symbol).toBe('FRESH.JK');
  });
});
