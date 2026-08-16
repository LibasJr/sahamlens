import { describe, expect, it } from 'vitest';
import { parseNumericToken, parsePercentageToken, roundTo } from '../number-normalize';

// Kelas bug yang diuji di sini nyata dan senyap: parseFloat("42,31") mengembalikan
// 42 tanpa error, dan parseFloat("1,234,567") mengembalikan 1. Keduanya menghasilkan
// angka yang "kelihatan wajar" - tanpa test ini, satu-satunya cara menemukannya
// adalah menyadari bahwa kepemilikan asing sebuah emiten tiba-tiba jadi 1 lembar.

describe('parseNumericToken - desimal', () => {
  it('membaca titik desimal gaya internasional', () => {
    expect(parseNumericToken('42.31')).toBe(42.31);
  });

  it('membaca koma desimal gaya Indonesia', () => {
    expect(parseNumericToken('42,31')).toBe(42.31);
  });

  it('membuang simbol persen', () => {
    expect(parseNumericToken('42.31%')).toBe(42.31);
    expect(parseNumericToken('42,31 %')).toBe(42.31);
  });
});

describe('parseNumericToken - pemisah ribuan', () => {
  it('membaca koma ribuan', () => {
    expect(parseNumericToken('1,234,567')).toBe(1234567);
  });

  it('membaca titik ribuan', () => {
    expect(parseNumericToken('1.234.567')).toBe(1234567);
  });

  it('membaca campuran titik ribuan + koma desimal', () => {
    expect(parseNumericToken('1.234.567,89')).toBe(1234567.89);
  });

  it('membaca campuran koma ribuan + titik desimal', () => {
    expect(parseNumericToken('1,234,567.89')).toBe(1234567.89);
  });

  it('memperlakukan grup 3 digit tunggal sebagai ribuan', () => {
    expect(parseNumericToken('1,234')).toBe(1234);
    expect(parseNumericToken('1.234')).toBe(1234);
  });

  it('memperlakukan grup non-3-digit sebagai desimal', () => {
    expect(parseNumericToken('1,2345')).toBe(1.2345);
    expect(parseNumericToken('42,31')).toBe(42.31);
  });
});

describe('parseNumericToken - nilai kosong', () => {
  // Token-token ini berarti "sumber tidak menyediakan angka", BUKAN nol.
  it.each(['-', '--', '', '   ', 'N/A', 'n/a', 'NULL', '#N/A'])('mengembalikan null untuk %j', (token) => {
    expect(parseNumericToken(token)).toBeNull();
  });

  it('mengembalikan null untuk null/undefined', () => {
    expect(parseNumericToken(null)).toBeNull();
    expect(parseNumericToken(undefined)).toBeNull();
  });

  it('TIDAK PERNAH mengubah nilai kosong menjadi 0', () => {
    expect(parseNumericToken('-')).not.toBe(0);
  });
});

describe('parseNumericToken - token cacat', () => {
  it.each(['abc', '12abc', 'Rp1.000', '4.2.3.1,5,6', '..', ',', '1,23,45'])(
    'menolak %j',
    (token) => {
      expect(parseNumericToken(token)).toBeNull();
    }
  );
});

describe('parseNumericToken - tanda negatif', () => {
  it('membaca minus di depan', () => {
    expect(parseNumericToken('-1.234')).toBe(-1234);
    expect(parseNumericToken('-0,25')).toBe(-0.25);
  });

  it('membaca kurung sebagai negatif (konvensi akuntansi)', () => {
    expect(parseNumericToken('(1.234)')).toBe(-1234);
  });
});

describe('parsePercentageToken', () => {
  it('menerima persentase dalam rentang', () => {
    expect(parsePercentageToken('42.31%')).toBe(42.31);
    expect(parsePercentageToken('0')).toBe(0);
    expect(parsePercentageToken('100')).toBe(100);
  });

  it('MENOLAK di luar 0-100, tidak meng-clamp', () => {
    // 145% harus null. Kalau ia di-clamp ke 100, database akan berisi angka yang
    // tidak pernah diterbitkan sumber mana pun dan tidak bisa dibedakan lagi.
    expect(parsePercentageToken('145%')).toBeNull();
    expect(parsePercentageToken('-5')).toBeNull();
    expect(parsePercentageToken('100.01')).toBeNull();
  });
});

describe('roundTo', () => {
  it('membulatkan tanpa galat biner', () => {
    expect(roundTo(0.1 + 0.2, 2)).toBe(0.3);
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-0.5149, 2)).toBe(-0.51);
  });
});
