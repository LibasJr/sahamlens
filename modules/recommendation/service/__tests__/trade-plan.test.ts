import { describe, expect, it } from 'vitest';
import {
  buildTradePlanV1,
  TRADE_PLAN_ENTRY_REFERENCE,
  TRADE_PLAN_VERSION,
} from '../trade-plan';

const baseHistory = () => [
  { High: 102, Low: 101, Close: 101 },
  { High: 103, Low: 101, Close: 102 },
  { High: 104, Low: 102, Close: 103 },
  { High: 103, Low: 101, Close: 102 },
  { High: 102, Low: 101, Close: 101 },
  { High: 104, Low: 102, Close: 103 },
  { High: 105, Low: 100, Close: 102 },
  { High: 106, Low: 102, Close: 104 },
  { High: 108, Low: 104, Close: 106 },
  { High: 112, Low: 106, Close: 110 },
  { High: 120, Low: 110, Close: 118 },
  { High: 130, Low: 115, Close: 120 },
  { High: 128, Low: 112, Close: 116 },
  { High: 118, Low: 108, Close: 112 },
  { High: 112, Low: 104, Close: 108 },
  { High: 110, Low: 103, Close: 106 },
  { High: 109, Low: 103, Close: 106 },
  { High: 110, Low: 104, Close: 107 },
  { High: 111, Low: 105, Close: 108 },
  { High: 112, Low: 105, Close: 106 },
];

describe('buildTradePlanV1', () => {
  it('membuat rencana TP/CL dengan entry Open H+1 dan metadata profesional', () => {
    const plan = buildTradePlanV1({
      history: baseHistory(),
      currentPrice: 106,
      atr: 5,
      adx: 32,
      plusDi: 34,
      minusDi: 18,
      bollingerPercentB: 0.62,
      volumeRatio: 1.8,
      officialNetPressure20: 12.5,
      officialPositiveRatio20: 0.65,
    });

    expect(plan).not.toBeNull();
    if (!plan) throw new Error('plan null');

    expect(plan.version).toBe(TRADE_PLAN_VERSION);
    expect(plan.entryReference).toBe(TRADE_PLAN_ENTRY_REFERENCE);
    expect(plan.takeProfit1).toBeGreaterThan(plan.entry);
    expect(plan.takeProfit2).toBeGreaterThanOrEqual(plan.takeProfit1);
    expect(plan.cutLoss).toBeLessThan(plan.entry);
    expect(plan.stopLoss).toBe(plan.cutLoss);
    expect(plan.riskReward).toBeGreaterThanOrEqual(1.5);
    expect(plan.confidenceScore).toBeGreaterThanOrEqual(70);
    expect(plan.reasons.join(' ')).toContain('ADX/DMI');
    expect(plan.reasons.join(' ')).toContain('Foreign flow IDX');
    expect(plan.dataPoints.every((point) => point.status === 'AVAILABLE')).toBe(true);
  });

  it('menandai data yang hilang tanpa mengarang nilai pengganti', () => {
    const plan = buildTradePlanV1({
      history: baseHistory(),
      currentPrice: 106,
      atr: 5,
    });

    expect(plan).not.toBeNull();
    if (!plan) throw new Error('plan null');

    expect(plan.missingData).toContain('ADX/DMI');
    expect(plan.missingData).toContain('Bollinger %B');
    expect(plan.missingData).toContain('Rasio volume 20 hari');
    expect(plan.missingData).toContain('Foreign flow IDX resmi 20D');
    expect(plan.dataPoints.find((point) => point.key === 'idxForeignFlow')?.value).toBeNull();
    expect(plan.dataPoints.find((point) => point.key === 'idxForeignFlow')?.status).toBe('NOT_AVAILABLE');
  });

  it('fail-closed kalau data dasar TP/CL tidak cukup', () => {
    expect(buildTradePlanV1({ history: baseHistory().slice(0, 14), currentPrice: 106, atr: 5 })).toBeNull();
    expect(buildTradePlanV1({ history: baseHistory(), currentPrice: 106, atr: null })).toBeNull();
  });
});
