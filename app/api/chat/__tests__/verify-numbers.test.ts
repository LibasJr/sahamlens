import { describe, expect, it } from 'vitest';
import { parseLooseNumber, verifyAnswerNumbers } from '../verify-numbers';

/**
 * Lapisan ini menuduh model mengarang, jadi ambang salah-tuduhnya harus rendah:
 * satu peringatan palsu yang muncul di jawaban benar akan membuat pengguna berhenti
 * mempercayai peringatan itu sama sekali. Karena itu blok "tidak boleh salah tuduh"
 * di bawah sama pentingnya dengan blok "harus menangkap".
 */

const DATA_BLOCK = `
## Data Terverifikasi Server (OTORITATIF):
- Harga terakhir: 9750.00
- RSI 14: 62.34
- Perubahan: -1.52 poin (-1.52%)
- Nilai transaksi: 1.234.567.890
`;

describe('parseLooseNumber menangani dua konvensi angka sekaligus', () => {
  it.each([
    ['9750.00', 9750],
    ['62.34', 62.34],
    ['-1.52', -1.52],
    ['1.234.567', 1234567],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
  ])('%s -> %s', (raw, expected) => {
    expect(parseLooseNumber(raw)).toBeCloseTo(expected, 4);
  });

  it('tiga digit setelah pemisah terakhir dibaca sebagai ribuan, bukan desimal', () => {
    // toLocaleString('id-ID') menghasilkan bentuk ini di blok data - salah baca di sini
    // membuat nilai transaksi miliaran dikira angka satuan.
    expect(parseLooseNumber('1.234')).toBe(1234);
  });
});

describe('menangkap angka yang tidak ada di data', () => {
  it('menandai harga karangan', () => {
    const result = verifyAnswerNumbers('Harganya sekarang di 8250.00 dan menarik.', [DATA_BLOCK]);
    expect(result.ok).toBe(false);
    expect(result.unverified).toContain('8250.00');
  });

  it('menandai persentase karangan - kasus nyata yang memicu aturan #21', () => {
    // Kejadian aslinya: model menjawab "turun sekitar 0,25%" sementara header aplikasi
    // menampilkan -1,52% dari sumber yang sama.
    const result = verifyAnswerNumbers('IHSG turun sekitar 0,25% hari ini.', [DATA_BLOCK]);
    expect(result.ok).toBe(false);
  });
});

describe('tidak boleh salah tuduh', () => {
  it('menerima angka yang sama persis dari data', () => {
    const result = verifyAnswerNumbers('RSI-nya 62.34 dan harga 9750.00.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
  });

  it('menerima pembulatan yang wajar', () => {
    const result = verifyAnswerNumbers('RSI-nya sekitar 62,3.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
  });

  it('menerima nilai transaksi berformat Indonesia', () => {
    const result = verifyAnswerNumbers('Nilai transaksinya 1.234.567.890.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
  });

  it('mengabaikan angka bulat kecil - itu hitungan/urutan, bukan klaim data', () => {
    const result = verifyAnswerNumbers('Ada 3 dari 5 indikator yang bullish, horizon 20 hari.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
  });

  it('mengabaikan tahun', () => {
    const result = verifyAnswerNumbers('Data ini sejak 2025 sampai 2026.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
  });

  it('menerima angka yang ditulis pengguna sendiri di pertanyaannya', () => {
    // "anggap PER-nya 7,5" - angka milik pengguna, sah dipakai dalam jawaban.
    const result = verifyAnswerNumbers('Kalau PER 7,5 seperti yang kamu sebut, maka...', [
      DATA_BLOCK,
      'anggap PER-nya 7,5 ya',
    ]);
    expect(result.ok).toBe(true);
  });

  it('tidak memeriksa apa pun kalau jawabannya memang tanpa angka', () => {
    const result = verifyAnswerNumbers('Datanya belum tersedia, jadi saya belum bisa menyimpulkan.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });
});
