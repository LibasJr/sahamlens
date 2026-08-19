import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/security/api-rate-limit', () => ({
  checkPublicComputeBudget: vi.fn(),
  rateLimitResult: vi.fn(() => ({ status: 429, body: { error: 'limited' } })),
}));
vi.mock('@/modules/user', () => ({ getSession: vi.fn(), hasOpenOrProAccess: vi.fn() }));
vi.mock('../../service/stock-comparison.service', () => ({ buildStockComparison: vi.fn() }));

import { handleGetStockComparison } from '../stock-comparison.controller';
import { checkPublicComputeBudget } from '@/shared/security/api-rate-limit';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { buildStockComparison } from '../../service/stock-comparison.service';

describe('handleGetStockComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkPublicComputeBudget).mockResolvedValue({ allowed: true } as any);
    vi.mocked(getSession).mockResolvedValue(null as any);
  });

  it('preserves subscription gate before comparison compute', async () => {
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(false);
    const result = await handleGetStockComparison(new Request('http://localhost/api/compare?symbol1=BBCA.JK'));
    expect(result.status).toBe(402);
    expect(result.body).toEqual(expect.objectContaining({ code: 'SUBSCRIPTION_REQUIRED' }));
    expect(buildStockComparison).not.toHaveBeenCalled();
  });

  it('uses BBCA default and lets service resolve same-sector peer', async () => {
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(true);
    vi.mocked(buildStockComparison).mockResolvedValue({ data1: {}, data2: {}, rows: [], conclusion: 'ok' } as any);
    const result = await handleGetStockComparison(new Request('http://localhost/api/compare'));
    expect(result.status).toBe(200);
    expect(buildStockComparison).toHaveBeenCalledWith('BBCA.JK', null);
  });

  it('returns 404 when either stock cannot be resolved', async () => {
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(true);
    vi.mocked(buildStockComparison).mockResolvedValue(null);
    const result = await handleGetStockComparison(new Request('http://localhost/api/compare?symbol1=NOPE'));
    expect(result.status).toBe(404);
  });
});
