import { describe, it, expect, vi } from 'vitest';

// Semua sumber data hulu dibuat gagal, meniru Yahoo down / me-rate-limit kita. fetchOne()
// menelan tiap error per saham dan mengembalikan null, jadi tanpa penjaga hasil minimum
// fetchScreenerUniverse() akan mengembalikan [] dengan tenang - dan [] adalah nilai yang
// SAH bagi pemanggilnya: getOrCompute menyimpannya sebagai cache hit selama TTL penuh dan
// cron warmer menimpanya di atas universe sehat sambil melaporkan success. Gejalanya:
// LensScanner menampilkan "tidak ada saham yang lolos" tanpa error di mana pun.
vi.mock('yahoo-finance2', () => ({
  default: class {
    quoteSummary() { return Promise.reject(new Error('yahoo down')); }
    quote() { return Promise.reject(new Error('yahoo down')); }
  },
}));
vi.mock('@/modules/technical', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/technical')>()),
  fetchYahooHistory: vi.fn(async () => { throw new Error('yahoo down'); }),
}));
vi.mock('@/modules/news', () => ({
  getBatchStockSentiment: vi.fn(async () => ({})),
}));

import { fetchScreenerUniverse, getScreenerFetchTickers } from '../screener.service';

describe('fetchScreenerUniverse - penjaga hasil minimum', () => {
  it('melempar (bukan mengembalikan []) saat seluruh sumber data gagal', async () => {
    await expect(fetchScreenerUniverse()).rejects.toThrow(/tidak lengkap/i);
  });

  it('pesan errornya menyebut berapa emiten yang berhasil dari berapa total', async () => {
    const total = getScreenerFetchTickers().length;
    expect(total).toBeGreaterThan(50); // penjaga: kalau universe jadi kosong, pemindainya yang rusak

    await expect(fetchScreenerUniverse()).rejects.toThrow(new RegExp(`0 dari ${total} emiten`));
  });
}, 60_000);
