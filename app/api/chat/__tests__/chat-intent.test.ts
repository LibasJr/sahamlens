import { describe, expect, it } from 'vitest';
import { classifyChatIntent } from '../chat-intent';
import { resolveChatDate } from '../chat-date';

function classify(prompt: string, tickerCount = 1, history: any[] = []) {
  return classifyChatIntent({
    prompt,
    date: resolveChatDate(prompt, history),
    tickerCount,
    hasHistory: history.length > 0,
    history,
  });
}

describe('LensAI intent router', () => {
  it.each([
    ['ADRO bagus gak?', 'BUY_SELL_RECOMMENDATION'],
    ['fundamental ADRO sekarang', 'FUNDAMENTAL_CURRENT'],
    ['RSI BBCA', 'TECHNICAL_CURRENT'],
    ['teknikal BBRI gimana?', 'TECHNICAL_CURRENT'],
    ['ADRO per 30 April 2025', 'FUNDAMENTAL_HISTORICAL'],
    ['analisis fundamental ADRO 2025-04-30', 'FUNDAMENTAL_HISTORICAL'],
    ['teknikal ADRO 2025-04-30', 'TECHNICAL_HISTORICAL'],
    ['PER-nya mahal gak?', 'VALUATION'],
    ['LensScore itu apa?', 'SAHAMLENS_PRODUCT_HELP'],
    ['kenapa fundamental dan teknikal bisa beda?', 'SAHAMLENS_PRODUCT_HELP'],
  ])('%s -> %s', (prompt, expected) => {
    expect(classify(prompt).intent).toBe(expected);
  });

  it('comparison dideteksi tanpa special-case ticker', () => {
    expect(classify('BBRI dibanding BMRI gimana?', 2).intent).toBe('COMPARE_STOCKS');
    expect(classify('BBRI dibanding BMRI fundamentalnya saja?', 2).compareScope).toBe('FUNDAMENTAL');
  });
  it('mengenali pertanyaan cara perhitungan TP/CL sebagai product help', () => {
    expect(classify('cara TP/CL dihitung?').intent).toBe('SAHAMLENS_PRODUCT_HELP');
  });


  it('pertanyaan konsep tanpa ticker tidak memaksa data fetch saham', () => {
    expect(classify('apa itu RSI?', 0).intent).toBe('UNKNOWN');
    expect(classify('apa itu PER?', 0).dataIntent).toBe('UNKNOWN');
  });

  it('follow-up periode data mewarisi intent sebelumnya', () => {
    const history = [{ role: 'user', content: 'ADRO fundamentalnya gimana?' }];
    const result = classify('data yang kamu pakai periode kapan?', 1, history);
    expect(result.intent).toBe('FOLLOW_UP');
    expect(result.dataIntent).toBe('FUNDAMENTAL_CURRENT');
  });

});
