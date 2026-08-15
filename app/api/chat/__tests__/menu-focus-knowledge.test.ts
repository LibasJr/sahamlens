import { describe, expect, it } from 'vitest';
import { getFocusedMenuKnowledge } from '../menu-focus-knowledge';

describe('knowledge fokus per menu LensAI', () => {
  it('menyuntikkan panduan Backtest tanpa mencampur menu lain', () => {
    const result = getFocusedMenuKnowledge('Backtest cara pakainya bagaimana?');
    expect(result).toContain('Fokus Menu Saat Ini — Backtest');
    expect(result).toContain('Live Filter Check');
  });

  it('memilih panduan Valuation untuk pertanyaan nilai wajar', () => {
    const result = getFocusedMenuKnowledge('nilai wajar BBCA berapa?');
    expect(result).toContain('Fokus Menu Saat Ini — Valuation / DCF');
    expect(result).toContain('bukan target harga pasti');
  });

  it('mengembalikan blok kosong untuk pertanyaan yang bukan menu', () => {
    expect(getFocusedMenuKnowledge('halo apa kabar?')).toBe('');
  });
});
