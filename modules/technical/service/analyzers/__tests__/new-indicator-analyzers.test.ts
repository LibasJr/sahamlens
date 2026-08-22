import { describe, expect, it } from 'vitest';
import { analyze as analyzeStochastic } from '../stochastic-analyzer';
import { analyze as analyzeBollinger } from '../bollinger-analyzer';
import { analyze as analyzeAdx } from '../adx-analyzer';
import { analyze as analyzeObv } from '../obv-analyzer';
import { analyze as analyzeWilliamsR } from '../williams-r-analyzer';

// Bar OHLC sintetis bentuk Yahoo (High/Low/Close/AdjClose/Volume berhuruf besar, sama
// dengan fixture di rsi-analyzer.ts/macd-analyzer.ts). `uptrendHistory`/`downtrendHistory`
// menaikkan/menurunkan harga secara konstan, cukup panjang (40 bar) untuk seluruh 5
// analyzer sekaligus (ADX butuh paling banyak: 2 x ADX_PERIOD = 28).
function uptrendHistory(n = 40) {
  const rows: any[] = [];
  let base = 1000;
  for (let i = 0; i < n; i++) {
    base += 10;
    rows.push({ High: base + 5, Low: base - 5, Close: base, AdjClose: base, Volume: 100_000 + i * 500 });
  }
  return rows;
}

function downtrendHistory(n = 40) {
  const rows: any[] = [];
  let base = 2000;
  for (let i = 0; i < n; i++) {
    base -= 10;
    rows.push({ High: base + 5, Low: base - 5, Close: base, AdjClose: base, Volume: 100_000 + i * 500 });
  }
  return rows;
}

function sidewaysHistory(n = 40) {
  const rows: any[] = [];
  for (let i = 0; i < n; i++) {
    const base = 1000 + (i % 2 === 0 ? 3 : -3);
    rows.push({ High: base + 1, Low: base - 1, Close: base, AdjClose: base, Volume: 100_000 });
  }
  return rows;
}

describe('stochastic-analyzer', () => {
  it('history kurang -> N/A, confidence 0, raw null', () => {
    const result = analyzeStochastic(uptrendHistory(10), 1000);
    expect(result).toEqual({ label: 'Stochastic (14,3,3)', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { k: null, d: null } });
  });

  it('uptrend kuat -> %K tinggi, BEARISH (overbought), label literal', () => {
    const result = analyzeStochastic(uptrendHistory(), 1400);
    expect(result.label).toBe('Stochastic (14,3,3)');
    expect(result.raw.k).toBeGreaterThan(80);
    expect(result.decision).toBe('BEARISH');
  });

  it('downtrend kuat -> %K rendah, BULLISH (oversold)', () => {
    const result = analyzeStochastic(downtrendHistory(), 1600);
    expect(result.raw.k).toBeLessThan(20);
    expect(result.decision).toBe('BULLISH');
  });
});

describe('bollinger-analyzer', () => {
  it('history kurang dari 20 bar -> N/A', () => {
    const result = analyzeBollinger(uptrendHistory(10), 1000);
    expect(result.decision).toBe('NEUTRAL');
    expect(result.value).toBe('N/A');
    expect(result.raw.upper).toBeNull();
  });

  it('uptrend kuat -> harga di/atas upper band -> BEARISH', () => {
    const history = uptrendHistory();
    const currentPrice = history[history.length - 1].AdjClose;
    const result = analyzeBollinger(history, currentPrice);
    expect(result.label).toBe('Bollinger Bands (20,2)');
    expect(result.raw.percentB).toBeGreaterThan(0.5);
  });

  it('AdjClose hilang -> N/A dengan alasan eksplisit, bukan fallback ke Close', () => {
    const history = uptrendHistory().map((h) => ({ ...h, AdjClose: undefined }));
    const result = analyzeBollinger(history, 1000);
    expect(result.value).toBe('N/A (MISSING_ADJUSTED_PRICE)');
  });
});

describe('adx-analyzer', () => {
  it('history kurang dari 2 x ADX_PERIOD -> N/A', () => {
    const result = analyzeAdx(uptrendHistory(20), 1000);
    expect(result.value).toBe('N/A');
    expect(result.raw.adx).toBeNull();
  });

  it('tren naik kuat murni -> ADX tinggi, +DI > -DI, BULLISH', () => {
    const result = analyzeAdx(uptrendHistory(), 1400);
    expect(result.label).toBe('ADX (14)');
    expect(result.raw.adx).toBeGreaterThan(25);
    expect(result.decision).toBe('BULLISH');
  });

  it('tren turun kuat murni -> -DI > +DI, BEARISH', () => {
    const result = analyzeAdx(downtrendHistory(), 1600);
    expect(result.decision).toBe('BEARISH');
  });

  it('sideways (ADX rendah) -> NEUTRAL, tidak ikut arah DI yang kebetulan lebih besar', () => {
    const result = analyzeAdx(sidewaysHistory(), 1000);
    expect(result.raw.adx).toBeLessThan(25);
    expect(result.decision).toBe('NEUTRAL');
  });
});

describe('obv-analyzer', () => {
  it('history kurang -> N/A', () => {
    const result = analyzeObv(uptrendHistory(5), 1000);
    expect(result.value).toBe('N/A');
  });

  it('uptrend murni (volume selalu ikut naik searah harga) -> OBV naik -> BULLISH', () => {
    const result = analyzeObv(uptrendHistory(), 1400);
    expect(result.label).toBe('OBV (10)');
    expect(result.raw.slope).toBeGreaterThan(0);
    expect(result.decision).toBe('BULLISH');
  });

  it('downtrend murni -> OBV turun -> BEARISH', () => {
    const result = analyzeObv(downtrendHistory(), 1600);
    expect(result.raw.slope).toBeLessThan(0);
    expect(result.decision).toBe('BEARISH');
  });

  it('Volume hilang -> N/A dengan alasan eksplisit', () => {
    const history = uptrendHistory().map((h) => ({ ...h, Volume: undefined }));
    const result = analyzeObv(history, 1000);
    expect(result.value).toBe('N/A (MISSING_ADJUSTED_PRICE_OR_VOLUME)');
  });
});

describe('williams-r-analyzer', () => {
  it('history kurang dari period -> N/A', () => {
    const result = analyzeWilliamsR(uptrendHistory(5), 1000);
    expect(result.value).toBe('N/A');
  });

  it('uptrend kuat -> %R dekat 0 (puncak range) -> BEARISH (overbought)', () => {
    const result = analyzeWilliamsR(uptrendHistory(), 1400);
    expect(result.label).toBe('Williams %R (14)');
    expect(result.raw.williamsR).toBeGreaterThan(-20);
    expect(result.decision).toBe('BEARISH');
  });

  it('downtrend kuat -> %R dekat -100 (dasar range) -> BULLISH (oversold)', () => {
    const result = analyzeWilliamsR(downtrendHistory(), 1600);
    expect(result.raw.williamsR).toBeLessThan(-80);
    expect(result.decision).toBe('BULLISH');
  });
});
