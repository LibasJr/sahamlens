import { describe, expect, it, vi } from 'vitest';

const { quoteMock } = vi.hoisted(() => ({ quoteMock: vi.fn() }));

vi.mock('yahoo-finance2', () => ({
  default: class YahooFinanceMock {
    quote = quoteMock;
  },
}));

import { verifyTradePrice } from '../price-guard.service';

describe('verifyTradePrice', () => {
  it('menolak transaksi ketika harga pasar tidak dapat diverifikasi', async () => {
    quoteMock.mockRejectedValueOnce(new Error('source unavailable'));

    const result = await verifyTradePrice('BBCA', 9_000);

    expect(result).toMatchObject({ ok: false, marketPrice: null });
    expect(result.reason).toMatch(/tidak tersedia/i);
  });

  it('menolak harga yang jauh dari harga pasar nyata', async () => {
    quoteMock.mockResolvedValueOnce({ regularMarketPrice: 9_000 });

    const result = await verifyTradePrice('BBCA', 1);

    expect(result).toMatchObject({ ok: false, marketPrice: 9_000 });
  });

  it('menerima harga dalam koridor wajar dari harga pasar nyata', async () => {
    quoteMock.mockResolvedValueOnce({ regularMarketPrice: 9_000 });

    await expect(verifyTradePrice('BBCA', 9_500)).resolves.toMatchObject({
      ok: true,
      marketPrice: 9_000,
    });
  });
});
