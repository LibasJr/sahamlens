import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cacheGetMock, aiPickMock } = vi.hoisted(() => ({
  cacheGetMock: vi.fn(),
  aiPickMock: vi.fn(),
}));

vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: cacheGetMock,
  cacheSet: vi.fn(),
  getOrCompute: vi.fn(async (_key: string, _ttl: number, compute: () => Promise<any>) => compute()),
  getCacheTtlRemaining: vi.fn(async () => 0),
}));

vi.mock('@/shared/cache/ai-pick-cache', () => ({
  readAiPickScores: aiPickMock,
}));

import { buildChatVerifiedData } from '../chat-data-router';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';

const currentDate = {
  mode: 'CURRENT' as const,
  requestedAsOf: null,
  invalidDate: null,
  incompleteDate: null,
  source: 'default' as const,
};

function request(intent: any, extra: Partial<Parameters<typeof buildChatVerifiedData>[0]> = {}) {
  return buildChatVerifiedData({
    intent,
    compareScope: 'GENERAL',
    requestedMetrics: [],
    tickers: [],
    date: currentDate,
    prompt: '',
    ...extra,
  } as any);
}

beforeEach(() => {
  cacheGetMock.mockReset();
  cacheGetMock.mockResolvedValue(null);
  aiPickMock.mockReset();
  aiPickMock.mockResolvedValue(null);
});

describe('gerbang data pribadi', () => {
  it('menolak portofolio untuk pengunjung anonim, tanpa menyentuh database', async () => {
    const result = await request('PORTFOLIO', { user: null });
    expect(result.dataError).toBe('LOGIN_REQUIRED');
    expect(result.directResponse).toMatch(/login/i);
    expect(result.verifiedBlock).toBe('');
  });

  it('menolak watchlist untuk pengunjung anonim', async () => {
    const result = await request('WATCHLIST', { user: null });
    expect(result.dataError).toBe('LOGIN_REQUIRED');
  });
});

describe('blok metodologi scoring dirender dari konstanta produksi', () => {
  it('memuat bobot, ambang kategori, dan gerbang likuiditas yang sebenarnya', async () => {
    const result = await request('SCORING_METHOD');
    const block = result.verifiedBlock;

    // Angka-angka ini sengaja diuji terhadap NILAI, bukan terhadap "ada tulisannya":
    // kalau bobot produksi berubah tanpa test ini ikut diperbarui, penjelasan LensAI
    // akan menyimpang dari cara skor benar-benar dihitung - dan tidak ada yang tahu.
    expect(block).toContain('maksimal 40 poin');
    expect(block).toContain('maksimal 30 poin');
    expect(block).toContain('STRONG BUY: skor > 75');
    expect(block).toContain('BUY: skor >= 60');
    expect(block).toContain('coverage < 55%');
    expect(block).toContain('minimal 200 bar harga');
    expect(block).toContain('Rp 1 miliar per hari');
  });

  it('menyatakan status validasi model, bukan menyembunyikannya', async () => {
    const result = await request('SCORING_METHOD');
    expect(result.verifiedBlock).toMatch(/Status validasi model saat ini: (TERVALIDASI|BELUM TERVALIDASI)/);
  });
});

describe('blok pasar gagal-tertutup saat cache kosong', () => {
  it.each([
    ['MARKET_MOVERS', /cache market-summary sedang kosong|cache market-pulse sedang kosong/],
    ['MACRO', /cache dashboard makro sedang kosong/],
    ['SCREENER', /cache universe screener sedang kosong/],
    ['LENSRADAR_PICKS', /cache pemindaian LensRadar sedang kosong/],
    ['BACKTEST_EVIDENCE', /cache transparency sedang kosong/],
  ])('%s menyatakan datanya belum ada dan melarang mengarang', async (intent, pattern) => {
    const result = await request(intent);
    expect(result.verifiedBlock).toMatch(pattern);
    expect(result.verifiedBlock).toMatch(/JANGAN mengarang/);
    // Penting: bukan directResponse. Model tetap dipanggil supaya bisa menjelaskan
    // dengan bahasa manusia APA yang belum tersedia dan apa alternatifnya.
    expect(result.directResponse).toBeNull();
  });
});

describe('blok pasar memakai data cache saat tersedia', () => {
  it('merender breadth dan sektor dari market-pulse', async () => {
    cacheGetMock.mockImplementation(async (key: string) => {
      if (key === COMPUTED_CACHE_KEY.MARKET_PULSE) {
        return {
          breadth: { total: 40, advancing: 25, declining: 12, unchanged: 3, advanceDeclineRatio: 2.08 },
          marketRegime: {
            score: 61,
            confidence: 0.8,
            coverage: 0.9,
            fearGreed: { code: 'GREED', label: 'Greed' },
            regime: { code: 'RISK_ON', label: 'Risk On', posture: 'RISK_ON' },
            summary: 'Mayoritas indikator positif.',
            limitations: ['Breadth dihitung dari sampel, bukan seluruh emiten.'],
          },
          sectorHeatmap: [{ sector: 'Energi', changePct: 1.8, sampleSize: 4 }],
        };
      }
      return null;
    });

    const result = await request('SECTOR_ROTATION');
    expect(result.verifiedBlock).toContain('25 naik / 12 turun');
    expect(result.verifiedBlock).toContain('Energi: +1.80%');
    expect(result.verifiedBlock).toContain('Risk On');
    // Batas metodologi WAJIB ikut: angka sektor cuma rata-rata beberapa saham wakil.
    expect(result.verifiedBlock).toContain('BUKAN indeks');
  });
});
