import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Halaman /compare selalu terbuka TANPA symbol2 - pengguna baru menyebut satu emiten,
 * lawan bandingnya dipilih server. Pemilihan itu dulu berarti fetchScreenerUniverse():
 * quoteSummary untuk 200 ticker, batch 15, hanya untuk membaca satu field `sector` lalu
 * mengambil ticker pertama yang sesektor.
 *
 * Terukur pada build produksi 21 Agustus 2026:
 *   /api/compare?symbol1=BBCA.JK&symbol2=BBRI.JK   1,69 s
 *   /api/compare?symbol1=BBCA.JK                  17,14 s  (dan 17,27 s saat diulang)
 *
 * Cache universe screener memang ada, tetapi TTL-nya 30 menit dan ia melayani screener,
 * dividend, dan calendar juga. Begitu entri itu kedaluwarsa, pengunjung /compare
 * berikutnya-lah yang membayar 200 panggilan Yahoo untuk memilih SATU kode saham.
 *
 * Karena itu yang diuji di sini bukan "apakah universe pernah di-cache", melainkan
 * apakah hasil pemilihan peer punya cache sendiri yang bertahan melewati kedaluwarsanya
 * cache universe.
 */

const SCREENER_UNIVERSE_KEY = 'sahamlens:cache:computed:screener-universe';

/** Cache tiruan di memori - meniru getOrCompute sungguhan tanpa Redis. */
const store = new Map<string, unknown>();

vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(async (key: string, _ttlSec: number, compute: () => Promise<unknown>) => {
    if (store.has(key)) return store.get(key);
    const value = await compute();
    store.set(key, value);
    return value;
  }),
}));

vi.mock('@/modules/market/service/screener.service', () => ({
  fetchScreenerUniverse: vi.fn(),
}));

vi.mock('@/modules/technical', () => ({
  fetchYahooHistory: vi.fn(),
  analyzeRsi: vi.fn(() => ({ raw: { rsi: 55 } })),
}));

vi.mock('@/modules/fundamental', () => ({
  calculateIntrinsicValue: vi.fn(async () => null),
}));

import { buildStockComparison } from '../stock-comparison.service';
import { fetchScreenerUniverse } from '@/modules/market/service/screener.service';
import { fetchYahooHistory } from '@/modules/technical';

function fakeHistory(price: number) {
  const history = Array.from({ length: 210 }, (_, i) => ({
    Close: price + i,
    AdjClose: price + i,
    High: price + i + 5,
    Low: price + i - 5,
  }));
  return { history, currentPrice: price + 209, regularMarketTime: new Date().toISOString() };
}

/** Membuang entri cache universe, meniru TTL 30 menitnya yang habis di antara dua kunjungan. */
function expireScreenerUniverseCache() {
  for (const key of [...store.keys()]) {
    if (key.startsWith(SCREENER_UNIVERSE_KEY)) store.delete(key);
  }
}

describe('buildStockComparison tanpa symbol2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    vi.mocked(fetchYahooHistory).mockImplementation(async (symbol: string) =>
      fakeHistory(symbol.startsWith('BBCA') ? 6000 : 3000) as any,
    );
    vi.mocked(fetchScreenerUniverse).mockResolvedValue([
      { ticker: 'BBCA', sector: 'Financial Services' },
      { ticker: 'BBRI', sector: 'Financial Services' },
      { ticker: 'TLKM', sector: 'Communication Services' },
    ] as any);
  });

  it('memilih peer sesektor saat symbol2 tidak diberikan', async () => {
    const result = await buildStockComparison('BBCA.JK');
    expect(result).not.toBeNull();
    expect(result!.data2.symbol).toBe('BBRI.JK');
  });

  it('tidak menyapu ulang universe 200 saham saat cache universe kedaluwarsa', async () => {
    await buildStockComparison('BBCA.JK');
    expect(fetchScreenerUniverse).toHaveBeenCalledTimes(1);

    // Kunjungan kedua, setelah TTL universe habis. Peer BBCA tidak berubah; tidak ada
    // alasan membayar 200 panggilan Yahoo lagi untuk menyimpulkan hal yang sama.
    expireScreenerUniverseCache();
    const kedua = await buildStockComparison('BBCA.JK');

    expect(kedua!.data2.symbol).toBe('BBRI.JK');
    expect(fetchScreenerUniverse).toHaveBeenCalledTimes(1);
  });

  it('tidak menyentuh universe sama sekali saat symbol2 diberikan', async () => {
    await buildStockComparison('BBCA.JK', 'TLKM.JK');
    expect(fetchScreenerUniverse).not.toHaveBeenCalled();
  });
});
