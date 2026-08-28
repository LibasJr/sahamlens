import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
  hasOpenOrProAccess: vi.fn(),
}));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  buildAnonymousTrialCookie: vi.fn(),
}));
vi.mock('@/shared/auth/internal-service', () => ({
  isInternalServiceRequest: vi.fn(() => false),
}));
vi.mock('@/modules/recommendation/service/lens-score-bucket-backtest.service', () => ({
  runLensScoreBucketBacktest: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
}));

import { GET } from '../route';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { runLensScoreBucketBacktest } from '@/modules/recommendation/service/lens-score-bucket-backtest.service';
import { getOrCompute } from '@/shared/cache/redis-cache';

function makeRequest(qs = ''): Request {
  return new Request(`http://localhost/api/lens-score-bucket-backtest${qs}`);
}

// BUG FIX (2026-08-14, laporan pengguna "LensRadar lambat"): endpoint ini SEBELUMNYA
// query seluruh tabel lens_radar_history dan hitung ulang bucket backtest LIVE di
// setiap request, tanpa cache. Tes ini mengunci bahwa jalur baca sekarang WAJIB lewat
// getOrCompute (single-flight, cache Redis), bukan panggilan langsung.
describe('GET /api/lens-score-bucket-backtest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(true);
  });

  it('membaca lewat getOrCompute, BUKAN memanggil runLensScoreBucketBacktest langsung', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const fakeResult = { buckets: [], overallTStat: null };
    vi.mocked(getOrCompute).mockImplementation(async (_key, _ttl, compute) => compute());
    vi.mocked(runLensScoreBucketBacktest).mockResolvedValue(fakeResult as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ...fakeResult, meta: { requestId: expect.any(String) } });
    expect(getOrCompute).toHaveBeenCalledTimes(1);
    expect(getOrCompute).toHaveBeenCalledWith(
      expect.stringContaining('sahamlens:cache:computed:lens-score-bucket-backtest:'),
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('cache hit tidak memanggil runLensScoreBucketBacktest sama sekali', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const cached = { buckets: [{ bucket: '80-100' }], overallTStat: 2.1 };
    vi.mocked(getOrCompute).mockResolvedValue(cached as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ...cached, meta: { requestId: expect.any(String) } });
    expect(runLensScoreBucketBacktest).not.toHaveBeenCalled();
  });

  it('scoreVersion berbeda menghasilkan cache key berbeda', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(getOrCompute).mockResolvedValue({} as any);

    await GET(makeRequest('?scoreVersion=v3'));

    expect(getOrCompute).toHaveBeenCalledWith(
      expect.stringContaining(':v3'),
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('scoreConfigHash ikut membentuk cache key dan filter service', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(getOrCompute).mockImplementation(async (_key, _ttl, compute) => compute());
    vi.mocked(runLensScoreBucketBacktest).mockResolvedValue({} as any);

    await GET(makeRequest('?scoreVersion=v3&scoreConfigHash=hash-v3'));

    expect(getOrCompute).toHaveBeenCalledWith(
      expect.stringContaining(':v3:hash-v3'),
      expect.any(Number),
      expect.any(Function),
    );
    expect(runLensScoreBucketBacktest).toHaveBeenCalledWith(undefined, {
      scoreVersion: 'v3',
      scoreConfigHash: 'hash-v3',
    });
  });

  it('session ada tapi bukan Pro -> 402, tidak menyentuh cache', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(false);

    const res = await GET(makeRequest());

    expect(res.status).toBe(402);
    expect(getOrCompute).not.toHaveBeenCalled();
  });

  it('Pro biasa boleh membaca bucket validation tanpa gate admin', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1', role: 'user' } as any);
    vi.mocked(getOrCompute).mockResolvedValue({ buckets: [{ bucket: '80-100' }] } as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ buckets: [{ bucket: '80-100' }], meta: { requestId: expect.any(String) } });
    expect(getOrCompute).toHaveBeenCalledTimes(1);
  });

  it('role admin pada sesi tetap diterima', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1', role: 'admin' } as any);
    vi.mocked(getOrCompute).mockResolvedValue({} as any);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(getOrCompute).toHaveBeenCalledTimes(1);
  });
});