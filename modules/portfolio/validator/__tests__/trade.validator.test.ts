import { describe, expect, it } from 'vitest';
import { createTransactionSchema, tradeSchema } from '../trade.validator';

const base = { price: 6_000, lots: 1, note: 'Manual BUY' };

// Tanpa normalisasi, "BBCA" dan "BBCA.JK" tersimpan sebagai DUA baris holdings untuk
// emiten yang sama: penjaga harga memvalidasi BBCA.JK, tapi yang tercatat `BBCA`,
// sehingga posisinya terpecah dan lot yang mau dijual tidak ketemu.
describe('normalisasi simbol pada input transaksi', () => {
  it('menambahkan sufiks .JK saat kode dikirim polos', () => {
    expect(tradeSchema.parse({ ...base, symbol: 'BBCA' }).symbol).toBe('BBCA.JK');
  });

  it('membiarkan simbol yang sudah bersufiks', () => {
    expect(tradeSchema.parse({ ...base, symbol: 'BBCA.JK' }).symbol).toBe('BBCA.JK');
  });

  it('merapikan huruf kecil dan spasi berlebih', () => {
    expect(tradeSchema.parse({ ...base, symbol: '  bbca ' }).symbol).toBe('BBCA.JK');
  });

  it('kode polos dan bersufiks menghasilkan simbol yang sama persis', () => {
    expect(tradeSchema.parse({ ...base, symbol: 'antm' }).symbol)
      .toBe(tradeSchema.parse({ ...base, symbol: 'ANTM.JK' }).symbol);
  });

  it('berlaku juga untuk endpoint /v1/transactions', () => {
    expect(createTransactionSchema.parse({ ...base, symbol: 'tlkm', type: 'SELL' }).symbol).toBe('TLKM.JK');
  });

  it('simbol kosong tetap ditolak', () => {
    expect(tradeSchema.safeParse({ ...base, symbol: '' }).success).toBe(false);
  });
});
