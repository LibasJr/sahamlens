import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
  hasOpenOrProAccess: vi.fn(),
}));
vi.mock('@/modules/recommendation', () => ({
  analyzeStock: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
  getCacheTtlRemaining: vi.fn(),
}));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  applyAnonymousTrialCookie: vi.fn(),
}));

import { GET } from '../route';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { analyzeStock } from '@/modules/recommendation';
import { cacheGet, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

function makeRequest(): Request {
  return new Request('http://localhost/api/recommendations?symbols=BBCA.JK');
}

describe('GET /api/recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(true);
  });

  it('session valid tapi bukan Pro/trial -> 402, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(false);

    const res = await GET(makeRequest());

    expect(res.status).toBe(402);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
    expect(analyzeStock).not.toHaveBeenCalled();
  });

  it('session valid dengan Pro -> 200, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(cacheGet).mockResolvedValue({ ticker: 'BBCA.JK' } as any);
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
    expect(applyAnonymousTrialCookie).not.toHaveBeenCalled();
  });
});

// KEPUTUSAN PRODUK 2026-08-13: tamu (tanpa akun) dapat akses PENUH tanpa batas waktu -
// trial 7 hari anonim TIDAK LAGI menggerbang fitur ini. Kelompok tes ini menguji bahwa
// tamu SELALU lolos (hasOpenOrProAccess mengembalikan true untuk session null), dan
// bahwa cookie trial tetap diterbitkan (dipakai identitas kuota chat guest & telemetri)
// walau tidak lagi dipakai untuk keputusan akses.
describe('GET /api/recommendations (akses tamu)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(true);
  });

  it('tanpa session, trial anonim SUDAH kadaluarsa -> tetap 200 (bukan lagi 401)', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z', active: false, isNew: false,
    });
    vi.mocked(cacheGet).mockResolvedValue({ ticker: 'BBCA.JK', consensus: 'HOLD' } as any);
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.recommendations).toEqual([{
      ticker: 'BBCA.JK', consensus: 'HOLD',
      _meta: { freshness: 'FRESH', cachedAgeSec: 0, cacheTtlSec: CACHE_TTL_SEC.RECOMMENDATION },
    }]);
  });

  it('tanpa session -> cookie trial anonim tetap ditempel (identitas kuota chat/telemetri)', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(cacheGet).mockResolvedValue({ ticker: 'BBCA.JK', consensus: 'HOLD' } as any);
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('user dengan session valid tidak menyentuh logic trial anonim sama sekali', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(cacheGet).mockResolvedValue({ ticker: 'BBCA.JK' } as any);
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
    expect(applyAnonymousTrialCookie).not.toHaveBeenCalled();
  });
});
