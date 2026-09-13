import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ queryReadWithRetry: vi.fn() }));

vi.mock('@/shared/database/postgres.client', () => ({
  pool: { query: vi.fn() },
  queryReadWithRetry: db.queryReadWithRetry,
}));
vi.mock('../../service/intraday-schema.service', () => ({ ensureIntradaySchema: vi.fn() }));

import {
  getActiveOosProtocol,
  getLatestThresholdProposal,
  getLatestValidationRunResult,
  getLatestWeightProposal,
  listValidationRuns,
} from '../intraday.repository';

const MODEL = 'lens-intraday-v0.2.0';
const CONFIG = 'cfg-current';

describe('query artefak riset selalu dibatasi model dan config aktif', () => {
  beforeEach(() => db.queryReadWithRetry.mockReset().mockResolvedValue({ rows: [] }));

  it.each([
    ['protokol OOS', () => getActiveOosProtocol(MODEL, CONFIG)],
    ['run terakhir', () => getLatestValidationRunResult(MODEL, CONFIG)],
    ['proposal bobot', () => getLatestWeightProposal(MODEL, CONFIG)],
    ['proposal ambang', () => getLatestThresholdProposal(MODEL, CONFIG)],
  ])('%s tidak boleh mengambil artefak versi lain', async (_label, run) => {
    await run();
    const [sql, params] = db.queryReadWithRetry.mock.calls[0]!;
    expect(sql).toContain('model_version = $1');
    expect(sql).toContain('config_hash = $2');
    expect(params).toEqual([MODEL, CONFIG]);
  });

  it('histori dashboard memakai scope yang sama', async () => {
    await listValidationRuns(10, 0, MODEL, CONFIG);
    const [sql, params] = db.queryReadWithRetry.mock.calls[0]!;
    expect(sql).toContain('model_version = $3');
    expect(sql).toContain('config_hash = $4');
    expect(params).toEqual([10, 0, MODEL, CONFIG]);
  });
});
