import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@/shared/errors/app-error';

const mocks = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  getCacheTtlRemaining: vi.fn(),
  listDataSourceHealth: vi.fn(),
}));

vi.mock('@/lib/sahamLensGuard', () => ({ guard: vi.fn() }));
vi.mock('@/shared/auth/admin-session', () => ({ requireAdminSession: mocks.requireAdminSession }));
vi.mock('@/shared/cache/redis-cache', () => ({ getCacheTtlRemaining: mocks.getCacheTtlRemaining }));
vi.mock('@/modules/observability/service/data-source-health.service', () => ({ listDataSourceHealth: mocks.listDataSourceHealth }));

import { GET } from '../route';

describe('GET /api/admin/observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminSession.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mocks.getCacheTtlRemaining.mockResolvedValue(42);
    mocks.listDataSourceHealth.mockResolvedValue([{
      sourceId: 'YAHOO_CHART',
      status: 'HEALTHY',
      lastSuccessAt: '2026-09-23T08:00:00.000Z',
      lastFailureAt: null,
      lastLatencyMs: 120,
      consecutiveFailures: 0,
      dataObservedAt: '2026-09-23T08:00:00.000Z',
      detail: { upstreamUrl: 'must-not-leak' },
      updatedAt: '2026-09-23T08:00:01.000Z',
    }]);
  });

  it('menolak request tanpa sesi admin', async () => {
    mocks.requireAdminSession.mockRejectedValueOnce(new ForbiddenError());

    const response = await GET(new Request('http://localhost/api/admin/observability'));

    expect(response.status).toBe(403);
    expect(response.headers.get('CDN-Cache-Control')).toBeNull();
  });

  it('menampilkan TTL named cache dan health sumber tanpa data sensitif', async () => {
    const response = await GET(new Request('http://localhost/api/admin/observability'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('CDN-Cache-Control')).toBeNull();
    expect(mocks.requireAdminSession).toHaveBeenCalledOnce();
    expect(body).toMatchObject({
      generatedAt: expect.any(String),
      caches: expect.arrayContaining([{ name: 'MARKET_SUMMARY', ttlRemainingSec: 42 }]),
      dataSources: [{
        sourceId: 'YAHOO_CHART',
        status: 'HEALTHY',
        consecutiveFailures: 0,
        lastLatencyMs: 120,
      }],
      meta: { requestId: expect.any(String) },
    });
    expect(JSON.stringify(body)).not.toContain('upstreamUrl');
  });
});
