import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/queue/qstash-signature', () => ({
  verifyQStashSignature: vi.fn(),
}));
vi.mock('@/shared/scheduler/job-run-log.repository', () => ({
  withJobRunLog: vi.fn((_name: string, fn: () => Promise<unknown>) => fn()),
}));
vi.mock('@/modules/macro', () => ({
  refreshUsdIdr: vi.fn(),
}));
vi.mock('@/modules/macro/service/public-macro-dashboard.service', () => ({
  fetchPublicMacroDashboard: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  cacheSet: vi.fn(),
}));

import { POST } from '../route';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { refreshUsdIdr } from '@/modules/macro';
import { fetchPublicMacroDashboard } from '@/modules/macro/service/public-macro-dashboard.service';
import { cacheSet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/macro', {
    method: 'POST',
    headers: { 'Upstash-Signature': 'sig' },
    body: '{}',
  });
}

// BUG FIX (2026-08-14, laporan pengguna "menu Macro lambat"): job ini SEBELUMNYA
// hanya me-refresh USD_IDR ke Postgres dan tidak pernah menyentuh cache Redis yang
// benar-benar dibaca /api/macro. Tes ini mengunci bahwa job sekarang JUGA pre-warm
// COMPUTED_CACHE_KEY.MACRO_DASHBOARD, memakai jadwal cron yang sudah ada (tanpa
// registrasi jadwal baru).
describe('POST /api/cron/macro', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pre-warm cache dashboard makro setelah refresh USD_IDR sukses', async () => {
    vi.mocked(verifyQStashSignature).mockResolvedValue(true);
    vi.mocked(refreshUsdIdr).mockResolvedValue({ indicator: 'USD_IDR', value: 16000 });
    const dashboard = { market: [], official: [], biRate: null };
    vi.mocked(fetchPublicMacroDashboard).mockResolvedValue(dashboard as any);

    const res = await POST(makeRequest() as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(fetchPublicMacroDashboard).toHaveBeenCalledTimes(1);
    expect(cacheSet).toHaveBeenCalledWith(
      COMPUTED_CACHE_KEY.MACRO_DASHBOARD,
      dashboard,
      CACHE_TTL_SEC.MACRO_DASHBOARD,
    );
  });

  it('pre-warm gagal TIDAK menggagalkan job utama (refresh USD_IDR sudah sukses)', async () => {
    vi.mocked(verifyQStashSignature).mockResolvedValue(true);
    vi.mocked(refreshUsdIdr).mockResolvedValue({ indicator: 'USD_IDR', value: 16000 });
    vi.mocked(fetchPublicMacroDashboard).mockRejectedValue(new Error('Yahoo down'));

    const res = await POST(makeRequest() as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('signature QStash tidak valid -> 401, tidak menyentuh job sama sekali', async () => {
    vi.mocked(verifyQStashSignature).mockResolvedValue(false);

    const res = await POST(makeRequest() as any);

    expect(res.status).toBe(401);
    expect(refreshUsdIdr).not.toHaveBeenCalled();
    expect(fetchPublicMacroDashboard).not.toHaveBeenCalled();
  });
});
