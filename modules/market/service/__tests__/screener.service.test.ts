import { describe, it, expect } from 'vitest';
import { atr14Pct, filterCurated, rankScreener } from '../screener.service';

/** Bar dengan range harian tetap `range` dan close tetap `close`.
 * True Range tiap hari = max(high-low, |high-prevClose|, |low-prevClose|) = range,
 * karena prevClose selalu sama dengan close hari ini. Jadi ATR = range. */
function flatBars(count: number, close: number, range: number) {
  return Array.from({ length: count }, () => ({
    high: close + range / 2,
    low: close - range / 2,
    close,
  }));
}

describe('atr14Pct', () => {
  it('menghitung ATR sebagai persen dari harga terakhir', () => {
    // range 40 pada harga 1000 -> ATR 40 -> 4% dari harga
    const bars = flatBars(20, 1000, 40);

    expect(atr14Pct(bars)).toBeCloseTo(4, 1);
  });

  it('mengembalikan null kalau bar kurang dari 15', () => {
    expect(atr14Pct(flatBars(14, 1000, 40))).toBeNull();
  });

  it('mengembalikan null untuk array kosong, bukan melempar error', () => {
    expect(atr14Pct([])).toBeNull();
  });

  it('mengembalikan null kalau harga terakhir nol - tidak membagi nol', () => {
    expect(atr14Pct(flatBars(20, 0, 10))).toBeNull();
  });
});

describe('filterCurated', () => {
  it('membuang saham yang tidak lolos standar kualitas', () => {
    const stocks = [
      { ticker: 'BBCA' }, { ticker: 'GOTO' }, { ticker: 'ZZZZ' },
      { ticker: 'MEGA' }, { ticker: 'BYAN' }, { ticker: 'SILO' },
    ];

    expect(filterCurated(stocks).map((s) => s.ticker)).toEqual(['BBCA']);
  });

  it('mempertahankan saham yang ada di daftar tersaring', () => {
    const stocks = [{ ticker: 'BBCA' }, { ticker: 'TLKM' }, { ticker: 'ANTM' }];

    expect(filterCurated(stocks)).toHaveLength(3);
  });

  it('mencocokkan ticker tanpa akhiran .JK - RawStock menyimpannya sudah dibuang', () => {
    expect(filterCurated([{ ticker: 'BBCA' }])).toHaveLength(1);
    expect(filterCurated([{ ticker: 'BBCA.JK' }])).toHaveLength(1);
  });

  it('array kosong menghasilkan array kosong, bukan error', () => {
    expect(filterCurated([])).toEqual([]);
  });
});

function rawStock(ticker: string, over: Record<string, unknown> = {}) {
  return {
    ticker,
    name: `PT ${ticker}`,
    sector: 'Keuangan',
    price: 1000,
    per: 15,
    roe: 18,
    der: 0.4,
    div_yield: 3,
    rev_growth: 10,
    gross_margin: 45,
    vol_ratio: 1.2,
    bandarmology_status: 'NEUTRAL' as const,
    fifty_two_week_low: 800,
    fifty_two_week_high: 1200,
    atr_pct: 3.5,
    market_cap: 100_000_000_000_000,
    adv20_idr: 10_000_000_000,
    ...over,
  };
}

describe('rankScreener', () => {
  it('tidak pernah mengembalikan saham di luar daftar tersaring', () => {
    const universe = [rawStock('BBCA'), rawStock('GOTO'), rawStock('ZZZZ'), rawStock('TLKM')];

    const result = rankScreener(universe as any, 'Moderat');

    expect(result.map((r) => r.ticker).sort()).toEqual(['BBCA', 'TLKM']);
  });

  it('mengembalikan array kosong kalau seluruh universe tersaring habis', () => {
    const universe = [rawStock('GOTO'), rawStock('ZZZZ'), rawStock('MEGA')];

    expect(rankScreener(universe as any, 'Moderat')).toEqual([]);
  });

  it('meneruskan atr_pct ke hasil dan tidak lagi memuat stop_loss', () => {
    const result = rankScreener([rawStock('BBCA', { atr_pct: 4.2 })] as any, 'Moderat');

    expect(result[0].atr_pct).toBe(4.2);
    expect(result[0]).not.toHaveProperty('stop_loss');
  });

  it('atr_pct null diteruskan apa adanya, tidak diganti angka lain', () => {
    const result = rankScreener([rawStock('BBCA', { atr_pct: null })] as any, 'Moderat');

    expect(result[0].atr_pct).toBeNull();
  });

  it('profil agresif tidak lagi menganggap volume distribusi sebagai momentum positif', () => {
    const universe = [
      rawStock('BBCA', { vol_ratio: 2, bandarmology_status: 'BEARISH' }),
      rawStock('TLKM', { vol_ratio: 2, bandarmology_status: 'BULLISH' }),
    ];

    const result = rankScreener(universe as any, 'Agresif');

    expect(result[0].ticker).toBe('TLKM');
  });

  // BARU (2026-08-14, masukan review eksternal - filter Sektor & Harga di LensScanner).
  describe('filter sektor & harga', () => {
    it('sector menyaring hanya saham dari sektor itu', () => {
      const universe = [
        rawStock('BBCA', { sector: 'Keuangan' }),
        rawStock('TLKM', { sector: 'Infrastruktur' }),
      ];

      const result = rankScreener(universe as any, 'Moderat', { sector: 'Infrastruktur' });

      expect(result.map((r) => r.ticker)).toEqual(['TLKM']);
    });

    it('sector dicocokkan case-insensitive', () => {
      const universe = [rawStock('BBCA', { sector: 'Keuangan' })];

      const result = rankScreener(universe as any, 'Moderat', { sector: 'keuangan' });

      expect(result).toHaveLength(1);
    });

    it('maxPrice membuang saham di atas batas', () => {
      const universe = [
        rawStock('BBCA', { price: 9000 }),
        rawStock('TLKM', { price: 3000 }),
      ];

      const result = rankScreener(universe as any, 'Moderat', { maxPrice: 5000 });

      expect(result.map((r) => r.ticker)).toEqual(['TLKM']);
    });

    it('maxPrice tidak valid (negatif/NaN) diabaikan, bukan membuang semua saham', () => {
      const universe = [rawStock('BBCA', { price: 9000 })];

      expect(rankScreener(universe as any, 'Moderat', { maxPrice: -1 })).toHaveLength(1);
      expect(rankScreener(universe as any, 'Moderat', { maxPrice: NaN })).toHaveLength(1);
    });

    it('sector dan maxPrice bisa dipakai bersamaan', () => {
      const universe = [
        rawStock('BBCA', { sector: 'Keuangan', price: 9000 }),
        rawStock('BMRI', { sector: 'Keuangan', price: 3000 }),
        rawStock('TLKM', { sector: 'Infrastruktur', price: 3000 }),
      ];

      const result = rankScreener(universe as any, 'Moderat', { sector: 'Keuangan', maxPrice: 5000 });

      expect(result.map((r) => r.ticker)).toEqual(['BMRI']);
    });

    it('rata-rata PER sektor (per_sector) TIDAK berubah akibat filter harga - benchmark dari universe penuh', () => {
      const universe = [
        rawStock('BBCA', { sector: 'Keuangan', price: 9000, per: 20 }),
        rawStock('BMRI', { sector: 'Keuangan', price: 3000, per: 10 }),
      ];

      const unfiltered = rankScreener(universe as any, 'Moderat');
      const filtered = rankScreener(universe as any, 'Moderat', { maxPrice: 5000 });

      const bmriUnfiltered = unfiltered.find((r) => r.ticker === 'BMRI')!;
      const bmriFiltered = filtered.find((r) => r.ticker === 'BMRI')!;
      expect(bmriFiltered.per_sector).toBe(bmriUnfiltered.per_sector);
      expect(bmriFiltered.per_sector).toBe(15); // rata-rata (20+10)/2 dari KEDUA saham
    });

    it('tanpa filter (default {}) berperilaku identik dengan sebelumnya', () => {
      const universe = [rawStock('BBCA'), rawStock('TLKM')];

      expect(rankScreener(universe as any, 'Moderat')).toEqual(rankScreener(universe as any, 'Moderat', {}));
    });
  });

  // BARU (2026-08-14) - filter Market Cap & Likuiditas, dari brainstorm lanjutan atas
  // review eksternal. Ambang & fungsi ADV20 SAMA PERSIS dengan gerbang LOW_LIQUIDITY
  // (modules/eligibility), diimpor lewat adv20() - bukan salinan rumus kedua.
  describe('filter market cap & likuiditas', () => {
    it('minMarketCap membuang saham di bawah batas', () => {
      const universe = [
        rawStock('BBCA', { market_cap: 500_000_000_000_000 }),
        rawStock('TLKM', { market_cap: 50_000_000_000_000 }),
      ];

      const result = rankScreener(universe as any, 'Moderat', { minMarketCap: 100_000_000_000_000 });

      expect(result.map((r) => r.ticker)).toEqual(['BBCA']);
    });

    it('minLiquidity membuang saham di bawah ambang ADV20', () => {
      const universe = [
        rawStock('BBCA', { adv20_idr: 5_000_000_000 }),
        rawStock('TLKM', { adv20_idr: 500_000_000 }),
      ];

      const result = rankScreener(universe as any, 'Moderat', { minLiquidity: 1_000_000_000 });

      expect(result.map((r) => r.ticker)).toEqual(['BBCA']);
    });

    it('saham tanpa data market_cap/adv20_idr (null) dibuang kalau filternya aktif - fail-closed, bukan diloloskan', () => {
      const universe = [rawStock('BBCA', { market_cap: null, adv20_idr: null })];

      expect(rankScreener(universe as any, 'Moderat', { minMarketCap: 1 })).toEqual([]);
      expect(rankScreener(universe as any, 'Moderat', { minLiquidity: 1 })).toEqual([]);
    });

    it('minMarketCap/minLiquidity tidak valid (negatif/NaN) diabaikan', () => {
      const universe = [rawStock('BBCA', { market_cap: 1000, adv20_idr: 1000 })];

      expect(rankScreener(universe as any, 'Moderat', { minMarketCap: -1 })).toHaveLength(1);
      expect(rankScreener(universe as any, 'Moderat', { minLiquidity: NaN })).toHaveLength(1);
    });

    it('market_cap & adv20_idr mentah diteruskan ke hasil (bukan diformat/dibulatkan)', () => {
      const result = rankScreener(
        [rawStock('BBCA', { market_cap: 123_456_789, adv20_idr: 987_654_321 })] as any,
        'Moderat',
      );

      expect(result[0].market_cap).toBe(123_456_789);
      expect(result[0].adv20_idr).toBe(987_654_321);
    });
  });
});
