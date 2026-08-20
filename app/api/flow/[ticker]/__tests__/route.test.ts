import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/security/api-rate-limit', () => ({
  checkPublicComputeBudget: vi.fn(),
}));
vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
  hasOpenOrProAccess: vi.fn(),
}));
vi.mock('@/modules/market', () => ({
  computeDailyNetFlow: vi.fn(),
  computeAccumulationStreak: vi.fn(),
  analyzeBandarmology: vi.fn(),
  analyzeAccumulationSignal: vi.fn(),
  getRealForeignFlow: vi.fn(),
  summarizeForeignFlow: vi.fn(),
  IDX_FOREIGN_FLOW_SOURCE: 'IDX_OFFICIAL_FOREIGN_FLOW',
}));

import { GET } from '../route';
import { checkPublicComputeBudget } from '@/shared/security/api-rate-limit';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import {
  analyzeAccumulationSignal,
  analyzeBandarmology,
  computeAccumulationStreak,
  computeDailyNetFlow,
  getRealForeignFlow,
  summarizeForeignFlow,
} from '@/modules/market';

function makeRequest() {
  return new Request('http://localhost/api/flow/BBCA');
}
function makeParams() {
  return { params: Promise.resolve({ ticker: 'BBCA' }) };
}

const officialHistory = [{
  date: '2026-08-19', close: 9100, volume: 1000, foreignBuy: 600, foreignSell: 300,
  netForeignVolume: 300, netForeignValueBillion: 2.73,
}];

describe('GET /api/flow/[ticker] source contract', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkPublicComputeBudget).mockResolvedValue({ allowed: true } as any);
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(true);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('prefers official IDX foreign-flow artifacts and does not call Yahoo', async () => {
    vi.mocked(getRealForeignFlow).mockReturnValue({
      history: officialHistory,
      updatedAt: '2026-08-19T08:00:00.000Z',
    } as any);
    vi.mocked(summarizeForeignFlow).mockReturnValue({ net5DBillion: 2.73 } as any);

    const res = await GET(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.source).toBe('IDX_OFFICIAL_FOREIGN_FLOW');
    expect(json.foreignFlow20D[0].netValueBillion).toBe(2.73);
    expect(json.updatedAt).toBe('2026-08-19T08:00:00.000Z');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('states that official BEI data is unavailable instead of falling back to a proxy', async () => {
    // Sampai 20 Agustus 2026 jalur ini menjawab dengan proxy Chaikin Money Flow dari
    // harga+volume Yahoo. Proxy itu MENYIMPULKAN tekanan beli/jual; ia bukan catatan
    // transaksi investor asing. Menyajikan keduanya di panel yang sama selalu berisiko
    // disalahbaca, betapapun labelnya dibedakan - jadi panel Flow kini hanya menyajikan
    // Net Foreign Buy/Sell resmi Bursa.
    //
    // Yang dikembalikan adalah PERNYATAAN, bukan 404 dan bukan galat: emiten tanpa
    // artefak resmi adalah keadaan yang normal dan bisa dijelaskan, bukan kerusakan.
    vi.mocked(getRealForeignFlow).mockReturnValue(null as any);

    const res = await GET(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.source).toBe('IDX_OFFICIAL_FOREIGN_FLOW');
    expect(json.available).toBe(false);
    expect(json.foreignFlow20D).toEqual([]);
    expect(json.summary).toBeNull();
    // Yahoo tidak boleh disentuh sama sekali - tidak ada lagi jalur kedua.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('never reaches an upstream price provider for flow data', async () => {
    // Pagar terhadap kemunculan kembali fallback: kalau suatu saat ada yang menambahkan
    // sumber kedua, gerbang ini merah sebelum sumber itu sampai ke pengguna.
    vi.mocked(getRealForeignFlow).mockReturnValue(null as any);
    await GET(makeRequest(), makeParams());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rate-limits before auth/source/provider work and preserves Retry-After', async () => {
    vi.mocked(checkPublicComputeBudget).mockResolvedValue({ allowed: false, retryAfterSec: 19 } as any);

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('19');
    expect(getSession).not.toHaveBeenCalled();
    expect(getRealForeignFlow).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
