import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/security/api-rate-limit', () => ({
  checkPublicComputeBudget: vi.fn(),
  rateLimitResult: vi.fn((result: any) => ({ status: 429, body: { error: 'limited' }, headers: result.retryAfterSec ? { 'Retry-After': String(result.retryAfterSec) } : undefined })),
}));
vi.mock('../../service/live-price.service', () => ({ fetchLivePriceSnapshot: vi.fn() }));

import { handleGetLivePrice } from '../live-price.controller';
import { checkPublicComputeBudget } from '@/shared/security/api-rate-limit';
import { fetchLivePriceSnapshot } from '../../service/live-price.service';

describe('handleGetLivePrice', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stops before provider work when public budget is exhausted', async () => {
    vi.mocked(checkPublicComputeBudget).mockResolvedValue({ allowed: false, retryAfterSec: 17 } as any);
    const result = await handleGetLivePrice(new Request('http://localhost/api/live/BBCA.JK'), 'BBCA.JK');
    expect(result.status).toBe(429);
    expect(result.headers?.['Retry-After']).toBe('17');
    expect(fetchLivePriceSnapshot).not.toHaveBeenCalled();
  });

  it('rejects invalid tickers without provider work', async () => {
    vi.mocked(checkPublicComputeBudget).mockResolvedValue({ allowed: true } as any);
    const result = await handleGetLivePrice(new Request('http://localhost/api/live/x'), '../etc/passwd');
    expect(result.status).toBe(400);
    expect(fetchLivePriceSnapshot).not.toHaveBeenCalled();
  });

  it('maps provider-unavailable snapshots to fail-closed 503', async () => {
    vi.mocked(checkPublicComputeBudget).mockResolvedValue({ allowed: true } as any);
    vi.mocked(fetchLivePriceSnapshot).mockResolvedValue({ available: false, body: { price: null, error: 'Data harga tidak tersedia saat ini' } });
    const result = await handleGetLivePrice(new Request('http://localhost/api/live/BBCA.JK'), 'BBCA.JK');
    expect(result.status).toBe(503);
    expect(result.body).toEqual(expect.objectContaining({ price: null }));
  });
});
