import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { correctPbvForUsdReporter } from '@/shared/market/usd-idr-rate';

/**
 * Mengunci perilaku PBV untuk emiten pelapor USD.
 *
 * Bug ini sudah pernah diperbaiki sekali (audit 2026-08-03, temuan C-07) di
 * `recommendation.service.ts`, lalu muncul lagi lewat jalur lain: cron
 * `fundamental-snapshot` menyimpan `priceToBook` mentah ke `fundamental_history`.
 * Diukur pada arsip produksi 2026-09-12, angka yang tersimpan sebenarnya KURS:
 * ADRO 16500, AADI 28563, AMMN 63947 - 38 dari 200 emiten (19%) di atas 50.
 *
 * Pelajarannya bukan "helpernya salah" - helpernya benar. Yang salah adalah penjaga
 * yang hanya menutup satu dari dua jalur penulis. Test ini menegaskan kontrak helper
 * supaya jalur ketiga yang menulis PBV punya patokan yang jelas.
 */
describe('correctPbvForUsdReporter - kontrak yang dilanggar cron snapshot', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('meneruskan apa adanya untuk pelapor IDR - mayoritas emiten IDX', async () => {
    const result = await correctPbvForUsdReporter({
      priceCurrency: 'IDR',
      financialCurrency: 'IDR',
      bookValue: 3000,
      price: 8600,
      rawPbv: 2.87,
    });
    expect(result).toBe(2.87);
  });

  it('TIDAK meneruskan priceToBook mentah untuk pelapor USD', async () => {
    // Inti bugnya: 16500 adalah kurs, bukan rasio. Meneruskannya berarti menyimpan
    // kurs ke kolom yang dibaca scoreValuasi().
    const result = await correctPbvForUsdReporter({
      priceCurrency: 'IDR',
      financialCurrency: 'USD',
      bookValue: 0.55,
      price: 2640,
      rawPbv: 16500,
    });

    expect(result).not.toBe(16500);
    if (result !== null) {
      expect(result).toBeLessThan(50);
    }
  });

  it('memilih null daripada menebak saat nilai buku tidak ada', async () => {
    // Lebih baik N/A daripada angka yang salah: PBV salah membuat saham di bawah
    // nilai buku dilabeli "premium" dan kehilangan skor valuasi.
    const result = await correctPbvForUsdReporter({
      priceCurrency: 'IDR',
      financialCurrency: 'USD',
      bookValue: null,
      price: 2640,
      rawPbv: 16500,
    });
    expect(result).toBeNull();
  });

  it('memilih null saat harga tidak sah, bukan membagi dengan nol', async () => {
    const result = await correctPbvForUsdReporter({
      priceCurrency: 'IDR',
      financialCurrency: 'USD',
      bookValue: 0.55,
      price: 0,
      rawPbv: 16500,
    });
    expect(result).toBeNull();
  });

  it('memperlakukan mata uang yang tidak diketahui sebagai IDR, bukan melempar', async () => {
    const result = await correctPbvForUsdReporter({
      priceCurrency: undefined,
      financialCurrency: undefined,
      bookValue: 3000,
      price: 8600,
      rawPbv: 1.91,
    });
    expect(result).toBe(1.91);
  });
});

describe('cron fundamental-snapshot memakai koreksi PBV', () => {
  it('memanggil correctPbvForUsdReporter, bukan priceToBook mentah', async () => {
    // Gerbang pemindai sumber: kalau suatu saat baris ini diganti kembali menjadi
    // `pbv: qs?.defaultKeyStatistics?.priceToBook`, test ini merah.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.join(process.cwd(), 'app/api/cron/fundamental-snapshot/route.ts');
    const source = fs.readFileSync(file, 'utf8');

    // Buang komentar dulu - berkas ini menjelaskan bugnya dengan menulis pola yang
    // dilarang di dalam prosa. Tanpa ini, gerbangnya menghitung penjelasan sebagai
    // pelanggaran.
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');

    expect(stripped).toContain('correctPbvForUsdReporter');
    expect(stripped).not.toMatch(/pbv:\s*qs\?\.defaultKeyStatistics\?\.priceToBook/);
  });
});
