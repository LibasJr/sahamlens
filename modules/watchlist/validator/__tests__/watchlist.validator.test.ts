import { describe, expect, it } from 'vitest';
import { alertSchema, journalSchema } from '../watchlist.validator';

describe('alertSchema', () => {
  it('menolak alert berbasis threshold tanpa target angka', () => {
    const result = alertSchema.safeParse({
      symbol: 'BBCA.JK',
      conditionType: 'LENS_SCORE_ABOVE',
      targetValue: null,
    });

    expect(result.success).toBe(false);
  });

  it('mengizinkan alert LensScore ketika target angka tersedia', () => {
    const result = alertSchema.safeParse({
      symbol: 'BBCA.JK',
      conditionType: 'LENS_SCORE_ABOVE',
      targetValue: 75,
    });

    expect(result.success).toBe(true);
  });

  it('tetap mengizinkan alert RSI tanpa target karena threshold-nya tetap', () => {
    const result = alertSchema.safeParse({
      symbol: 'BBCA.JK',
      conditionType: 'RSI_OVERSOLD',
      targetValue: null,
    });

    expect(result.success).toBe(true);
  });
});

describe('journalSchema', () => {
  it('mengizinkan catatan thesis yang valid dengan simbol', () => {
    const result = journalSchema.safeParse({
      symbol: 'BBCA.JK',
      journal_note: 'Beli bertahap selama support 8500-8600',
    });
    expect(result.success).toBe(true);
  });

  it('mengizinkan string kosong sebagai operasi hapus catatan', () => {
    const result = journalSchema.safeParse({
      symbol: 'BBCA.JK',
      journal_note: '',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.journal_note).toBe('');
  });

  it('menolak catatan melebihi 500 karakter', () => {
    const result = journalSchema.safeParse({
      symbol: 'BBCA.JK',
      journal_note: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('menolak tanpa simbol', () => {
    const result = journalSchema.safeParse({
      journal_note: 'thesis valid tapi tanpa symbol',
    });
    expect(result.success).toBe(false);
  });
});
