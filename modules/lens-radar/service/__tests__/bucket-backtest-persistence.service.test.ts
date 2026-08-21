import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/database/schema.service', () => ({
  ensureSharedSchema: async () => {},
}));

vi.mock('@/shared/database/postgres.client', () => ({
  pool: { query: async () => ({ rows: [] }) },
}));

import { saveLensBucketStats } from '../bucket-backtest.service';
import { LENS_SCORE_MODEL_METADATA } from '@/modules/technical/config/lens-score-model';

describe('saveLensBucketStats model identity', () => {
  it('menyimpan dan meng-upsert snapshot dengan score_version + score_config_hash', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      async query(sql: string, params: unknown[] = []) {
        calls.push({ sql, params });
        return { rows: [] };
      },
    };

    const saved = await saveLensBucketStats({
      asOfDate: '2026-08-21',
      scoreVersion: LENS_SCORE_MODEL_METADATA.version,
      requestedScoreVersion: LENS_SCORE_MODEL_METADATA.version,
      scoreConfigHash: LENS_SCORE_MODEL_METADATA.configHash,
      configRejectedRows: 0,
      rejectedRows: 0,
      unversionedRows: 0,
      versionMixed: false,
      versionRejectedReason: null,
      priceBasis: 'SPLIT_ADJUSTED',
      priceDataVersion: 'test-price-v1',
      sourceRows: 10,
      uniqueTickers: 2,
      roundTripCostPct: 0.5,
      skippedGocapRows: 0,
      skippedIlliquidRows: 0,
      unknownLiquidityRows: 0,
      minAvgValue20dIdr: 0,
      productionGateRows: {} as never,
      minCoveragePct: 55,
      tradingCalendarSource: 'OBSERVED_SIGNAL_DATES',
      skippedNoForwardEntryRows: 0,
      skippedDrawdownTrades: 0,
      drawdownTrades: 0,
      stats: [{
        bucket: '80-100',
        avg_T1: 1,
        avg_T5: 2,
        avg_T20: 3,
        avgT20Gross: 3.5,
        winRate_T5: 55,
        winRate_T20: 60,
        maxDdP95_T20: -4,
        worstMae_T20: -8,
        avgWin_T20: 6,
        avgLoss_T20: -3,
        totalSamples: 10,
      }],
    }, db);

    expect(saved).toBe(1);
    expect(calls[0].sql).toContain('score_config_hash');
    expect(calls[0].sql).toContain('ON CONFLICT (run_date, bucket, score_version, score_config_hash)');
    expect(calls[0].params).toContain(LENS_SCORE_MODEL_METADATA.configHash);
  });
});
