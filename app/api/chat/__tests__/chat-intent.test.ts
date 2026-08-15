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

  it.each([
    'berapa nilai intrinsik BBCA?',
    'nilai intrinsic BBRI berapa?',
    'nilai intrisik BMRI dong',
    'nilai intric TLKM',
    'nilai intirisih BBCA berapa?',
    'nilai intrinsih BBRI berapa?',
    'nilai wajar ASII berapa?',
    'fair value UNTR berapa?',
    'DCF ASII gimana?',
  ])('pertanyaan nilai intrinsik masuk valuasi data, bukan product help: %s', (prompt) => {
    const result = classify(prompt, 1);
    expect(result.intent).toBe('VALUATION');
    expect(result.dataIntent).toBe('VALUATION');
  });

  it('comparison dideteksi tanpa special-case ticker', () => {
    expect(classify('BBRI dibanding BMRI gimana?', 2).intent).toBe('COMPARE_STOCKS');
    expect(classify('BBRI dibanding BMRI fundamentalnya saja?', 2).compareScope).toBe('FUNDAMENTAL');
  });
  it('mengenali pertanyaan cara perhitungan TP/CL sebagai product help', () => {
    expect(classify('cara TP/CL dihitung?').intent).toBe('SAHAMLENS_PRODUCT_HELP');
  });

  // BARU (2026-08-14, permintaan pengguna: "Ask AI harus serba bisa jawab soal
  // aplikasinya sendiri") - PRODUCT_TERMS diperluas mencakup fitur yang sebelumnya
  // tidak dikenali sama sekali (jatuh ke UNKNOWN/CONCEPT_QUERY generik tanpa konteks
  // fitur SahamLens yang sebenarnya).
  it.each([
    ['DCF di SahamLens itu apa?', 'SAHAMLENS_PRODUCT_HELP'],
    ['apa itu intrinsic value di aplikasi ini?', 'SAHAMLENS_PRODUCT_HELP'],
    ['fitur compare itu buat apa?', 'SAHAMLENS_PRODUCT_HELP'],
    ['multi-agent itu apa?', 'SAHAMLENS_PRODUCT_HELP'],
    ['apa itu blue chip di SahamLens?', 'SAHAMLENS_PRODUCT_HELP'],
    ['LensConsensus itu apa?', 'SAHAMLENS_PRODUCT_HELP'],
    ['portofolio itu fitur apa?', 'SAHAMLENS_PRODUCT_HELP'],
    ['menu earnings fungsinya apa?', 'SAHAMLENS_PRODUCT_HELP'],
    ['jelaskan fitur macro', 'SAHAMLENS_PRODUCT_HELP'],
    ['moat itu apa di SahamLens?', 'SAHAMLENS_PRODUCT_HELP'],
    ['risk calculator buat apa?', 'SAHAMLENS_PRODUCT_HELP'],
  ])('%s -> %s', (prompt, expected) => {
    expect(classify(prompt, 0).intent).toBe(expected);
  });

  it.each([
    'fungsi menu Beranda apa?',
    'cara pakai LensMarket gimana?',
    'fungsi LensRadar apa?',
    'menu LensTechnical untuk apa?',
    'cara pakai LensScanner gimana?',
    'fungsi Compare apa?',
    'Backtest cara pakainya bagaimana?',
    'fungsi LensFundamental apa?',
    'menu Valuation untuk apa?',
    'cara pakai Dividend gimana?',
    'LensWatch itu menu apa?',
    'fungsi Akun Demo apa?',
    'Risk Matrix gunanya apa?',
    'menu News & Sentiment apa?',
    'Corporate Calendar cara pakainya gimana?',
    'fungsi Transparansi apa?',
    'Tentang SahamLens itu apa?',
    'Pattern fungsinya apa?',
  ])('pertanyaan fungsi/cara pakai menu tidak meminta ticker: %s', (prompt) => {
    expect(classify(prompt, 0).intent).toBe('SAHAMLENS_PRODUCT_HELP');
  });

  // Kebalikan penting: "portofolio SAYA" (dengan kata milik) tetap harus jatuh ke
  // intent PORTFOLIO (data pribadi), bukan ikut tersapu penambahan "portofolio" polos
  // ke PRODUCT_TERMS di atas - PORTFOLIO_TERMS diperiksa lebih dulu di classifier.
  it('kata milik tetap memenangkan intent data pribadi, bukan product help', () => {
    expect(classify('portofolio saya gimana?', 0).intent).toBe('PORTFOLIO');
    expect(classify('watchlist saya kosong ya?', 0).intent).toBe('WATCHLIST');
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
