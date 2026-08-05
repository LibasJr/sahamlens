import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/market/emiten-list', () => ({
  getEmitenSymbolSet: () => new Set(['BJBR', 'BBCA', 'TLKM', 'GOTO']),
}));

import { extractMentionedTicker } from '../extract-ticker';

describe('extractMentionedTicker', () => {
  it('mengenali kode saham yang ditulis huruf kecil', () => {
    expect(extractMentionedTicker('Bjbr apa benar score 82')).toBe('BJBR');
  });

  it('mengenali kode saham yang ditulis huruf besar', () => {
    expect(extractMentionedTicker('BBCA lagi uptrend gak?')).toBe('BBCA');
  });

  it('mengenali kode saham di tengah kalimat', () => {
    expect(extractMentionedTicker('menurut lu goto bagus buat swing gak')).toBe('GOTO');
  });

  it('mengabaikan kata 4 huruf yang bukan kode saham sungguhan', () => {
    expect(extractMentionedTicker('gila ini saham bagus banget')).toBeNull();
  });

  it('mengembalikan null kalau tidak ada kode saham disebut', () => {
    expect(extractMentionedTicker('IHSG hari ini gimana?')).toBeNull();
  });

  it('mengembalikan kandidat PERTAMA kalau lebih dari satu disebut', () => {
    expect(extractMentionedTicker('bandingin bjbr sama bbca dong')).toBe('BJBR');
  });
});
