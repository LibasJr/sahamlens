import { describe, expect, it } from 'vitest';
import {
  PRICE_ADJUSTMENT_VERSION,
  RETURN_PRICE_BASIS,
  TRADING_PRICE_BASIS,
  PriceBasisMismatchError,
  calculateForwardReturnPct,
  detectCorporateAction,
  normalizeYahooOhlcRows,
  selectPriceSeries,
} from '../price-basis';

describe('price-basis policy and normalization (Fase 3)', () => {
  it('stock split 1:5 tidak menghasilkan return ekonomi -80% pada basis adjusted', () => {
    const bars = normalizeYahooOhlcRows([
      { Date: '2026-01-01T00:00:00.000Z', Open: 5000, High: 5000, Low: 5000, Close: 5000, AdjClose: 1000, Volume: 1_000_000 },
      { Date: '2026-01-02T00:00:00.000Z', Open: 1000, High: 1000, Low: 1000, Close: 1000, AdjClose: 1000, Volume: 1_000_000 },
    ], 'TEST.JK');

    const adjusted = selectPriceSeries(bars, RETURN_PRICE_BASIS);
    expect(adjusted.status).toBe('OK');
    expect(adjusted.bars.map((bar) => bar.close)).toEqual([1000, 1000]);

    const detection = detectCorporateAction(bars[0], bars[1]);
    expect(detection.suspected).toBe(true);
    expect(detection.type).toBe('POSSIBLE_SPLIT');

    const ret = calculateForwardReturnPct({
      ticker: 'TEST.JK',
      entryBar: bars[0],
      exitBar: bars[1],
      basis: RETURN_PRICE_BASIS,
      entryField: 'close',
      exitField: 'close',
      roundTripCostPct: 0,
    });
    expect(ret.status).toBe('OK');
    expect(ret.returnPct).toBeCloseTo(0, 8);
  });

  it('reverse split 5:1 tanpa adjusted price valid ditolak, bukan dicatat +400%', () => {
    const bars = normalizeYahooOhlcRows([
      { Date: '2026-01-01T00:00:00.000Z', Open: 200, High: 200, Low: 200, Close: 200, Volume: 1_000_000 },
      { Date: '2026-01-02T00:00:00.000Z', Open: 1000, High: 1000, Low: 1000, Close: 1000, Volume: 1_000_000 },
    ], 'TEST.JK');

    const adjusted = selectPriceSeries(bars, RETURN_PRICE_BASIS);
    expect(adjusted.status).toBe('MISSING_ADJUSTED_PRICE');
    expect(adjusted.invalidCount).toBe(2);

    const ret = calculateForwardReturnPct({
      ticker: 'TEST.JK',
      entryBar: bars[0],
      exitBar: bars[1],
      basis: RETURN_PRICE_BASIS,
      entryField: 'close',
      exitField: 'close',
      roundTripCostPct: 0,
    });
    expect(ret.status).toBe('MISSING_ADJUSTED_PRICE');
    expect(ret.returnPct).toBeNull();
  });

  it('basis entry dan exit berbeda dilempar sebagai PRICE_BASIS_MISMATCH', () => {
    const bars = normalizeYahooOhlcRows([
      { Date: '2026-01-01T00:00:00.000Z', Open: 100, High: 100, Low: 100, Close: 100, AdjClose: 50, Volume: 1 },
      { Date: '2026-01-02T00:00:00.000Z', Open: 110, High: 110, Low: 110, Close: 110, AdjClose: 55, Volume: 1 },
    ], 'TEST.JK');

    expect(() => calculateForwardReturnPct({
      ticker: 'TEST.JK',
      entryBar: bars[0],
      exitBar: bars[1],
      basis: RETURN_PRICE_BASIS,
      entryField: 'close',
      exitField: 'close',
      roundTripCostPct: 0,
      overrideExitBasisForTest: TRADING_PRICE_BASIS,
    })).toThrow(PriceBasisMismatchError);
  });

  it('missing adjusted price tidak fallback ke raw', () => {
    const bars = normalizeYahooOhlcRows([
      { Date: '2026-01-01T00:00:00.000Z', Open: 100, High: 110, Low: 90, Close: 100, AdjClose: 100, Volume: 1 },
      { Date: '2026-01-02T00:00:00.000Z', Open: 100, High: 110, Low: 90, Close: 100, Volume: 1 },
    ], 'TEST.JK');

    const selected = selectPriceSeries(bars, RETURN_PRICE_BASIS);
    expect(selected.status).toBe('MISSING_ADJUSTED_PRICE');
    expect(selected.bars).toHaveLength(1);
  });

  it('adjusted OHLC diturunkan dari adjustment factor yang sama', () => {
    const [bar] = normalizeYahooOhlcRows([
      { Date: '2026-01-01T00:00:00.000Z', Open: 90, High: 110, Low: 80, Close: 100, AdjClose: 50, Volume: 1 },
    ], 'TEST.JK');

    expect(bar.adjustmentFactor).toBe(0.5);
    expect(bar.adjusted.open).toBe(45);
    expect(bar.adjusted.high).toBe(55);
    expect(bar.adjusted.low).toBe(40);
    expect(bar.adjusted.close).toBe(50);
    expect(bar.adjustmentStatus).toBe('DERIVED_FROM_ADJUSTMENT_FACTOR');
    expect(bar.metadata.adjustmentVersion).toBe(PRICE_ADJUSTMENT_VERSION);
  });

  it('invalid adjustment factor tidak division by zero', () => {
    const [bar] = normalizeYahooOhlcRows([
      { Date: '2026-01-01T00:00:00.000Z', Open: 90, High: 110, Low: 80, Close: 0, AdjClose: 50, Volume: 1 },
    ], 'TEST.JK');

    expect(bar.adjustmentStatus).toBe('INVALID_FACTOR');
    expect(bar.adjusted.close).toBeNull();
  });

  it('dividend adjustment memakai adjusted untuk return tetapi raw tetap untuk level trading', () => {
    const bars = normalizeYahooOhlcRows([
      { Date: '2026-01-01T00:00:00.000Z', Open: 100, High: 100, Low: 100, Close: 100, AdjClose: 100, Volume: 1 },
      { Date: '2026-01-02T00:00:00.000Z', Open: 95, High: 95, Low: 95, Close: 95, AdjClose: 100, Volume: 1 },
    ], 'DIV.JK');

    const adjustedRet = calculateForwardReturnPct({
      ticker: 'DIV.JK',
      entryBar: bars[0],
      exitBar: bars[1],
      basis: RETURN_PRICE_BASIS,
      entryField: 'close',
      exitField: 'close',
      roundTripCostPct: 0,
    });

    expect(adjustedRet.returnPct).toBeCloseTo(0, 8);
    expect(selectPriceSeries(bars, TRADING_PRICE_BASIS).bars.map((bar) => bar.close)).toEqual([100, 95]);
  });

  it('gap detector hanya penjaga: raw ekstrem tetapi adjusted normal disangka corporate action', () => {
    const bars = normalizeYahooOhlcRows([
      { Date: '2026-01-01T00:00:00.000Z', Open: 5000, High: 5000, Low: 5000, Close: 5000, AdjClose: 1000, Volume: 1 },
      { Date: '2026-01-02T00:00:00.000Z', Open: 1000, High: 1000, Low: 1000, Close: 1000, AdjClose: 1000, Volume: 1 },
    ], 'SPLIT.JK');

    const detection = detectCorporateAction(bars[0], bars[1]);
    expect(detection).toMatchObject({
      suspected: true,
      type: 'POSSIBLE_SPLIT',
      rawMovePct: -80,
      adjustedMovePct: 0,
    });
    expect(detection.reason).toContain('[HIPOTESIS PENJAGA]');
  });
});
