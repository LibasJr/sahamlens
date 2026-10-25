import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getShadowLedgerDashboardData } from '../forward-signal-ledger.service';
import { pool } from '@/shared/database/postgres.client';

vi.mock('@/shared/database/postgres.client', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('@/shared/database/schema.service', () => ({
  ensureSharedSchema: vi.fn().mockResolvedValue(undefined),
}));

describe('getShadowLedgerDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mengembalikan struktur dashboard lengkap dengan metrik, sinyal, dan status cron', async () => {
    (pool.query as any)
      // 1. Cron query
      .mockResolvedValueOnce({
        rows: [
          {
            jobName: 'shadow-lengan-b-record',
            status: 'SUCCESS',
            startedAt: '2026-10-25T09:35:00.000Z',
            finishedAt: '2026-10-25T09:35:01.000Z',
            errorMessage: null,
          },
          {
            jobName: 'forward-ledger-evaluate',
            status: 'SUCCESS',
            startedAt: '2026-10-25T10:30:00.000Z',
            finishedAt: '2026-10-25T10:30:02.000Z',
            errorMessage: null,
          },
        ],
      })
      // 2. Metrics per model
      .mockResolvedValueOnce({
        rows: [
          {
            modelVersion: 'shadow-lengan-b-v1',
            totalSignals: 3,
            t5Count: 2,
            t5AvgNet: '4.50',
            t5Wins: 2,
            t10Count: 0,
            t10AvgNet: null,
            t10Wins: 0,
            t20Count: 0,
            t20AvgNet: null,
            t20Wins: 0,
            targetHitCount: 1,
            stopHitCount: 0,
            holdExpiryCount: 1,
            totalOutcomes: 2,
          },
        ],
      })
      // 3. All metrics
      .mockResolvedValueOnce({
        rows: [
          {
            totalSignals: 3,
            t5Count: 2,
            t5AvgNet: '4.50',
            t5Wins: 2,
            t10Count: 0,
            t10AvgNet: null,
            t10Wins: 0,
            t20Count: 0,
            t20AvgNet: null,
            t20Wins: 0,
            targetHitCount: 1,
            stopHitCount: 0,
            holdExpiryCount: 1,
            totalOutcomes: 2,
            latestTradeDate: '2026-10-25',
          },
        ],
      })
      // 4. Signals query
      .mockResolvedValueOnce({
        rows: [
          {
            signalId: 'fsl_2026-10-25_SGER_shadow-lengan-b-v1',
            tradeDate: '2026-10-25',
            ticker: 'SGER',
            action: 'BUY',
            closePrice: 840,
            entryRef: 845,
            stop: 795,
            target: 980,
            riskReward: 2.7,
            modelVersion: 'shadow-lengan-b-v1',
            universeFlag: true,
            createdAt: '2026-10-25T09:35:00.000Z',
            t5Net: 4.5,
            t5Gross: 5.1,
            t5Reason: 'HOLD_EXPIRY',
            t5StopHit: false,
            t5TargetHit: false,
            t10Net: null,
            t10Gross: null,
            t10Reason: null,
            t10StopHit: null,
            t10TargetHit: null,
            t20Net: null,
            t20Gross: null,
            t20Reason: null,
            t20StopHit: null,
            t20TargetHit: null,
          },
        ],
      });

    const data = await getShadowLedgerDashboardData();

    expect(data.asOfDate).toBe('2026-10-25');
    expect(data.cronJobs).toHaveLength(2);
    expect(data.cronJobs[0].jobName).toBe('shadow-lengan-b-record');
    expect(data.cronJobs[0].status).toBe('SUCCESS');
    expect(data.cronJobs[1].jobName).toBe('forward-ledger-evaluate');

    const m = data.modelMetrics['shadow-lengan-b-v1'];
    expect(m).toBeDefined();
    expect(m.totalSignals).toBe(3);
    expect(m.t5.count).toBe(2);
    expect(m.t5.winRatePct).toBe(100);
    expect(m.t5.avgNetReturnPct).toBe(4.5);
    expect(m.exitReasons.targetHitCount).toBe(1);
    expect(m.exitReasons.targetHitPct).toBe(50);

    const sigs = data.signalsByModel['shadow-lengan-b-v1'];
    expect(sigs).toHaveLength(1);
    expect(sigs[0].ticker).toBe('SGER');
    expect(sigs[0].t5.isEvaluated).toBe(true);
    expect(sigs[0].t5.netReturnPct).toBe(4.5);
    expect(sigs[0].t10.isEvaluated).toBe(false);
  });

  it('mengembalikan fallback aman saat database gagal', async () => {
    (pool.query as any).mockRejectedValueOnce(new Error('Connection failure'));

    const data = await getShadowLedgerDashboardData();

    expect(data.asOfDate).toBeNull();
    expect(data.cronJobs).toHaveLength(2);
    expect(data.cronJobs[0].status).toBe('NEVER_RUN');
    expect(data.modelMetrics['shadow-lengan-b-v1'].totalSignals).toBe(0);
    expect(data.signalsByModel['shadow-lengan-b-v1']).toEqual([]);
  });
});
