import { describe, expect, it } from 'vitest';

import { pilihBaris } from '../MarketTicker';

/**
 * Ticker beranda pernah menghilang total tanpa error apa pun. Penyebabnya bukan di
 * komponen: /api/market-summary disajikan dari Redis dengan TTL cron 3 hari, jadi saat
 * `changePct` mulai dikirim di `topValue`, payload yang tersaji masih versi lama tanpa
 * field itu - dan setiap barisnya tersaring habis.
 *
 * Kegagalan seperti ini tidak melempar dan tidak tercatat di log; satu-satunya gejalanya
 * adalah ruang kosong. Karena itu diperiksa di sini, bukan diandalkan pada ingatan.
 */

const baris = (symbol: string, price: number, changePct: number | null) => ({ symbol, price, changePct });

describe('pilihBaris - sumber baris ticker', () => {
  it('memakai topValue saat payload-nya lengkap', () => {
    const hasil = pilihBaris({
      topValue: [baris('BBCA', 9725, 1.3), baris('BBRI', 4820, -0.4)],
      topGainers: [baris('APEX', 192, 10.34)],
      topLosers: [baris('TCPI', 2690, -12.09)],
    });

    expect(hasil.map((r) => r.symbol)).toEqual(['BBCA', 'BBRI']);
  });

  it('jatuh ke gainers/losers saat topValue versi cache lama tidak punya changePct', () => {
    // Bentuk persis yang tersaji di produksi 2026-08-20 dari cache berumur 12,9 jam.
    const hasil = pilihBaris({
      topValue: [
        { symbol: 'DSSA', value: 478406552000, price: 1040, partial: false },
        { symbol: 'INET', value: 481165200000, price: 288, partial: false },
      ],
      topGainers: [baris('APEX', 192, 10.34)],
      topLosers: [baris('TCPI', 2690, -12.09)],
    });

    // Yang penting: TIDAK kosong. Kosong berarti ticker hilang dari layar.
    expect(hasil.length).toBeGreaterThan(0);
    expect(hasil.map((r) => r.symbol)).toEqual(['APEX', 'TCPI']);
  });

  it('menyelang-seling naik dan turun, bukan menyambung dua daftar', () => {
    const hasil = pilihBaris({
      topValue: [],
      topGainers: [baris('A', 100, 5), baris('B', 100, 4)],
      topLosers: [baris('Y', 100, -5), baris('Z', 100, -4)],
    });

    expect(hasil.map((r) => r.symbol)).toEqual(['A', 'Y', 'B', 'Z']);
  });

  it('membuang baris tanpa changePct, tetapi MEMPERTAHANKAN yang nol', () => {
    // Nol adalah data sah - "tidak bergerak". null berarti "tidak diketahui", dan itu
    // tidak boleh ditampilkan sebagai 0%.
    const hasil = pilihBaris({
      topValue: [baris('AAA', 100, 0), baris('BBB', 100, null), baris('CCC', 0, 1)],
    });

    expect(hasil.map((r) => r.symbol)).toEqual(['AAA']);
    expect(hasil[0]!.changePct).toBe(0);
  });

  it('mengembalikan array kosong, bukan melempar, saat payload tidak berbentuk', () => {
    expect(pilihBaris(null)).toEqual([]);
    expect(pilihBaris({})).toEqual([]);
    expect(pilihBaris({ topValue: 'bukan array' })).toEqual([]);
  });
});
