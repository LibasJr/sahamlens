import { describe, expect, it } from 'vitest';
import {
  MAX_PRICE_DEVIATION,
  maxExecutableLots,
  orderValue,
  roundToTick,
  stepPrice,
  tickSize,
  validateOrderDraft,
  type OrderDraft,
} from '../order-ticket';
import { LOT_SIZE } from '../../constants/portfolio.constants';

const draft = (over: Partial<OrderDraft> = {}): OrderDraft => ({
  type: 'BUY',
  symbol: 'BBCA.JK',
  price: 6_000,
  lots: 1,
  cash: 100_000_000,
  ownedLots: 0,
  marketPrice: 6_000,
  priceUnavailable: false,
  ...over,
});

describe('fraksi harga IDX', () => {
  it('memakai tick resmi per rentang harga', () => {
    expect(tickSize(150)).toBe(1);
    expect(tickSize(200)).toBe(2);
    expect(tickSize(499)).toBe(2);
    expect(tickSize(500)).toBe(5);
    expect(tickSize(1_999)).toBe(5);
    expect(tickSize(2_000)).toBe(10);
    expect(tickSize(4_999)).toBe(10);
    expect(tickSize(5_000)).toBe(25);
  });

  it('membulatkan ke kelipatan tick, bukan ke rupiah terdekat', () => {
    expect(roundToTick(6_003)).toBe(6_000);
    expect(roundToTick(6_013)).toBe(6_025);
    expect(roundToTick(1_002)).toBe(1_000);
  });

  it('tombol +/- melangkah satu tick dan tidak pernah menembus nol', () => {
    expect(stepPrice(6_000, 1)).toBe(6_025);
    expect(stepPrice(6_000, -1)).toBe(5_975);
    expect(stepPrice(1, -1)).toBe(1);
    expect(stepPrice(0, 1)).toBe(1);
  });
});

describe('batas lot yang bisa dieksekusi', () => {
  it('BUY dibatasi kas yang benar-benar ada', () => {
    // 10 juta / (1.000 * 100) = 100 lot, tanpa sisa pecahan lot.
    expect(maxExecutableLots({ type: 'BUY', cash: 10_000_000, price: 1_000, ownedLots: 0 })).toBe(100);
    expect(maxExecutableLots({ type: 'BUY', cash: 10_000_000, price: 6_000, ownedLots: 0 })).toBe(16);
  });

  it('BUY tanpa harga belum punya batas', () => {
    expect(maxExecutableLots({ type: 'BUY', cash: 10_000_000, price: 0, ownedLots: 0 })).toBe(0);
  });

  it('SELL dibatasi lot yang dipegang, bukan kas', () => {
    expect(maxExecutableLots({ type: 'SELL', cash: 0, price: 6_000, ownedLots: 7 })).toBe(7);
  });

  it('lot maksimum BUY selalu lolos validasi, satu lot di atasnya ditolak', () => {
    const cash = 10_000_000;
    const price = 6_000;
    const lots = maxExecutableLots({ type: 'BUY', cash, price, ownedLots: 0 });
    expect(validateOrderDraft(draft({ cash, price, lots }))).toBe('');
    expect(validateOrderDraft(draft({ cash, price, lots: lots + 1 }))).toContain('Kas tidak cukup');
  });
});

describe('nilai order', () => {
  it('dihitung per lot 100 lembar', () => {
    expect(orderValue(6_000, 2)).toBe(6_000 * 2 * LOT_SIZE);
  });
});

describe('validasi sebelum order dikirim', () => {
  it('order wajar lolos', () => {
    expect(validateOrderDraft(draft())).toBe('');
  });

  it('menolak sebelum emiten dipilih', () => {
    expect(validateOrderDraft(draft({ symbol: '  ' }))).toBe('Pilih emiten dulu.');
  });

  it('menahan order saat harga pasar tidak tersedia - server juga akan menolaknya', () => {
    expect(validateOrderDraft(draft({ priceUnavailable: true }))).toContain('belum tersedia');
  });

  it('menolak harga di luar koridor penjaga harga server', () => {
    const justOver = 6_000 * (1 + MAX_PRICE_DEVIATION) + 1;
    expect(validateOrderDraft(draft({ price: justOver }))).toContain('menyimpang');
  });

  it('menerima harga tepat di batas koridor', () => {
    // 1.350 vs 1.000 = deviasi 0,35 persis. Angka bulat sengaja dipilih: 6.000 * 1,35
    // dalam floating point adalah 8.100,000000000001 sehingga terhitung DI ATAS batas -
    // penjaga di server memakai perbandingan yang sama, jadi keduanya tetap sepakat.
    expect(validateOrderDraft(draft({ marketPrice: 1_000, price: 1_350 }))).toBe('');
  });

  it('menolak lot kosong, nol, dan pecahan', () => {
    expect(validateOrderDraft(draft({ lots: 0 }))).toBe('Jumlah lot belum diisi.');
    expect(validateOrderDraft(draft({ lots: 1.5 }))).toBe('Lot harus bilangan bulat.');
  });

  it('menolak BUY melebihi kas', () => {
    expect(validateOrderDraft(draft({ cash: 100_000, lots: 10 }))).toContain('Kas tidak cukup');
  });

  it('menolak SELL melebihi lot yang dipegang', () => {
    expect(validateOrderDraft(draft({ type: 'SELL', lots: 5, ownedLots: 2 }))).toContain('melebihi kepemilikan');
  });

  it('pesan menyebut kode emiten polos, bukan simbol bersufiks sumber data', () => {
    expect(validateOrderDraft(draft({ type: 'SELL', lots: 5, ownedLots: 2 }))).toContain('2 lot BBCA.');
    expect(validateOrderDraft(draft({ priceUnavailable: true }))).toContain('Harga pasar BBCA belum tersedia');
  });

  it('SELL tidak dibatasi kas', () => {
    expect(validateOrderDraft(draft({ type: 'SELL', cash: 0, lots: 2, ownedLots: 2 }))).toBe('');
  });
});
