import { describe, expect, it } from 'vitest';
import {
  buildHybridV2TradingSetup,
  classifyHybridMarketRegime,
  classifyHybridVolatility,
  hybridV2Parameters,
} from '../trading-setup-hybrid-v2';

function trendHistory(direction: 'up' | 'down', length = 90) {
  return Array.from({ length }, (_, index) => {
    const close = direction === 'up' ? 100 + index : 220 - index;
    return { High: close + 3, Low: close - 3, Close: close, AdjClose: close };
  });
}

describe('HYBRID_V2 shadow setup', () => {
  it('mendeteksi regime tren tanpa melihat data masa depan', () => {
    expect(classifyHybridMarketRegime(trendHistory('up'))).toBe('UPTREND');
    expect(classifyHybridMarketRegime(trendHistory('down'))).toBe('DOWNTREND');
  });

  it('fail-closed pada downtrend dan data regime yang belum cukup', () => {
    expect(hybridV2Parameters('DOWNTREND', 'NORMAL')).toBeNull();
    expect(buildHybridV2TradingSetup(trendHistory('down'), 131, 6)).toBeNull();
    expect(buildHybridV2TradingSetup(trendHistory('up', 40), 140, 6)).toBeNull();
  });

  it('memperlebar jarak volatilitas saat regime HIGH', () => {
    const normal = hybridV2Parameters('UPTREND', 'NORMAL');
    const high = hybridV2Parameters('UPTREND', 'HIGH');
    expect(normal).not.toBeNull();
    expect(high).not.toBeNull();
    expect(high!.fallbackStopAtr).toBeGreaterThan(normal!.fallbackStopAtr);
  });

  it('menghasilkan setup shadow berlabel jelas dan RR minimum', () => {
    const history = trendHistory('up');
    const setup = buildHybridV2TradingSetup(history, 189, 6);
    expect(setup).not.toBeNull();
    expect(setup?.engine).toBe('HYBRID_V2');
    expect(setup?.calibrationStatus).toBe('SHADOW_UNCALIBRATED');
    expect(setup?.rr).toBeGreaterThanOrEqual(1.5);
  });

  it('mengklasifikasikan volatilitas secara deterministik', () => {
    const result = classifyHybridVolatility(trendHistory('up'), 6);
    expect(result).not.toBeNull();
    if (result == null) throw new Error('Expected volatility classification for valid history and ATR');
    expect(result.percentile).toBeGreaterThanOrEqual(0);
    expect(result.percentile).toBeLessThanOrEqual(100);
  });
});
