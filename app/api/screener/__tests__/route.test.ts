import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/modules/market/service/screener.service', () => ({
  fetchScreenerUniverse: vi.fn(),
  rankScreener: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
  getCacheTtlRemaining: vi.fn(),
}));
vi.mock('@/shared/middleware/compute-budget', () => ({
  computeActorFromRequest: vi.fn((_request: Request, userId?: string | null) => (userId ? `user:${userId}` : 'ip:unknown')),
  consumeComputeBudget: vi.fn(async () => ({ allowed: true, used: 1, limit: 5, remaining: 4 })),
}));
// readOrIssueAnonymousTrial() memanggil cookies() milik Next, yang melempar di luar
// request scope - route ini memakainya untuk memberi tiap tamu ember rate limit sendiri
// (lihat komentar di route.ts), jadi harus di-mock seperti di test controller chat.
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(async () => ({
    firstSeenAt: '2026-08-21T00:00:00.000Z', expiresAt: '2026-08-28T00:00:00.000Z', active: true, isNew: true,
  })),
  buildAnonymousTrialCookie: vi.fn(async () => ({ name: 'anon_trial', value: 'token', options: { path: '/' } })),
}));
vi.mock('@/modules/validation', () => ({
  getLensScoreValidationStatus: vi.fn(() => ({
    validated: false,
    reasonCode: 'MODEL_UNVALIDATED',
    message: 'LensScore belum tervalidasi.',
  })),
}));

import { GET } from '../route';
import { rankScreener } from '@/modules/market/service/screener.service';
import { getOrCompute, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { computeActorFromRequest, consumeComputeBudget } from '@/shared/middleware/compute-budget';
import { getSession } from '@/modules/user';

function makeRequest(qs = ''): Request {
  return new Request(`http://localhost/api/screener${qs}`);
}

const universe = [
  { ticker: 'BBCA', sector: 'Keuangan' },
  { ticker: 'TLKM', sector: 'Infrastruktur' },
];

const mockTop10 = [
  { ticker: 'BBCA', score: 90 },
  { ticker: 'BBRI', score: 85 },
  { ticker: 'BMRI', score: 80 },
  { ticker: 'BBNI', score: 75 },
  { ticker: 'TLKM', score: 70 },
  { ticker: 'ASII', score: 65 },
  { ticker: 'ICBP', score: 60 },
  { ticker: 'INDF', score: 55 },
  { ticker: 'UNVR', score: 50 },
  { ticker: 'KLBF', score: 45 },
];

describe('GET /api/screener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(getOrCompute).mockResolvedValue(universe as any);
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(null);
    vi.mocked(rankScreener).mockReturnValue(mockTop10 as any);
    vi.mocked(consumeComputeBudget).mockResolvedValue({ allowed: true, used: 1, limit: 40, remaining: 39 });
  });

  it('meneruskan sector, maxPrice, minMarketCap, minLiquidity dari query string ke rankScreener', async () => {
    const res = await GET(makeRequest('?profile=Moderat&sector=Keuangan&maxPrice=5000&minMarketCap=100000000000000&minLiquidity=1000000000'));

    expect(res.status).toBe(200);
    expect(rankScreener).toHaveBeenCalledWith(universe, 'Moderat', {
      sector: 'Keuangan', maxPrice: 5000, minMarketCap: 100_000_000_000_000, minLiquidity: 1_000_000_000,
    });
  });

  it('tanpa query filter, semua filter diteruskan undefined', async () => {
    await GET(makeRequest('?profile=Moderat'));

    expect(rankScreener).toHaveBeenCalledWith(universe, 'Moderat', {
      sector: undefined, maxPrice: undefined, minMarketCap: undefined, minLiquidity: undefined,
    });
  });

  it('maxPrice/minMarketCap/minLiquidity bukan angka positif diabaikan (diteruskan undefined)', async () => {
    await GET(makeRequest('?profile=Moderat&maxPrice=-100&minMarketCap=abc&minLiquidity=0'));

    expect(rankScreener).toHaveBeenCalledWith(universe, 'Moderat', {
      sector: undefined, maxPrice: undefined, minMarketCap: undefined, minLiquidity: undefined,
    });
  });

  it('availableSectors berasal dari universe PENUH, diurutkan alfabet', async () => {
    const res = await GET(makeRequest('?profile=Moderat&sector=Keuangan'));
    const json = await res.json();

    expect(json.availableSectors).toEqual(['Infrastruktur', 'Keuangan']);
  });

  it('menyediakan ApiResponse envelope tanpa menghapus field legacy screener', async () => {
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(900);

    const res = await GET(makeRequest('?profile=Moderat'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.profile).toBe('Moderat');
    expect(json.data.analysis).toEqual(json.analysis);
    expect(json.data.availableSectors).toEqual(json.availableSectors);
    expect(json.data.modelValidation).toEqual(json.modelValidation);
    expect(json.modelValidation).toEqual({
      validated: false,
      reasonCode: 'MODEL_UNVALIDATED',
      message: 'LensScore belum tervalidasi.',
    });
    expect(json.meta).toEqual(expect.objectContaining({
      requestId: expect.any(String),
      source: 'screener-universe-cache',
      staleness: 'cached',
      modelVersion: 'MODEL_UNVALIDATED',
    }));
    expect(res.headers.get('X-Request-Id')).toBe(json.meta.requestId);
    // Backward compatibility: client lama masih dapat membaca field top-level yang sama.
    expect(json.profile).toBe('Moderat');
    expect(json.analysis.top_10_stocks).toHaveLength(2);
  });

  it('tamu (guest/unauthenticated) hanya menerima 2 emiten teratas dengan flag is_guest_limited', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await GET(makeRequest('?profile=Moderat'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.analysis.top_10_stocks).toHaveLength(2);
    expect(json.analysis.top_10_stocks.map((s: any) => s.ticker)).toEqual(['BBCA', 'BBRI']);
    expect(json.analysis.total_count).toBe(10);
    expect(json.analysis.locked_count).toBe(8);
    expect(json.analysis.is_guest_limited).toBe(true);
  });

  // Regresi BUG-1: dengan TRUSTED_PROXY_MODE=direct, getTrustedClientIp() mengembalikan
  // 'unknown' untuk SETIAP pengunjung, jadi aktor berbasis IP membuat seluruh deployment
  // berbagi satu ember 40 unit - habis setelah 8 request per 10 menit dan LensScanner
  // tampil kosong untuk semua orang. Aktor tamu harus datang dari cookie trial, bukan IP.
  it('tamu ditagih ke ember per-browser (cookie trial), bukan ember IP bersama', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await GET(makeRequest('?profile=Moderat'));

    const [actor, , tier] = vi.mocked(consumeComputeBudget).mock.calls[0]!;
    expect(actor).toBe('guest-screener:2026-08-21T00:00:00.000Z');
    expect(actor).not.toContain('unknown');
    expect(tier).toBe('public');
  });

  // Regresi BUG-7: budget dulu dipotong SEBELUM sesi dibaca, selalu tier 'public' dengan
  // aktor IP - batas tier 'authenticated' (160) tidak pernah bisa tercapai.
  it('pengguna login ditagih ke tier authenticated dengan aktor user-nya sendiri', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'user-123', email: 'user@sahamlens.id' } as any);

    await GET(makeRequest('?profile=Moderat'));

    const [actor, , tier] = vi.mocked(consumeComputeBudget).mock.calls[0]!;
    expect(actor).toBe('user:user-123');
    expect(tier).toBe('authenticated');
    expect(computeActorFromRequest).toHaveBeenCalledWith(expect.any(Request), 'user-123');
  });

  // Regresi BUG-2: tanpa Redis, getCacheTtlRemaining kini melapor dari cache memori.
  // TTL tersisa > 0 berarti universe datang dari cache tanpa komputasi apa pun, jadi
  // biayanya 1 - bukan 5 seperti cache-miss.
  it('cache hit ditagih 1 unit, cache miss ditagih 5', async () => {
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(900);
    await GET(makeRequest('?profile=Moderat'));
    expect(vi.mocked(consumeComputeBudget).mock.calls[0]![1]).toBe(1);

    vi.mocked(consumeComputeBudget).mockClear();
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(null);
    await GET(makeRequest('?profile=Moderat'));
    expect(vi.mocked(consumeComputeBudget).mock.calls[0]![1]).toBe(5);
  });

  it('budget habis membalas 429 dengan kode COMPUTE_BUDGET_EXCEEDED dan Retry-After', async () => {
    vi.mocked(consumeComputeBudget).mockResolvedValue({ allowed: false, used: 45, limit: 40, remaining: 0, retryAfterSec: 600 });

    const res = await GET(makeRequest('?profile=Moderat'));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.code).toBe('COMPUTE_BUDGET_EXCEEDED');
    expect(res.headers.get('Retry-After')).toBe('600');
    // Cookie trial WAJIB ikut walau ditolak: tanpa itu tamu menerima firstSeenAt baru
    // tiap request dan rate limit tidak membatasi apa pun.
    expect(res.headers.get('set-cookie')).toContain('anon_trial');
  });

  it('pengguna login menerima seluruh 10 emiten tanpa batasan tamu', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'user-123', email: 'user@sahamlens.id' } as any);

    const res = await GET(makeRequest('?profile=Moderat'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.analysis.top_10_stocks).toHaveLength(10);
    expect(json.analysis.total_count).toBe(10);
    expect(json.analysis.locked_count).toBe(0);
    expect(json.analysis.is_guest_limited).toBe(false);
  });
});