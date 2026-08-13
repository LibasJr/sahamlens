import { describe, expect, it } from 'vitest';
import { classifyChatIntent } from '../chat-intent';
import { resolveChatDate } from '../chat-date';

function classify(prompt: string, tickerCount = 0, history: any[] = []) {
  return classifyChatIntent({
    prompt,
    date: resolveChatDate(prompt, history),
    tickerCount,
    hasHistory: history.length > 0,
    history,
  });
}

describe('satu pertanyaan, beberapa topik', () => {
  it('fundamental + berita dikirim dua-duanya', () => {
    // Sebelumnya topik kedua hilang tanpa jejak: LensAI menjawab fundamentalnya lalu
    // bilang tidak punya data berita, padahal datanya ada dan cuma tidak diminta router.
    const result = classify('fundamental BBCA gimana, ada berita apa?', 1);
    expect(result.dataIntent).toBe('NEWS_SENTIMENT');
    expect(result.alsoIntents).toContain('FUNDAMENTAL_CURRENT');
  });

  it('sektor + indeks dikirim dua-duanya', () => {
    const result = classify('IHSG hari ini gimana, sektor apa yang kuat?');
    expect(result.dataIntent).toBe('SECTOR_ROTATION');
    expect(result.alsoIntents).toContain('MARKET_GENERAL');
  });

  it('pertanyaan sektor saja TIDAK menyeret fetch indeks yang tidak diminta', () => {
    // MARKET_TERMS ikut memuat kata "sektor"; kalau dipakai sebagai pemicu topik
    // tambahan, setiap pertanyaan sektor akan menambah satu fetch IHSG percuma.
    expect(classify('sektor apa yang lagi kuat?').alsoIntents).not.toContain('MARKET_GENERAL');
  });

  it('topik tambahan tidak pernah menggandakan intent utama', () => {
    const result = classify('berita BBCA apa?', 1);
    expect(result.alsoIntents).not.toContain(result.dataIntent);
  });

  it('dibatasi maksimal dua topik tambahan supaya prompt tidak membengkak', () => {
    const result = classify('BBCA fundamental, teknikal, dividen, berita, dan betanya gimana?', 1);
    expect(result.alsoIntents.length).toBeLessThanOrEqual(2);
  });

  it('small talk dan di luar ranah tidak pernah menyeret blok data', () => {
    expect(classify('resep rendang dong').alsoIntents).toEqual([]);
  });
});

describe('pertanyaan terlalu kabur ditanya balik', () => {
  it.each(['gimana?', 'terus gimana', 'kok gitu'])('%s -> minta penjelasan', (prompt) => {
    expect(classify(prompt).needsClarification).toBe(true);
  });

  it('tidak bertanya balik kalau ada emiten yang jelas', () => {
    expect(classify('BBCA gimana?', 1).needsClarification).toBeUndefined();
  });

  it('tidak bertanya balik kalau ada riwayat - itu tugas FOLLOW_UP', () => {
    const history = [{ role: 'user', content: 'fundamental BBCA gimana?' }];
    expect(classify('kenapa?', 1, history).needsClarification).toBeUndefined();
  });

  it('tidak bertanya balik untuk pertanyaan konsep', () => {
    expect(classify('apa itu RSI?').needsClarification).toBeUndefined();
  });
});
