import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/market/emiten-list', () => ({
  getEmitenSymbolSet: () => new Set([
    'BJBR', 'BBCA', 'TLKM', 'GOTO', 'ADRO', 'PTBA', 'BBRI', 'BMRI', 'BREN', 'DGWG', 'ANTM',
  ]),
}));

import { extractMentionedTicker, extractMentionedTickers, resolveConversationTickers } from '../extract-ticker';

describe('extractMentionedTicker', () => {
  it('mengenali ticker lintas karakteristik emiten lewat satu pipeline generik', () => {
    for (const ticker of ['BBCA', 'ADRO', 'BREN', 'TLKM', 'DGWG', 'ANTM']) {
      expect(extractMentionedTicker(`${ticker} gimana?`)).toBe(ticker);
    }
  });

  it('mengenali beberapa ticker sekaligus', () => {
    expect(extractMentionedTickers('BBRI dibanding BMRI dan BBCA')).toEqual(['BBRI', 'BMRI', 'BBCA']);
  });

  it('mengabaikan kata 4 huruf yang bukan kode saham sungguhan dan indeks', () => {
    expect(extractMentionedTicker('gila ini saham bagus banget')).toBeNull();
    expect(extractMentionedTicker('IHSG hari ini gimana?')).toBeNull();
  });

  it('follow-up pronoun mempertahankan ticker sebelumnya', () => {
    const tickers = resolveConversationTickers({
      prompt: 'kenapa ROE-nya kecil?',
      history: [{ role: 'user', content: 'ADRO fundamentalnya gimana?' }],
    });
    expect(tickers).toEqual(['ADRO']);
  });

  it('follow-up comparison menambahkan ticker baru ke ticker sebelumnya', () => {
    const tickers = resolveConversationTickers({
      prompt: 'kalau dibanding PTBA?',
      history: [{ role: 'user', content: 'ADRO fundamentalnya gimana?' }],
    });
    expect(tickers).toEqual(['ADRO', 'PTBA']);
  });

  it('follow-up scope mempertahankan dua ticker comparison', () => {
    const tickers = resolveConversationTickers({
      prompt: 'kalau fundamentalnya saja?',
      history: [{ role: 'user', content: 'BBRI dibanding BMRI gimana?' }],
    });
    expect(tickers).toEqual(['BBRI', 'BMRI']);
  });
});
