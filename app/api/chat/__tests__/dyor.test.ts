import { describe, expect, it } from 'vitest';
import { withDyor, shouldAppendDyor, DYOR_NOTICE } from '../dyor';

describe('penutup DYOR', () => {
  it.each([
    'VALUATION',
    'BUY_SELL_RECOMMENDATION',
    'PRICE_PREDICTION',
  ])('%s - jawaban bernuansa keputusan investasi ditutup DYOR', (intent) => {
    expect(shouldAppendDyor(intent as any)).toBe(true);
    expect(withDyor('Ringkasannya begini.', intent as any)).toContain('DYOR');
  });

  it.each([
    'SMALL_TALK',
    'OUT_OF_SCOPE',
    'SAHAMLENS_PRODUCT_HELP',
    'UNKNOWN',
    'STOCK_GENERAL',
    'FUNDAMENTAL_CURRENT',
    'TECHNICAL_CURRENT',
    'MARKET_GENERAL',
    'MARKET_MOVERS',
    'LENSRADAR_PICKS',
    'PORTFOLIO',
  ])(
    '%s - jawaban informatif biasa tidak ditempeli DYOR',
    (intent) => {
      // Penafian yang muncul di mana-mana melatih pengguna berhenti membacanya, dan itu
      // justru melemahkannya di tempat yang benar-benar penting.
      expect(withDyor('Halo! Ada yang bisa dibantu?', intent as any)).not.toContain('DYOR');
    },
  );

  it('tidak menempel dua kali kalau model sudah menulis DYOR sendiri', () => {
    const answer = 'Analisisnya begini. Ingat DYOR ya.';
    expect(withDyor(answer, 'FUNDAMENTAL_CURRENT' as any)).toBe(answer);
  });

  it('ditempel di akhir, bukan menyisip di tengah jawaban', () => {
    const result = withDyor('Baris pertama.\n\nBaris kedua.', 'VALUATION' as any);
    expect(result.endsWith(DYOR_NOTICE)).toBe(true);
  });
});
