import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/queue/qstash-signature', () => ({
  verifyQStashSignature: vi.fn(),
}));
vi.mock('@/shared/scheduler/job-run-log.repository', () => ({
  withJobRunLog: vi.fn((_name: string, fn: () => Promise<unknown>) => fn()),
}));
vi.mock('@/modules/news', () => ({
  getMarketNews: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  cacheSet: vi.fn(),
}));

import { POST } from '../route';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { getMarketNews } from '@/modules/news';
import { cacheSet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/news', {
    method: 'POST',
    headers: { 'Upstash-Signature': 'sig' },
    body: '{}',
  });
}

// BARU (2026-08-14, pertanyaan pengguna "apa ada cron untuk update news?" - sebelumnya
// TIDAK ADA sama sekali). Tes ini mengunci bahwa job menulis ke KUNCI CACHE YANG SAMA
// PERSIS dibaca /api/news (COMPUTED_CACHE_KEY.MARKET_NEWS) - kalau kuncinya berbeda
// satu huruf, job ini akan sukses tanpa error tapi /api/news tidak pernah membacanya
// (persis kelas bug yang computed-keys.ts dibuat untuk mencegah).
describe('POST /api/cron/news', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menyimpan hasil ke COMPUTED_CACHE_KEY.MARKET_NEWS dengan TTL cron', async () => {
    vi.mocked(verifyQStashSignature).mockResolvedValue(true);
    const data = { items: [{ title: 'a' }, { title: 'b' }], sentimentSource: 'council-ai', intelligenceSource: 'council-ai', intelligenceBasis: 'headline-only' };
    vi.mocked(getMarketNews).mockResolvedValue(data as any);

    const res = await POST(makeRequest() as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.result).toEqual({ items: 2 });
    expect(cacheSet).toHaveBeenCalledWith(COMPUTED_CACHE_KEY.MARKET_NEWS, data, CACHE_TTL_SEC.MARKET_NEWS);
  });

  it('signature QStash tidak valid -> 401, tidak menyentuh job sama sekali', async () => {
    vi.mocked(verifyQStashSignature).mockResolvedValue(false);

    const res = await POST(makeRequest() as any);

    expect(res.status).toBe(401);
    expect(getMarketNews).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('getMarketNews gagal -> 500, job dilaporkan gagal', async () => {
    vi.mocked(verifyQStashSignature).mockResolvedValue(true);
    vi.mocked(getMarketNews).mockRejectedValue(new Error('RSS feed down'));

    const res = await POST(makeRequest() as any);

    expect(res.status).toBe(500);
    expect(cacheSet).not.toHaveBeenCalled();
  });
});
