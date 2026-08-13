import { describe, expect, it } from 'vitest';
import { classifyChatIntent } from '../chat-intent';
import { resolveChatDate } from '../chat-date';

/**
 * Cakupan intent seluruh fitur aplikasi (2026-08-13).
 *
 * Setiap baris di sini mewakili pertanyaan yang SEBELUMNYA jatuh ke UNKNOWN - artinya
 * nol data terverifikasi, dan karena system prompt melarang menjawab dari ingatan model,
 * LensAI wajib menolaknya. Yang diuji bukan "regex-nya cocok", tapi bahwa pertanyaan
 * wajar dari pengguna benar-benar sampai ke jalur data yang tepat.
 */
function classify(prompt: string, tickerCount = 0, history: any[] = []) {
  return classifyChatIntent({
    prompt,
    date: resolveChatDate(prompt, history),
    tickerCount,
    hasHistory: history.length > 0,
    history,
  });
}

describe('cakupan intent: pertanyaan pasar tanpa emiten', () => {
  it.each([
    ['saham apa yang lagi bagus?', 'LENSRADAR_PICKS'],
    ['rekomendasi hari ini dong', 'LENSRADAR_PICKS'],
    ['LensRadar hari ini isinya apa?', 'LENSRADAR_PICKS'],
    ['top gainer hari ini apa?', 'MARKET_MOVERS'],
    ['saham apa yang paling aktif hari ini', 'MARKET_MOVERS'],
    ['ada yang oversold gak?', 'MARKET_MOVERS'],
    ['sektor apa yang lagi kuat?', 'SECTOR_ROTATION'],
    ['breadth pasar gimana?', 'SECTOR_ROTATION'],
    ['inflasi terakhir berapa?', 'MACRO'],
    ['BI rate sekarang berapa?', 'MACRO'],
    ['screener profil agresif hasilnya apa?', 'SCREENER'],
  ])('%s -> %s', (prompt, expected) => {
    expect(classify(prompt).intent).toBe(expected);
  });

  it('pertanyaan pasar dibatalkan kalau pengguna menyebut emiten', () => {
    // "top gainer" + kode emiten hampir selalu berarti "gimana si emiten ini", bukan
    // permintaan daftar peringkat pasar.
    expect(classify('BBCA masuk top gainer gak?', 1).intent).not.toBe('MARKET_MOVERS');
  });
});

describe('cakupan intent: metodologi scoring', () => {
  it.each([
    'cara nentuin scoring gimana?',
    'LensScore dihitung dari mana?',
    'gimana cara menentukan skor saham di sini?',
    'rumus skornya apa?',
  ])('%s -> SCORING_METHOD', (prompt) => {
    expect(classify(prompt).intent).toBe('SCORING_METHOD');
  });

  it('menang atas product help, karena butuh angka bobot yang nyata', () => {
    // 'lensscore' juga ada di PRODUCT_TERMS - urutan pemeriksaan yang menentukan.
    expect(classify('cara hitung LensScore gimana?').intent).toBe('SCORING_METHOD');
  });

  it('pertanyaan skor + emiten tetap SCORING_METHOD supaya dua-duanya dikirim', () => {
    expect(classify('kenapa skor BBCA cuma 62?', 1).intent).toBe('SCORING_METHOD');
  });
});

describe('cakupan intent: fitur per emiten', () => {
  it.each([
    ['dividen BBCA gimana?', 'DIVIDEND'],
    ['yield dividennya berapa?', 'DIVIDEND'],
    ['kapan rilis laporan keuangan berikutnya?', 'EARNINGS'],
    ['hasil kuartal terakhir beat atau miss?', 'EARNINGS'],
    ['ada jadwal RUPS gak?', 'CALENDAR'],
    ['lagi diakumulasi bandar gak?', 'FLOW_BROKER'],
    ['broker mana yang net buy?', 'FLOW_BROKER'],
    ['moat-nya kuat gak?', 'MOAT'],
    ['betanya berapa?', 'RISK_PROFILE'],
    ['volatilitasnya tinggi gak?', 'RISK_PROFILE'],
  ])('%s -> %s', (prompt, expected) => {
    expect(classify(prompt, 1).intent).toBe(expected);
  });
});

describe('cakupan intent: data milik pengguna', () => {
  it.each([
    ['portofolio saya gimana?', 'PORTFOLIO'],
    ['posisi saya lagi rugi gak?', 'PORTFOLIO'],
    ['watchlist saya ada apa aja?', 'WATCHLIST'],
  ])('%s -> %s', (prompt, expected) => {
    expect(classify(prompt).intent).toBe(expected);
  });

  it('tanpa kata milik, pertanyaannya soal FITUR - bukan isi data pribadi', () => {
    // Kalau ini salah, "watchlist itu apa" akan dijawab dengan daftar emiten pribadi.
    expect(classify('watchlist itu apa?').intent).not.toBe('WATCHLIST');
    expect(classify('fitur portofolio buat apa?').intent).not.toBe('PORTFOLIO');
  });
});

describe('pertanyaan nyeleneh dan di luar cakupan', () => {
  it.each([
    'resep rendang dong',
    'besok hujan gak ya?',
    'ramalan zodiak saya hari ini',
    'kasih nomor togel yang keluar besok',
  ])('%s -> OUT_OF_SCOPE/NON_MARKET', (prompt) => {
    const result = classify(prompt);
    expect(result.intent).toBe('OUT_OF_SCOPE');
    expect(result.outOfScopeReason).toBe('NON_MARKET');
  });

  it.each([
    'prediksi bitcoin gimana?',
    'harga emas hari ini berapa?',
    'bagusan beli reksa dana atau saham?',
    'saham Tesla lagi naik gak?',
  ])('%s -> OUT_OF_SCOPE/OUT_OF_COVERAGE', (prompt) => {
    const result = classify(prompt);
    expect(result.intent).toBe('OUT_OF_SCOPE');
    expect(result.outOfScopeReason).toBe('OUT_OF_COVERAGE');
  });

  it('pertanyaan saham IDX tidak pernah dianggap di luar cakupan', () => {
    expect(classify('BBCA gimana teknikalnya?', 1).intent).not.toBe('OUT_OF_SCOPE');
    expect(classify('IHSG hari ini gimana?').intent).not.toBe('OUT_OF_SCOPE');
  });
});

describe('follow-up mewarisi intent baru', () => {
  it('follow-up setelah pertanyaan sektor tetap membaca data sektor', () => {
    const history = [{ role: 'user', content: 'sektor apa yang lagi kuat?' }];
    const result = classify('kenapa bisa begitu?', 0, history);
    expect(result.intent).toBe('FOLLOW_UP');
    expect(result.dataIntent).toBe('SECTOR_ROTATION');
  });

  it('follow-up setelah pertanyaan LensRadar tetap membaca peringkat', () => {
    const history = [{ role: 'user', content: 'saham apa yang lagi bagus?' }];
    const result = classify('kenapa yang itu?', 0, history);
    expect(result.dataIntent).toBe('LENSRADAR_PICKS');
  });
});
