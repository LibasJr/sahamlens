import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/market/emiten-list', () => ({
  getEmitenSymbolSet: () => new Set([
    'DATA', 'ADRO', 'BBRI', 'BMRI', 'BBCA', 'TLKM',
  ]),
}));

import { extractMentionedTickers, resolveConversationTickers } from '../extract-ticker';
import { classifyChatIntent } from '@/modules/ai/chat/chat-intent';

describe('DATA ticker bug — kata "data" vs emiten DATA', () => {
  it('A: extractMentionedTickers("cek data sampai watchlist") -> []', () => {
    expect(extractMentionedTickers('cek data sampai watchlist')).toEqual([]);
  });

  it('B: extractMentionedTickers("cek DATA hari ini") -> ["DATA"]', () => {
    expect(extractMentionedTickers('cek DATA hari ini')).toEqual(['DATA']);
  });

  it('C: resolveConversationTickers untuk keluhan + history workflow -> []', () => {
    const result = resolveConversationTickers({
      prompt: 'saya nanyak apa jawaban mu apa, gak sesuai',
      history: [{ role: 'user', content: 'Jelaskan alur riset saham di SahamLens dari cek data sampai pantau watchlist' }],
    });
    expect(result).toEqual([]);
  });

  it('G: variants — lowercase, sentence-case, uppercase', () => {
    expect(extractMentionedTickers('data')).toEqual([]);
    expect(extractMentionedTickers('Data')).toEqual([]);
    expect(extractMentionedTickers('DATA')).toEqual(['DATA']);
  });
});

describe('workflow intent routing', () => {
  it('E: intent workflow = SAHAMLENS_PRODUCT_HELP tanpa ticker/data fetch', () => {
    const classification = classifyChatIntent({
      prompt: 'Jelaskan alur riset saham di SahamLens dari cek data sampai pantau watchlist',
      tickerCount: 0,
      hasHistory: false,
      history: [],
    });
    expect(classification.intent).toBe('SAHAMLENS_PRODUCT_HELP');
  });

  it('F: keluhan tidak memicu fetch stock — intent tetap product help, tidak ada ticker inherit', () => {
    const classification = classifyChatIntent({
      prompt: 'saya nanyak apa jawaban mu apa, gak sesuai',
      tickerCount: 0,
      hasHistory: true,
      history: [{ role: 'user', content: 'Jelaskan alur riset saham di SahamLens dari cek data sampai pantau watchlist' }],
    });
    // Keluhan meta-correction harus tetap di product help, bukan STOCK_GENERAL
    expect(classification.intent).toBe('SAHAMLENS_PRODUCT_HELP');
  });
});
