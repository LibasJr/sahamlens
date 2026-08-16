import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listOwnershipHistoryBySource } = vi.hoisted(() => ({ listOwnershipHistoryBySource: vi.fn() }));
vi.mock('../../repository/ownership-flow-history.repository', () => ({ listOwnershipHistoryBySource }));

import { getOwnershipFlowValidationDashboard } from '../ownership-flow-validation.service';

function row(observedDate: string, fetchedAt: string, foreignPct: number, totalSecurities = 1000) {
  return {
    ticker: 'BBCA.JK', observedDate, localPct: 100 - foreignPct, foreignPct,
    scriplessPct: 100, totalSecurities, localShares: null, foreignShares: null,
    source: 'KSEI_HOLDING_COMPOSITION', sourceUrl: 'https://web.ksei.co.id/example', fetchedAt,
  };
}

describe('Ownership Flow validation PIT gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('backfill historis tidak pernah dianggap PIT hanya karena observed_date lama', async () => {
    listOwnershipHistoryBySource.mockResolvedValue([
      row('2026-01-30', '2026-08-16T08:00:00.000Z', 20),
      row('2026-02-27', '2026-08-16T08:00:00.000Z', 21),
    ]);
    const d = await getOwnershipFlowValidationDashboard();
    expect(d.pitEligibleSnapshots).toBe(0);
    expect(d.backfilledRows).toBe(2);
    expect(d.predictiveValidationStatus).toBe('NOT_PIT_ELIGIBLE');
  });

  it('backfill lama boleh coexist, tetapi studi baru unlock hanya dari >=12 snapshot PIT terpisah', async () => {
    const rows = [row('2025-01-31', '2026-08-16T08:00:00.000Z', 20)]; // old backfill: excluded
    for (let month = 1; month <= 12; month += 1) {
      const mm = String(month).padStart(2, '0');
      const observed = `2027-${mm}-15`;
      rows.push(row(observed, `${observed}T12:00:00.000Z`, 20 + month / 10));
    }
    listOwnershipHistoryBySource.mockResolvedValue(rows);
    const d = await getOwnershipFlowValidationDashboard();
    expect(d.backfilledRows).toBe(1);
    expect(d.pitEligibleSnapshots).toBe(12);
    expect(d.predictiveValidationStatus).toBe('PIT_ELIGIBLE_BUT_NOT_RUN');
  });

  it('mengeluarkan structural break denominator dari distribusi delta', async () => {
    listOwnershipHistoryBySource.mockResolvedValue([
      row('2025-04-30', '2026-08-16T08:00:00.000Z', 20, 2_676_887_872),
      row('2025-06-30', '2026-08-16T08:00:00.000Z', 21, 5_000_000_000),
    ]);
    const d = await getOwnershipFlowValidationDashboard();
    expect(d.structuralBreakChanges).toBe(1);
    expect(d.comparableChanges).toBe(0);
    expect(d.absoluteDeltaPercentilesPp.p50).toBeNull();
  });

});
