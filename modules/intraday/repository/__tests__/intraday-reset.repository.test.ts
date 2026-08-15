import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('@/shared/database/postgres.client', () => ({
  pool: { connect: db.connect },
  queryReadWithRetry: vi.fn(),
}));
vi.mock('../../service/intraday-schema.service', () => ({ ensureIntradaySchema: vi.fn() }));

import { resetIntradayResearchData } from '../intraday.repository';

describe('resetIntradayResearchData', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.release.mockReset();
    db.connect.mockReset();
    db.connect.mockResolvedValue({ query: db.query, release: db.release });
    db.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ signals: '12', outcomes: '48', quality_rows: '20', validation_runs: '3' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
  });

  it('menghapus hanya tabel riset intraday dalam satu transaksi', async () => {
    await expect(resetIntradayResearchData()).resolves.toEqual({
      signalsDeleted: 12,
      outcomesDeleted: 48,
      qualityRowsDeleted: 20,
      validationRunsDeleted: 3,
    });

    expect(db.query).toHaveBeenCalledWith('BEGIN');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('TRUNCATE TABLE'));
    const truncate = db.query.mock.calls.find(([sql]) => String(sql).includes('TRUNCATE TABLE'))?.[0] as string;
    expect(truncate).toContain('intraday_signals');
    expect(truncate).toContain('intraday_outcomes');
    expect(truncate).not.toContain('lens_radar_history');
    expect(db.query).toHaveBeenCalledWith('COMMIT');
    expect(db.release).toHaveBeenCalledOnce();
  });
});
